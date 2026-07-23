import {
  Suspense,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  memo,
  createContext,
  useContext,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Html, useEnvironment } from '@react-three/drei';
import * as THREE from 'three';
import { RGBELoader } from 'three-stdlib';
import AnatomyModel from './AnatomyModel';
import AvatarJourneyBackdrop from './AvatarJourneyBackdrop';
import {
  getPatientAvatarCssStyle,
  getPatientAvatarMountainElevationY,
} from '../../hooks/useGamification';
import type { BodyArea, ManualClinicalSegmentLockOverride } from '../../types';
import { EMPTY_EQUIPPED_GEAR, type EquippedGearSnapshot } from '../../config/gearCatalog';
import { normalizeStoreItemIds, type StoreItemId } from '../../config/storeCatalog';
import EquippedStoreFloorProps from './equipped-store/EquippedStoreFloorProps';
import { devLog, devWarn } from '../../lib/safeLog';

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
  /** פריטי חנות 3D פעילים — מוצגים על הרצפה ליד האווטאר */
  equippedItems?: StoreItemId[];
  /** מקטעים להדגשת פגיעה (אדום) */
  injuryHighlightSegments?: BodyArea[];
  /** מוקד משני מהמטפל (כתום) */
  secondaryClinicalBodyAreas?: BodyArea[];
  /** עקיפת נעילה קלינית ויזואלית במודל */
  manualClinicalSegmentLockOverrides?: Partial<
    Record<BodyArea, ManualClinicalSegmentLockOverride>
  >;
  /** כבה אנימציות צף/בלום — לחיצות מדויקות */
  stableInteraction?: boolean;
  /** פורטל מטופל — סמן «אסור» על אזורי שיקום */
  patientPortalInteractive?: boolean;
  /** מכפילי נפח שריר לפי מקטע (השוואת גיבורים וכו') */
  segmentGrowthMul?: Partial<Record<BodyArea, number>>;
  /** מחלקות נוספות לעטיפת הקנבס — למשל גובה קבוע בפורטל מובייל */
  wrapperClassName?: string;
  /**
   * בוחר כאב מטפל: מבט חזית קבוע, ללא סיבוב/זום (נוח למובייל — «מישורי»).
   */
  painPickerFlat?: boolean;
  /**
   * בוחר כאב מטפל: רקע שקוף/נייטרלי, ללא רצפת צל — לצד תצוגה גדולה במודאל.
   */
  painPickerCleanBackground?: boolean;
  /** רוחב מקסימלי לפריים הפנימי של האווטאר (ברירת מחדל 300px) */
  innerFrameMaxWidthPx?: number;
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

const DREI_HDRI_ROOT =
  'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/';
const STUDIO_HDRI_FILE = 'studio_small_03_1k.hdr';

/** R3F still constructs THREE.Clock internally; swap to Timer in onCreated to silence r183 deprecation. */
type R3fClockAdapter = {
  autoStart: boolean;
  startTime: number;
  oldTime: number;
  elapsedTime: number;
  running: boolean;
  start: () => void;
  stop: () => void;
  getDelta: () => number;
  getElapsedTime: () => number;
};

function createR3fTimerClock(timer: THREE.Timer): R3fClockAdapter {
  const clock: R3fClockAdapter = {
    autoStart: true,
    startTime: 0,
    oldTime: 0,
    elapsedTime: 0,
    running: false,
    start() {
      timer.update();
      this.running = true;
      this.startTime = performance.now();
      this.oldTime = this.startTime;
      this.elapsedTime = timer.getElapsed();
    },
    stop() {
      timer.update();
      this.elapsedTime = timer.getElapsed();
      this.running = false;
      this.autoStart = false;
    },
    getDelta() {
      if (this.autoStart && !this.running) {
        this.start();
        return 0;
      }
      if (!this.running) return 0;
      timer.update();
      const delta = timer.getDelta();
      this.elapsedTime = timer.getElapsed();
      return delta;
    },
    getElapsedTime() {
      this.getDelta();
      return this.elapsedTime;
    },
  };
  return clock;
}

function clearStudioEnvironmentCache(): void {
  try {
    useEnvironment.clear({ preset: 'studio' });
  } catch {
    /* cache may already be empty */
  }
  try {
    useLoader.clear(RGBELoader, STUDIO_HDRI_FILE);
  } catch {
    /* ignore */
  }
}

// ── WebGL runtime + GPU disposal helpers ─────────────────────────
type WebGlRuntimeValue = {
  contextLostRef: MutableRefObject<boolean>;
};

const WebGlRuntimeContext = createContext<WebGlRuntimeValue | null>(null);

function WebGlRuntimeProvider({
  contextLostRef,
  children,
}: {
  contextLostRef: MutableRefObject<boolean>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ contextLostRef }), [contextLostRef]);
  return (
    <WebGlRuntimeContext.Provider value={value}>{children}</WebGlRuntimeContext.Provider>
  );
}

function useWebGlRuntime(): WebGlRuntimeValue {
  return useContext(WebGlRuntimeContext) ?? { contextLostRef: { current: false } };
}

function disposeMaterialTextures(material: THREE.Material): void {
  for (const key of Object.keys(material)) {
    const value = (material as THREE.MeshStandardMaterial)[key as keyof THREE.MeshStandardMaterial];
    if (value && typeof value === 'object' && 'isTexture' in value && (value as THREE.Texture).isTexture) {
      (value as THREE.Texture).dispose();
    }
  }
}

function disposeSceneGpuResources(scene: THREE.Scene): void {
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      disposeMaterialTextures(mat);
      mat.dispose();
    }
  });

  if (scene.environment instanceof THREE.Texture) {
    scene.environment.dispose();
    scene.environment = null;
  }
  if (scene.background instanceof THREE.Texture) {
    scene.background.dispose();
    scene.background = null;
  } else {
    scene.background = null;
  }
}

function stopRendererAnimationLoop(gl: THREE.WebGLRenderer): void {
  gl.setAnimationLoop(null);
}

const bodyMapTimerByGl = new WeakMap<THREE.WebGLRenderer, THREE.Timer>();

// ── Camera animator (lives inside Canvas) ────────────────────────
interface CameraAnimatorProps {
  targetRef: React.MutableRefObject<THREE.Vector3 | null>;
  orbitActiveRef: React.MutableRefObject<boolean>;
}
function CameraAnimator({ targetRef, orbitActiveRef }: CameraAnimatorProps) {
  const { camera } = useThree();
  const { contextLostRef } = useWebGlRuntime();

  useFrame(() => {
    if (contextLostRef.current || !targetRef.current || orbitActiveRef.current) return;
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
  const timerRef = useRef(new THREE.Timer());
  const { contextLostRef } = useWebGlRuntime();

  useEffect(() => {
    const timer = timerRef.current;
    return () => {
      timer.dispose();
    };
  }, []);

  useFrame(() => {
    if (contextLostRef.current) return;
    const g = ref.current;
    if (!g) return;
    timerRef.current.update();
    const elapsed = timerRef.current.getElapsed();
    if (enabled) {
      g.position.y = Math.sin(elapsed * 1.55) * 0.042;
    } else {
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, 0.1);
    }
  });
  return <group ref={ref}>{children}</group>;
}

/** Pulsating rim light — pairs with bloom for streak “energy”. */
function StreakRimLight() {
  const ref = useRef<THREE.PointLight>(null);
  const timerRef = useRef(new THREE.Timer());
  const { contextLostRef } = useWebGlRuntime();

  useEffect(() => {
    const timer = timerRef.current;
    return () => {
      timer.dispose();
    };
  }, []);

  useFrame(() => {
    if (contextLostRef.current) return;
    const L = ref.current;
    if (!L) return;
    timerRef.current.update();
    const elapsed = timerRef.current.getElapsed();
    L.intensity = 0.38 + Math.sin(elapsed * 2.35) * 0.2;
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

type BodyMapWebGlLifecycleProps = {
  painCleanStudio: boolean;
  useScenicBackdrop: boolean;
  flatTherapistPicker: boolean;
  contextLostRef: MutableRefObject<boolean>;
  onContextLostChange: (lost: boolean) => void;
  onContextRestoredRemount: () => void;
};

/** Renderer setup, context-loss/recovery, and dispose on unmount (avoids leaked GPU + frozen UI). */
function BodyMapWebGlLifecycle({
  painCleanStudio,
  useScenicBackdrop,
  flatTherapistPicker,
  contextLostRef,
  onContextLostChange,
  onContextRestoredRemount,
}: BodyMapWebGlLifecycleProps) {
  const { gl, scene } = useThree();

  useLayoutEffect(() => {
    gl.shadowMap.enabled = !painCleanStudio;
    if (!painCleanStudio) {
      gl.shadowMap.type = THREE.PCFShadowMap;
    }
    if (useScenicBackdrop || painCleanStudio) {
      gl.setClearColor(0x000000, 0);
      scene.background = null;
    } else if (flatTherapistPicker) {
      scene.background = new THREE.Color('#fafafa');
    }
  }, [gl, scene, painCleanStudio, useScenicBackdrop, flatTherapistPicker]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLostRef.current = true;
      onContextLostChange(true);
      stopRendererAnimationLoop(gl);
      clearStudioEnvironmentCache();
      devWarn('[BodyMap3D] webglcontextlost — prevented default so the browser may restore');
    };

    const onContextRestored = () => {
      contextLostRef.current = false;
      onContextLostChange(false);
      devLog('[BodyMap3D] webglcontextrestored — syncing size & remounting Canvas');
      gl.setSize(canvas.clientWidth, canvas.clientHeight, false);
      requestAnimationFrame(() => onContextRestoredRemount());
    };

    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      stopRendererAnimationLoop(gl);
      disposeSceneGpuResources(scene);
      const timer = bodyMapTimerByGl.get(gl);
      if (timer) {
        timer.disconnect();
        timer.dispose();
        bodyMapTimerByGl.delete(gl);
      }
      clearStudioEnvironmentCache();
      try {
        gl.dispose();
      } catch {
        /* ignore double-dispose */
      }
      const parent = canvas.parentElement;
      if (parent?.contains(canvas)) {
        try {
          parent.removeChild(canvas);
        } catch {
          /* canvas may already be detached by R3F */
        }
      }
    };
  }, [gl, scene, contextLostRef, onContextLostChange, onContextRestoredRemount]);

  return null;
}

/**
 * Isolated studio IBL — bypasses drei `<Environment>` which mutates and disposes the global
 * useLoader/useEnvironment cache, causing glTexStorage2D immutable errors on Canvas remount.
 */
function BodyMapStudioEnvironment({
  environmentIntensity,
  instanceKey,
}: {
  environmentIntensity: number;
  instanceKey: number;
}) {
  const scene = useThree((s) => s.scene);
  const { contextLostRef } = useWebGlRuntime();
  const envTextureRef = useRef<THREE.Texture | null>(null);
  const environmentIntensityRef = useRef(environmentIntensity);
  environmentIntensityRef.current = environmentIntensity;

  useLayoutEffect(() => {
    scene.environmentIntensity = environmentIntensity;
  }, [scene, environmentIntensity]);

  useEffect(() => {
    if (contextLostRef.current) return;

    clearStudioEnvironmentCache();

    let cancelled = false;
    const loader = new RGBELoader();
    loader.setPath(DREI_HDRI_ROOT);
    loader.load(
      STUDIO_HDRI_FILE,
      (texture) => {
        if (cancelled || contextLostRef.current) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        envTextureRef.current = texture;
        scene.environment = texture;
        scene.environmentIntensity = environmentIntensityRef.current;
      },
      undefined,
      (err) => {
        devWarn('[BodyMap3D] studio HDR load failed', {
          name: err instanceof Error ? err.name : 'unknown',
        });
      }
    );

    return () => {
      cancelled = true;
      const owned = envTextureRef.current;
      envTextureRef.current = null;
      if (owned) {
        if (scene.environment === owned) {
          scene.environment = null;
        }
        owned.dispose();
      }
      clearStudioEnvironmentCache();
    };
  }, [scene, instanceKey, contextLostRef]);

  return null;
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
      if (scene.background === tex) {
        scene.background = null;
      }
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
function BodyMap3D(props: BodyMap3DProps) {
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
    equippedItems: equippedItemsProp,
    injuryHighlightSegments = [],
    secondaryClinicalBodyAreas = [],
    manualClinicalSegmentLockOverrides,
    stableInteraction = true,
    patientPortalInteractive = false,
    segmentGrowthMul,
    wrapperClassName,
    disablePremiumPostProcessing: _disablePremiumPostProcessing = false,
    dailyScenicBackgroundDayKey,
    totalActiveDaysForScenery = 1,
    painPickerFlat = false,
    painPickerCleanBackground = false,
    innerFrameMaxWidthPx = 300,
  } = props;

  const flatTherapistPicker = painPickerFlat && !patientPortalInteractive;
  const painCleanStudio = flatTherapistPicker && painPickerCleanBackground;

  const useScenicBackdrop =
    patientPortalInteractive &&
    typeof dailyScenicBackgroundDayKey === 'string' &&
    dailyScenicBackgroundDayKey.length > 0;

  const equippedGear = equippedGearProp ?? EMPTY_EQUIPPED_GEAR;
  const equippedStoreItems = useMemo(
    () => normalizeStoreItemIds(equippedItemsProp),
    [equippedItemsProp]
  );
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
  /** Remount Canvas after WebGL restore so Fiber/Three state stays consistent; UI/finish callbacks stay mounted outside the canvas. */
  const [webglCanvasKey, setWebglCanvasKey] = useState(0);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const contextLostRef = useRef(false);
  const bumpWebglCanvasKey = useCallback(() => {
    contextLostRef.current = false;
    setWebglContextLost(false);
    clearStudioEnvironmentCache();
    setWebglCanvasKey((k) => k + 1);
  }, []);

  useEffect(() => () => clearStudioEnvironmentCache(), []);
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
        minHeight: flatTherapistPicker ? 'min(420px, 58dvh)' : 0,
        position: 'relative',
        margin: '0 auto',
        display: 'block',
        background: useScenicBackdrop
          ? 'transparent'
          : painCleanStudio
            ? 'transparent'
            : flatTherapistPicker
              ? '#fafafa'
              : '#f0f0f0',
        borderRadius: painCleanStudio ? 0 : '16px',
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
          minHeight: 'clamp(280px, 48dvh, 560px)',
          maxWidth: flatTherapistPicker
            ? `min(100%, ${innerFrameMaxWidthPx}px)`
            : '300px',
          margin: '0 auto',
          position: 'relative',
          overflow: 'hidden',
          background: painCleanStudio ? 'transparent' : flatTherapistPicker ? '#fafafa' : undefined,
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
        key={webglCanvasKey}
        frameloop={webglContextLost ? 'never' : 'always'}
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
        camera={{
          position: painCleanStudio ? [0, 0, 5] : [0, 0.36, 7.65],
          fov: painCleanStudio ? 48 : 46,
          near: 0.08,
          far: 120,
        }}
        shadows={painCleanStudio ? false : true}
        onCreated={({ gl, set }) => {
          const timer = new THREE.Timer();
          timer.connect(document);
          bodyMapTimerByGl.set(gl, timer);
          set({ clock: createR3fTimerClock(timer) as unknown as THREE.Clock });
          if (!painCleanStudio) {
            gl.shadowMap.type = THREE.PCFShadowMap;
          }
        }}
        gl={{
          antialias: true,
          alpha: useScenicBackdrop || painCleanStudio,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: painCleanStudio ? 1.52 : 1.35,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}
      >
        <WebGlRuntimeProvider contextLostRef={contextLostRef}>
        <BodyMapWebGlLifecycle
          painCleanStudio={painCleanStudio}
          useScenicBackdrop={useScenicBackdrop}
          flatTherapistPicker={flatTherapistPicker}
          contextLostRef={contextLostRef}
          onContextLostChange={setWebglContextLost}
          onContextRestoredRemount={bumpWebglCanvasKey}
        />
        {!useScenicBackdrop && !flatTherapistPicker && <StudioGradientBackground />}

        <ambientLight intensity={1.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={painCleanStudio ? 1.28 : 1.15}
          color="#ffffff"
          castShadow={!painCleanStudio}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={28}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />

        <BodyMapStudioEnvironment
          instanceKey={webglCanvasKey}
          environmentIntensity={
            useScenicBackdrop
              ? 0.48
              : painCleanStudio
                ? 0.55
                : flatTherapistPicker
                  ? 0.38
                  : 0.65
          }
        />

        <group
          position={[0, 0.1 + patientMountainElevation, 0]}
        >
          <Suspense
            fallback={
              <Html center style={{ pointerEvents: 'none' }}>
                <div
                  className="flex h-16 w-16 items-center justify-center"
                  aria-busy="true"
                  aria-label="טוען מודל גוף"
                >
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                </div>
              </Html>
            }
          >
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
                  manualClinicalSegmentLockOverrides={manualClinicalSegmentLockOverrides}
                  stableInteraction={stableInteraction}
                  patientPortalInteractive={patientPortalInteractive}
                  pauseWalkAnimation={
                    patientPortalInteractive && walkPausedByPointerOver
                  }
                  segmentGrowthMul={segmentGrowthMul}
                  hideContactGroundShadow={useScenicBackdrop || flatTherapistPicker}
                  cssLayerVisualsForPortal={useScenicBackdrop && patientPortalInteractive}
                  straightClinicalFrontView={painCleanStudio}
                />

                <EquippedStoreFloorProps equippedItems={equippedStoreItems} />

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
        ) : flatTherapistPicker ? (
          <OrbitControls
            makeDefault
            enablePan={false}
            enableRotate={false}
            enableZoom={false}
            minDistance={5.5}
            maxDistance={24}
            target={
              painCleanStudio ? ([0, 0, 0] as [number, number, number]) : [0, 0.3, 0]
            }
            enableDamping={false}
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
        </WebGlRuntimeProvider>
      </Canvas>
      {webglContextLost && (
        <div
          role="alert"
          dir="rtl"
          className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-50/95 px-4 text-center"
        >
          <p className="text-sm font-semibold text-slate-900">מפת הגוף הושהתה</p>
          <p className="text-xs text-slate-600 max-w-[16rem]">
            הקשר הגרפי נותק. ניתן לטעון מחדש בלי לרענן את כל הדף.
          </p>
          <button
            type="button"
            onClick={bumpWebglCanvasKey}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 active:bg-teal-800 min-h-11"
          >
            הקישו לטעינה מחדש של המפה
          </button>
        </div>
      )}
      </div>

      {/* ── HTML overlays ───────────────────────────────────────── */}

      {/* Orbit hint — לא בפורטל מטופל; לא בבוחר כאב שטוח (מודאל מטפל — ללא טקסט הדרכה) */}
      {!patientPortalInteractive && !flatTherapistPicker && (
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
      {showLevelChrome && !floatingLevelBadge && !patientPortalInteractive && !flatTherapistPicker && (
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
      {!patientPortalInteractive && !flatTherapistPicker && (
        <ViewToggle activeView={activeView} onSelect={handleView} />
      )}

      {/* מקרא צבעים — דשבורד מטפל בלבד */}
      {!patientPortalInteractive && !flatTherapistPicker && (
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

BodyMap3D.displayName = 'BodyMap3D';
export default memo(BodyMap3D);
