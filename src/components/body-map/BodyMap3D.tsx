import {
  Suspense,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import AnatomyModel from './AnatomyModel';
import AvatarJourneyBackdrop from './AvatarJourneyBackdrop';
import {
  getPatientAvatarCssStyle,
  getPatientAvatarMountainElevationY,
} from '../../hooks/useGamification';
import type { BodyArea } from '../../types';
import { EMPTY_EQUIPPED_GEAR, type EquippedGearSnapshot } from '../../config/gearCatalog';

export interface BodyMap3DProps {
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  /** Therapist rehab focus — drives red materials (same as primary if omitted) */
  clinicalArea?: BodyArea;
  /** Patient self-care selections — green materials */
  selfCareSelectedAreas?: BodyArea[];
  painByArea: Partial<Record<BodyArea, number>>;
  level: number;
  /** XP toward next level — forwarded to the 3D stack (badge / future use) */
  xp?: number;
  xpForNextLevel?: number;
  /**
   * Current streak (same as `Patient.currentStreak`).
   * When >= 3: float, rim glow pulse, and post-processing bloom.
   */
  streak?: number;
  /** @deprecated Use `streak` */
  streakForGlow?: number;
  /** בונוס יומי מתרגילי «לבחירה» — מגביר זוהר/אנרגיה בפורטל בלי לשנות את מספר הרצף המוצג */
  strengthGlowBonus?: number;
  /** Muscle areas with a finish report today — gold / blue highlight */
  strengthenedAreasToday?: BodyArea[];
  /** When true, show level badge in 3D next to the head (e.g. patient portal) */
  floatingLevelBadge?: boolean;
  /**
   * When true (with floatingLevelBadge), level/XP badge is hidden until hover on the avatar area.
   */
  levelBadgeRevealOnHover?: boolean;
  /** Scale of the avatar rig inside the canvas (e.g. 0.9 for more margin). */
  avatarScale?: number;
  selectedArea?: BodyArea | null;
  onAreaClick?: (area: BodyArea) => void;
  /** גובה מינימלי לפריים full-body (ברירת מחדל 640). מתחת לכך הגוף נחתך. */
  minHeightPx?: number;
  /** ציוד מעוגן אנטומית — מטופל; דשבורד מטפל משאיר ריק */
  equippedGear?: EquippedGearSnapshot;
  /** מקטעים להדגשת פגיעה (אדום) */
  injuryHighlightSegments?: BodyArea[];
  /** מוקד משני מהמטפל (כתום) */
  secondaryClinicalBodyAreas?: BodyArea[];
  /** כבה אנימציות צף/בלום — לחיצות מדויקות */
  stableInteraction?: boolean;
  /** פורטל מטופל — סמן «אסור» על אזורי שיקום */
  patientPortalInteractive?: boolean;
  /** מכפילי נפח שריר לפי מקטע (השוואת גיבורים וכו') */
  segmentGrowthMul?: Partial<Record<BodyArea, number>>;
  /** מחלקות נוספות לעטיפת הקנבס — למשל גובה קבוע בפורטל מובייל */
  wrapperClassName?: string;
  /**
   * כבה SSAO + SMAA (פוסט-פרימיום) במכשירים חלשים.
   * ברירת מחדל: מופעל. Bloom לסטריק נשאר כשהוא רלוונטי.
   */
  disablePremiumPostProcessing?: boolean;
  /**
   * Clinical day YYYY-MM-DD — when set with `patientPortalInteractive`, a full-bleed daily scenic
   * backdrop sits behind the canvas (transparent WebGL). Updates when the clinical day changes
   * (including dev «skip day»).
   */
  dailyScenicBackgroundDayKey?: string;
  /**
   * Cumulative active days for mountain «Daily Bloom» (flowers / forest / animals) — independent of level.
   * Defaults to 1 when omitted (baseline scenery).
   */
  totalActiveDaysForScenery?: number;
}

// ── View presets ──────────────────────────────────────────────────
type ViewPreset = 'front' | 'back' | 'left' | 'right';
/** מבטים — מרחק Z + FOV מכוונים לפריים full-body במיכל אנכי צר */
const VIEW_POSITIONS: Record<ViewPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.36, 7.65),
  back: new THREE.Vector3(0, 0.36, -7.65),
  left: new THREE.Vector3(-7.65, 0.36, 0),
  right: new THREE.Vector3(7.65, 0.36, 0),
};
/** מוקד מבט — אמצע גובה הגוף; OrbitControls + CameraAnimator */
const LOOK_AT = new THREE.Vector3(0, 0.3, 0);

// ── Camera animator (lives inside Canvas) ────────────────────────
interface CameraAnimatorProps {
  targetRef: React.MutableRefObject<THREE.Vector3 | null>;
  orbitActiveRef: React.MutableRefObject<boolean>;
}
function CameraAnimator({ targetRef, orbitActiveRef }: CameraAnimatorProps) {
  const { camera } = useThree();

  useFrame(() => {
    if (!targetRef.current || orbitActiveRef.current) return;
    camera.position.lerp(targetRef.current, 0.055);
    camera.lookAt(LOOK_AT);
    if (camera.position.distanceTo(targetRef.current) < 0.015) {
      targetRef.current = null;
    }
  });

  return null;
}

/** Subtle vertical float when streak is high — reads as “energy”. */
function StreakEnergyFloat({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (enabled) {
      g.position.y = Math.sin(clock.elapsedTime * 1.55) * 0.042;
    } else {
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, 0.1);
    }
  });
  return <group ref={ref}>{children}</group>;
}

/** Pulsating rim light — pairs with bloom for streak “energy”. */
function StreakRimLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const L = ref.current;
    if (!L) return;
    L.intensity = 0.38 + Math.sin(clock.elapsedTime * 2.35) * 0.2;
  });
  return (
    <pointLight
      ref={ref}
      position={[0.52, 1.68, 0.82]}
      intensity={0.4}
      color="#b9f7fe"
      distance={3.4}
      decay={2}
    />
  );
}

// ── Studio gradient background + soft depth fog (matches medical reference) ──
function StudioGradientBackground() {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#e2e8f0');
    grd.addColorStop(0.45, '#cbd5e1');
    grd.addColorStop(1, '#94a3b8');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene]);
  return null;
}

// ── ViewToggle buttons (HTML overlay) ────────────────────────────
interface ViewToggleProps {
  activeView: ViewPreset | null;
  onSelect: (v: ViewPreset) => void;
}
const VIEW_LABELS: { id: ViewPreset; label: string }[] = [
  { id: 'front', label: 'פנים' },
  { id: 'back', label: 'גב' },
  { id: 'left', label: 'שמאל' },
  { id: 'right', label: 'ימין' },
];
function ViewToggle({ activeView, onSelect }: ViewToggleProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 38,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 5,
        zIndex: 20,
      }}
    >
      {VIEW_LABELS.map(({ id, label }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onSelect(id)}
            style={{
              padding: '4px 11px',
              borderRadius: 9,
              border: `1.5px solid ${isActive ? '#2563eb' : 'rgba(37,99,235,0.28)'}`,
              background: isActive
                ? 'linear-gradient(135deg,#2563eb,#1d4ed8)'
                : 'rgba(255,255,255,0.92)',
              color: isActive ? '#fff' : '#2563eb',
              fontSize: 12,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.18s ease',
              direction: 'rtl',
              boxShadow: isActive
                ? '0 2px 8px rgba(13,148,136,0.35)'
                : '0 1px 4px rgba(0,0,0,0.10)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#e0f7f9';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)';
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** פורטל מובייל: מניעת חטיפת גלילה ע״י OrbitControls במגע אחד */
function usePreferCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return coarse;
}

// ── Main exported component ───────────────────────────────────────
export default function BodyMap3D(props: BodyMap3DProps) {
  const {
    activeAreas,
    primaryArea,
    clinicalArea,
    selfCareSelectedAreas,
    painByArea,
    level,
    xp,
    xpForNextLevel,
    streak,
    streakForGlow,
    strengthGlowBonus = 0,
    strengthenedAreasToday = [],
    floatingLevelBadge = false,
    levelBadgeRevealOnHover = false,
    avatarScale = 1,
    selectedArea,
    onAreaClick,
    minHeightPx: _minHeightPx = 640,
    equippedGear: equippedGearProp,
    injuryHighlightSegments = [],
    secondaryClinicalBodyAreas = [],
    stableInteraction = true,
    patientPortalInteractive = false,
    segmentGrowthMul,
    wrapperClassName,
    disablePremiumPostProcessing: _disablePremiumPostProcessing = false,
    dailyScenicBackgroundDayKey,
    totalActiveDaysForScenery = 1,
  } = props;

  const useScenicBackdrop =
    patientPortalInteractive &&
    typeof dailyScenicBackgroundDayKey === 'string' &&
    dailyScenicBackgroundDayKey.length > 0;

  const equippedGear = equippedGearProp ?? EMPTY_EQUIPPED_GEAR;
  const coarsePointer = usePreferCoarsePointer();
  const scrollFriendlyPortal = patientPortalInteractive && coarsePointer;

  const streakVal = (streak ?? streakForGlow ?? 0) + strengthGlowBonus;
  const streakEnergy =
    (streakVal >= 3 && !patientPortalInteractive) ||
    (patientPortalInteractive && strengthGlowBonus > 0);

  const xpPct =
    xp != null && xpForNextLevel != null && xpForNextLevel > 0
      ? Math.min(100, Math.round((xp / xpForNextLevel) * 100))
      : null;

  const [activeView, setActiveView] = useState<ViewPreset | null>('front');
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [walkPausedByPointerOver, setWalkPausedByPointerOver] = useState(false);
  const cameraTargetRef = useRef<THREE.Vector3 | null>(VIEW_POSITIONS.front.clone());
  const orbitActiveRef = useRef(false);

  const showLevelChrome = !levelBadgeRevealOnHover || avatarHovered;

  /** מסע ההר: המטופל עולה בפריים; רקע סינמטי בפורטל — גארדי נשאר מחוץ לקנבס */
  const patientMountainElevation = useMemo(
    () => (useScenicBackdrop ? getPatientAvatarMountainElevationY(level) : 0),
    [level, useScenicBackdrop]
  );

  const portalAvatarCssStyle = useMemo(
    () =>
      useScenicBackdrop && patientPortalInteractive
        ? getPatientAvatarCssStyle(level)
        : undefined,
    [level, useScenicBackdrop, patientPortalInteractive]
  );

  const handleView = useCallback((v: ViewPreset) => {
    cameraTargetRef.current = VIEW_POSITIONS[v].clone();
    orbitActiveRef.current = false;
    setActiveView(v);
  }, []);

  return (
    <div
      className={wrapperClassName ?? ''}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        margin: '0 auto',
        display: 'block',
        background: useScenicBackdrop ? 'transparent' : '#f0f0f0',
        borderRadius: '16px',
        overflow: 'hidden',
        flexShrink: 0,
        alignSelf: 'center',
        touchAction: patientPortalInteractive
          ? 'none'
          : scrollFriendlyPortal
            ? 'pan-y'
            : undefined,
      }}
      onPointerEnter={() => {
        setAvatarHovered(true);
        if (patientPortalInteractive) setWalkPausedByPointerOver(true);
      }}
      onPointerLeave={() => {
        setAvatarHovered(false);
        if (patientPortalInteractive) setWalkPausedByPointerOver(false);
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: 'clamp(320px, 52dvh, 680px)',
          maxWidth: '300px',
          margin: '0 auto',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
      {useScenicBackdrop && (
        <AvatarJourneyBackdrop
          clinicalYmd={dailyScenicBackgroundDayKey!}
          level={level}
          totalActiveDays={totalActiveDaysForScenery}
        />
      )}
      <div
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          ...(portalAvatarCssStyle ?? {}),
        }}
      >
      <Canvas
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          position: 'relative',
          touchAction: patientPortalInteractive
            ? 'none'
            : scrollFriendlyPortal
              ? 'pan-y'
              : undefined,
        }}
        camera={{ position: [0, 0.36, 7.65], fov: 46, near: 0.08, far: 120 }}
        shadows="soft"
        gl={{
          antialias: true,
          alpha: useScenicBackdrop,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.35,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onCreated={({ gl, scene }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          if (useScenicBackdrop) {
            gl.setClearColor(0x000000, 0);
            scene.background = null;
          }
        }}
        dpr={[1, 2]}
      >
        {!useScenicBackdrop && <StudioGradientBackground />}

        <ambientLight intensity={1.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1.15}
          color="#ffffff"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={28}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />

        <Environment
          preset="studio"
          environmentIntensity={useScenicBackdrop ? 0.48 : 0.65}
        />

        <group position={[0, 0.1 + patientMountainElevation, 0]}>
          <Suspense fallback={null}>
            <group scale={avatarScale}>
              <StreakEnergyFloat enabled={streakEnergy && !stableInteraction}>
                <AnatomyModel
                  activeAreas={activeAreas}
                  primaryArea={primaryArea}
                  clinicalArea={clinicalArea ?? primaryArea}
                  selfCareSelectedAreas={selfCareSelectedAreas}
                  painByArea={painByArea}
                  level={level}
                  xp={xp}
                  xpForNextLevel={xpForNextLevel}
                  streak={streakVal}
                  strengthenedAreasToday={strengthenedAreasToday}
                  selectedArea={selectedArea}
                  onAreaClick={onAreaClick}
                  equippedGear={equippedGear}
                  injuryHighlightSegments={injuryHighlightSegments}
                  secondaryClinicalBodyAreas={secondaryClinicalBodyAreas}
                  stableInteraction={stableInteraction}
                  patientPortalInteractive={patientPortalInteractive}
                  pauseWalkAnimation={
                    patientPortalInteractive && walkPausedByPointerOver
                  }
                  segmentGrowthMul={segmentGrowthMul}
                  hideContactGroundShadow={useScenicBackdrop}
                  cssLayerVisualsForPortal={useScenicBackdrop && patientPortalInteractive}
                />

                {floatingLevelBadge && showLevelChrome && !patientPortalInteractive && (
                  <Html
                    position={[0.34, 2.05, 0.14]}
                    center
                    distanceFactor={8.5}
                    style={{ pointerEvents: 'none' }}
                    zIndexRange={[100, 0]}
                  >
                    <div
                      style={{
                        background: 'linear-gradient(145deg,#1d4ed8,#2563eb)',
                        color: '#fff',
                        borderRadius: 12,
                        padding: '4px 11px',
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        boxShadow:
                          '0 0 14px rgba(37,99,235,0.45), 0 2px 10px rgba(29,78,216,0.35)',
                        border: '1px solid rgba(255,255,255,0.35)',
                        direction: 'ltr',
                        textAlign: 'center',
                      }}
                    >
                      <div>Lv.{level}</div>
                      {xpPct != null && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            opacity: 0.92,
                            marginTop: 2,
                            letterSpacing: 0.2,
                          }}
                        >
                          {xpPct}% XP
                        </div>
                      )}
                    </div>
                  </Html>
                )}

                {streakEnergy && !stableInteraction && <StreakRimLight />}
              </StreakEnergyFloat>
            </group>
          </Suspense>
        </group>

        {/* מצלמה — פורטל: סיבוב/זום ידניים בלבד (ללא אנימציית מבטים); דשבורד מטפל: אנימטור + מסלולי מבט */}
        {patientPortalInteractive ? (
          <OrbitControls
            makeDefault
            enablePan={false}
            enableRotate
            enableZoom
            minDistance={5.5}
            maxDistance={24}
            minPolarAngle={0.12}
            maxPolarAngle={Math.PI - 0.1}
            target={[0, 0.3, 0]}
            enableDamping
            dampingFactor={0.075}
            rotateSpeed={0.68}
            zoomSpeed={0.72}
            screenSpacePanning={false}
          />
        ) : (
          <>
            <CameraAnimator
              targetRef={cameraTargetRef}
              orbitActiveRef={orbitActiveRef}
            />
            <OrbitControls
              makeDefault
              enablePan={false}
              enableRotate={!scrollFriendlyPortal}
              enableZoom={!scrollFriendlyPortal}
              minDistance={5.5}
              maxDistance={24}
              target={[0, 0.3, 0]}
              enableDamping
              dampingFactor={0.07}
              rotateSpeed={0.72}
              zoomSpeed={0.85}
              onStart={() => {
                orbitActiveRef.current = true;
                setActiveView(null);
              }}
            />
          </>
        )}
      </Canvas>
      </div>

      {/* ── HTML overlays ───────────────────────────────────────── */}

      {/* Orbit hint — לא בפורטל מטופל (מפה ויזואלית בלבד) */}
      {!patientPortalInteractive && (
        <div style={{
          position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)',
          padding: '4px 12px', borderRadius: '8px', fontSize: 11,
          color: '#2563eb', fontFamily: 'Inter, system-ui, sans-serif',
          pointerEvents: 'none', direction: 'rtl', whiteSpace: 'nowrap',
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        }}>
          {scrollFriendlyPortal
            ? 'גלילה מחוץ למפה — גללו מטה לתרגילים · זווית: כפתורים למטה'
            : 'גרור לסיבוב · אדום = מוקד ראשי · כתום = משני · ירוק = פרהאב (לחיצה)'}
        </div>
      )}

      {/* Level badge (מוסתר כשהתג מוצג ב־3D — פורטל מטופל) */}
      {showLevelChrome && !floatingLevelBadge && !patientPortalInteractive && (
        <div style={{
          position: 'absolute', top: 9, insetInlineEnd: 10,
          background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
          color: '#fff', borderRadius: 10, padding: '4px 12px',
          fontSize: 13, fontWeight: 800, fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
        }}>
          Lv.{level}
        </div>
      )}

      {/* View toggle — לא בפורטל מטופל (מפה ללא פקדים) */}
      {!patientPortalInteractive && (
        <ViewToggle activeView={activeView} onSelect={handleView} />
      )}

      {/* מקרא צבעים — דשבורד מטפל בלבד */}
      {!patientPortalInteractive && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            insetInlineStart: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            pointerEvents: 'none',
          }}
        >
          {[
            { dot: '#10b981', label: 'בריא' },
            { dot: '#0d9488', label: 'אזור תרגול' },
            { dot: '#fb923c', label: 'כאב גבוה' },
          ].map(({ dot, label }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255,255,255,0.82)',
                padding: '2px 7px',
                borderRadius: 7,
                fontSize: 11,
                color: '#334155',
                fontFamily: 'Inter, system-ui, sans-serif',
                backdropFilter: 'blur(6px)',
                direction: 'rtl',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: dot,
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
