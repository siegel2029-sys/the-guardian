import { Suspense, useRef, useState, useCallback, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import AnatomyModel from './AnatomyModel';
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
  /** Default 500. Use a lower value for compact / mobile patient layouts. */
  minHeightPx?: number;
  /** ציוד מעוגן אנטומית — מטופל; דשבורד מטפל משאיר ריק */
  equippedGear?: EquippedGearSnapshot;
}

// ── View presets ──────────────────────────────────────────────────
type ViewPreset = 'front' | 'back' | 'left' | 'right';
const VIEW_POSITIONS: Record<ViewPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, 1, 5),
  back: new THREE.Vector3(0, 1, -5),
  left: new THREE.Vector3(-5, 1, 0),
  right: new THREE.Vector3(5, 1, 0),
};
const LOOK_AT = new THREE.Vector3(0, 0.15, 0);

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

// ── Scene background + fog ────────────────────────────────────────
function SceneSetup() {
  return (
    <>
      <color attach="background" args={['#d8f0f4']} />
      <fog attach="fog" args={['#d8f0f4', 10, 22]} />
    </>
  );
}

// ── Loading fallback ──────────────────────────────────────────────
function Loader() {
  return (
    <Html center>
      <div style={{ color: '#0d9488', fontSize: 13, fontFamily: 'Arial', direction: 'rtl' }}>
        טוען מודל...
      </div>
    </Html>
  );
}

// ── ViewToggle buttons (HTML overlay) ────────────────────────────
interface ViewToggleProps {
  activeView: ViewPreset | null;
  onSelect: (v: ViewPreset) => void;
}
const VIEW_LABELS: { id: ViewPreset; label: string; icon: string }[] = [
  { id: 'front', label: 'פנים',  icon: '⬛' },
  { id: 'back',  label: 'גב',    icon: '⬜' },
  { id: 'left',  label: 'שמאל',  icon: '◀' },
  { id: 'right', label: 'ימין',  icon: '▶' },
];
function ViewToggle({ activeView, onSelect }: ViewToggleProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '38px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '5px',
        zIndex: 20,
      }}
    >
      {VIEW_LABELS.map(({ id, label }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            style={{
              padding: '4px 11px',
              borderRadius: '9px',
              border: `1.5px solid ${isActive ? '#0d9488' : 'rgba(13,148,136,0.30)'}`,
              background: isActive
                ? 'linear-gradient(135deg,#0d9488,#10b981)'
                : 'rgba(255,255,255,0.82)',
              color: isActive ? '#fff' : '#0d9488',
              fontSize: '11px',
              fontFamily: '"Arial Hebrew", Arial, sans-serif',
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
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.82)';
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
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
    strengthenedAreasToday = [],
    floatingLevelBadge = false,
    levelBadgeRevealOnHover = false,
    avatarScale = 1,
    selectedArea,
    onAreaClick,
    minHeightPx = 500,
    equippedGear: equippedGearProp,
  } = props;

  const equippedGear = equippedGearProp ?? EMPTY_EQUIPPED_GEAR;

  const streakVal = streak ?? streakForGlow ?? 0;
  const streakEnergy = streakVal >= 3;

  const xpPct =
    xp != null && xpForNextLevel != null && xpForNextLevel > 0
      ? Math.min(100, Math.round((xp / xpForNextLevel) * 100))
      : null;

  const [activeView, setActiveView] = useState<ViewPreset | null>('front');
  const [avatarHovered, setAvatarHovered] = useState(false);
  const cameraTargetRef = useRef<THREE.Vector3 | null>(VIEW_POSITIONS.front.clone());
  const orbitActiveRef = useRef(false);

  const showLevelChrome = !levelBadgeRevealOnHover || avatarHovered;

  const handleView = useCallback((v: ViewPreset) => {
    cameraTargetRef.current = VIEW_POSITIONS[v].clone();
    orbitActiveRef.current = false;
    setActiveView(v);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: `${minHeightPx}px`,
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setAvatarHovered(true)}
      onMouseLeave={() => setAvatarHovered(false)}
    >
      <Canvas
        camera={{ position: [0, 1, 5], fov: 45, near: 0.08, far: 45 }}
        shadows="soft"
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.28,
        }}
        dpr={[1, 2]}
      >
        <SceneSetup />

        {/* ── Lighting ─────────────────────────────────────────── */}
        {/* Soft ambient fill – blueish mint to match the scene */}
        <ambientLight intensity={0.72} color="#e8f4f8" />
        <hemisphereLight args={['#f8fafc', '#94a3b8', 0.45]} />

        {/* Key light – strong, warm, top-right-front (like a studio softbox) */}
        <directionalLight
          position={[2.8, 5.0, 3.5]}
          intensity={1.78}
          color="#fffaf5"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.5}
          shadow-camera-far={16}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={3.5}
          shadow-camera-bottom={-2}
          shadow-bias={-0.0005}
        />

        {/* Fill light – cool, from the left-back (simulates studio bounce) */}
        <directionalLight position={[-2.5, 1.5, -2.5]} intensity={0.58} color="#dbeafe" />

        {/* Rim / edge light – from directly behind, separates body from bg */}
        <directionalLight position={[0, 1.0, -3.5]}   intensity={0.55} color="#a7f3d0" />

        {/* Under-light – very soft uplight that reveals the calf & foot */}
        <pointLight position={[0, -2.0, 1.0]} intensity={0.22} color="#d1fae5" distance={4} decay={2} />

        {/* Environment HDR for realistic PBR reflections on clearcoat */}
        <Environment preset="studio" />

        <Suspense fallback={<Loader />}>
          <group scale={avatarScale}>
            <StreakEnergyFloat enabled={streakEnergy}>
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
              />

              {floatingLevelBadge && showLevelChrome && (
                <Html
                  position={[0.34, 1.9, 0.14]}
                  center
                  distanceFactor={8.5}
                  style={{ pointerEvents: 'none' }}
                  zIndexRange={[100, 0]}
                >
                  <div
                    style={{
                      background: 'linear-gradient(145deg,#0f766e,#14b8a6)',
                      color: '#fff',
                      borderRadius: 12,
                      padding: '4px 11px',
                      fontSize: 12,
                      fontWeight: 800,
                      fontFamily: '"Arial Hebrew", Arial, sans-serif',
                      boxShadow:
                        '0 0 14px rgba(20,184,166,0.55), 0 2px 10px rgba(13,148,136,0.35)',
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

              {streakEnergy && <StreakRimLight />}
            </StreakEnergyFloat>
          </group>
        </Suspense>

        {streakEnergy && (
          <EffectComposer enableNormalPass={false}>
            <Bloom
              intensity={0.42}
              luminanceThreshold={0.82}
              luminanceSmoothing={0.35}
              mipmapBlur
            />
          </EffectComposer>
        )}

        {/* Camera smooth-animation controller */}
        <CameraAnimator targetRef={cameraTargetRef} orbitActiveRef={orbitActiveRef} />

        {/* OrbitControls – user can always override by dragging */}
        <OrbitControls
          enablePan={false}
          minDistance={1.8}
          maxDistance={6.0}
          target={[0, 0.15, 0]}
          enableDamping
          dampingFactor={0.07}
          rotateSpeed={0.72}
          zoomSpeed={0.85}
          onStart={() => {
            orbitActiveRef.current = true;
            setActiveView(null);
          }}
        />
      </Canvas>

      {/* ── HTML overlays ───────────────────────────────────────── */}

      {/* Orbit hint */}
      <div style={{
        position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(6px)',
        padding: '2px 10px', borderRadius: '8px', fontSize: 9.5,
        color: '#0d9488', fontFamily: '"Arial Hebrew",Arial,sans-serif',
        pointerEvents: 'none', direction: 'rtl', whiteSpace: 'nowrap',
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
      }}>
        גרור לסיבוב · אדום = שיקום מהמטפל · ירוק = כוח/פרהאב (לחיצה)
      </div>

      {/* Level badge */}
      {showLevelChrome && (
        <div style={{
          position: 'absolute', top: 9, right: 10,
          background: 'linear-gradient(135deg,#0d9488,#10b981)',
          color: '#fff', borderRadius: 10, padding: '3px 10px',
          fontSize: 12, fontWeight: 800, fontFamily: 'Arial',
          boxShadow: '0 2px 9px rgba(13,148,136,0.38)',
        }}>
          Lv.{level}
        </div>
      )}

      {/* View toggle */}
      <ViewToggle activeView={activeView} onSelect={handleView} />

      {/* Colour legend */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        display: 'flex', flexDirection: 'column', gap: 4,
        pointerEvents: 'none',
      }}>
        {[
          { dot: '#10b981', label: 'בריא' },
          { dot: '#0d9488', label: 'אזור תרגול' },
          { dot: '#fb923c', label: 'כאב גבוה' },
        ].map(({ dot, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.80)', padding: '2px 7px',
            borderRadius: 7, fontSize: 9.5,
            color: '#334155', fontFamily: '"Arial Hebrew",Arial,sans-serif',
            backdropFilter: 'blur(6px)', direction: 'rtl',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
