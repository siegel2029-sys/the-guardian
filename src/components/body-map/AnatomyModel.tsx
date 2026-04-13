import {
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
  useEffect,
  type ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import MuscleSegment from './MuscleSegment';
import type { BodyArea } from '../../types';
import {
  bodyAreaBlocksSelfCare,
  bodyAreaIsClinicalFocus,
} from '../../body/bodyPickMapping';
import {
  createUpperTorso,
  createLowerTorso,
  createShoulder,
  createUpperArm,
  createForearm,
  createThigh,
  createCalf,
  createKnee,
  createGlute,
  createNormalHandGeometry,
  createDetailedFootGeometry,
} from './geometry/muscleGeometry';
import { getLevelTier, type LevelTier } from '../../body/levelTier';
import { getMuscleEvolutionStage, getMuscleVertexInflation } from '../../body/anatomicalEvolution';
import type { MuscleEvolutionStage } from '../../body/anatomicalEvolution';
import { createMuscleFiberTextures } from './proceduralMuscleTextures';
import {
  installMuscleVertexInflation,
  clearMuscleVertexInflationPatch,
} from './muscleVertexInflation';
import EquippedGearAttachments from './equipped-gear/equipped-gear-attachments';
import type { EquippedGearSnapshot } from '../../config/gearCatalog';

// ── Static world-position for each area's pulsing glow light ─────
/** ראש בולט יותר, צוואר קצר — מסונכרן עם HEAD_* למטה */
const HEAD_RADIUS = 0.256;
const HEAD_CENTER_Y = 1.76;
const NECK_HEIGHT = 0.19;
const NECK_CENTER_Y = HEAD_CENTER_Y - HEAD_RADIUS - NECK_HEIGHT / 2;
const EAR_OFFSET_X = HEAD_RADIUS * 1.045;

const AREA_GLOW: Partial<Record<BodyArea, [number, number, number]>> = {
  neck: [0, NECK_CENTER_Y, 0.22],
  chest: [0, 1.0, 0.28],
  abdomen: [0, 0.52, 0.26],
  shoulder_left: [0.44, 1.3, 0.18],
  shoulder_right: [-0.44, 1.3, 0.18],
  upper_arm_left: [0.56, 0.92, 0.14],
  upper_arm_right: [-0.56, 0.92, 0.14],
  elbow_left: [0.58, 0.6, 0.16],
  elbow_right: [-0.58, 0.6, 0.16],
  forearm_left: [0.56, 0.22, 0.14],
  forearm_right: [-0.56, 0.22, 0.14],
  wrist_left: [0.58, -0.04, 0.16],
  wrist_right: [-0.58, -0.04, 0.16],
  back_upper: [0, 0.98, -0.28],
  back_lower: [0, 0.55, -0.28],
  hip_left: [0.24, 0.14, 0.22],
  hip_right: [-0.24, 0.14, 0.22],
  thigh_left: [0.24, -0.32, 0.18],
  thigh_right: [-0.24, -0.32, 0.18],
  knee_left: [0.24, -0.62, 0.22],
  knee_right: [-0.24, -0.62, 0.22],
  shin_left: [0.24, -0.98, 0.16],
  shin_right: [-0.24, -0.98, 0.16],
  ankle_left: [0.24, -1.33, 0.16],
  ankle_right: [-0.24, -1.33, 0.16],
};

/** מחזור הליכה (שניות) — זמן מנורמל t ∈ [0,1) */
const WALK_CYCLE_SEC = 1.5;

/**
 * אינטרפולציה לינארית בין keyframes קליניים: [אחוז מחזור 0–100, זווית ברדיאנים].
 * Stance ~60% / Swing ~40% משוקפים בצורת העקומה (לא בסימטריה סינוס).
 */
function lerpAngle(
  t01: number,
  keyframes: ReadonlyArray<readonly [number, number]>
): number {
  const t = ((t01 % 1) + 1) % 1;
  const p = t * 100;
  const kf = keyframes;
  const n = kf.length;
  if (n === 0) return 0;
  if (n === 1) return kf[0][1];

  let i = 0;
  while (i < n - 2 && p >= kf[i + 1][0]) {
    i++;
  }
  const [p0, a0] = kf[i];
  const [p1, a1] = kf[i + 1];
  const span = p1 - p0;
  const u = span > 1e-9 ? Math.max(0, Math.min(1, (p - p0) / span)) : 0;
  return a0 + u * (a1 - a0);
}

/** ירך — Heel strike → Terminal swing (100% = סגירת מחזור כמו 0%) */
const GAIT_HIP_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0.4],
  [15, 0.2],
  [30, 0],
  [50, -0.3],
  [60, -0.1],
  [75, 0.2],
  [90, 0.4],
  [100, 0.4],
];

const GAIT_KNEE_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0],
  [15, 0.15],
  [30, 0],
  [50, 0],
  [60, 0.4],
  [75, 1.1],
  [90, 0.08],
  [100, 0],
];

/** קרסול עדין — כמעט שטוח ב־stance (0–55%), תנועה קלה ב־swing בלבד */
const GAIT_ANKLE_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0.045],
  [15, 0.025],
  [30, 0.05],
  [45, 0.038],
  [55, 0.02],
  [65, -0.09],
  [78, -0.035],
  [90, 0.045],
  [100, 0.045],
];

/** מכפיל נוסף על סיבוב כף — שומר על «שטוח» בעמידה */
const GAIT_ANKLE_ANIM_MUL = 0.52;

/**
 * Bob אנכי: מינימום בעקב (0% / 50%), מקסימום באמצע עמידה (רגל נושאת כמעט אנכית) — ~15% / ~65%.
 */
const GAIT_BOB_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0],
  [15, 1],
  [28, 0.32],
  [50, 0],
  [65, 1],
  [82, 0.3],
  [100, 0],
];

const GAIT_TORSO_PITCH_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0.028],
  [30, -0.02],
  [50, 0.028],
  [80, -0.02],
  [100, 0.028],
];

const GAIT_TORSO_ROLL_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0],
  [25, 0.017],
  [50, 0],
  [75, -0.017],
  [100, 0],
];

/** מרפק מסונכרן לפאזת רגל נגדית: יותר כיפוף ב־swing קדימה, כמעט ישר ב־stance אחורה */
const GAIT_OPPOSITE_ELBOW_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 0.4],
  [25, 0.28],
  [50, 0.1],
  [75, 0.28],
  [100, 0.4],
];

/** מקדם כתף מול ירך נגדית (שומר התאמה מתמטית לפאזת הירך) */
const ARM_HIP_TO_SHOULDER = 0.88;

/**
 * היפוך כיוון סיבוב ירך + הקטנת משרעת 20% (×0.8) — מתקן אשלית «הליכה אחורה» / החלקת כף.
 * ערכי keyframes נשארים; היישום על rotation.x של הירך.
 */
const GAIT_HIP_SWING_MUL = -0.8;

const GAIT_TORSO_YAW_MAX = 0.08;

// ── Simple non-interactive meshes (base body silhouette) ──────────
/** עור בסיס רך (נייטרלי; מיפוי קליני אדום/ירוק נשאר ב־MuscleSegment / limb tint) */
const BASE_SKIN = '#e6f3f7';
const GOLD_SKIN = '#c9a227';

type LimbPickOverlay = 'none' | 'injury' | 'orange' | 'clinical' | 'selfCare';

function limbPickOverlayKind(
  injuryHighlight: boolean,
  clinicalSecondary: boolean,
  clinicalLocked: boolean,
  selfCareSelected: boolean
): LimbPickOverlay {
  if (injuryHighlight) return 'injury';
  if (clinicalSecondary) return 'orange';
  if (clinicalLocked) return 'clinical';
  if (selfCareSelected) return 'selfCare';
  return 'none';
}

/** הדגשות על גלילי זרוע/ירך — עוצמת emissive וחומר כמו ב־MuscleSegment */
function limbPickPhysicalTint(
  kind: LimbPickOverlay,
  goldSkin: boolean,
  levelTier: LevelTier
): {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  envMapIntensity: number;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThicknessRange: [number, number];
} | null {
  if (goldSkin || kind === 'none') return null;
  const inj = levelTier === 'injured';
  if (kind === 'injury') {
    return {
      color: '#fecaca',
      emissive: '#dc2626',
      emissiveIntensity: 1.22,
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.24,
      clearcoatRoughness: 0.32,
      transmission: 0,
      thickness: 0,
      ior: 1.5,
      envMapIntensity: 1.48,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    };
  }
  if (kind === 'selfCare') {
    return {
      color: inj ? '#4ade80' : '#22c55e',
      emissive: '#15803d',
      emissiveIntensity: 1.45 + (inj ? 0 : 0.08),
      metalness: 0.1,
      roughness: inj ? 0.4 : 0.35,
      clearcoat: inj ? 0.2 : 0.24,
      clearcoatRoughness: 0.32,
      transmission: 0,
      thickness: 0,
      ior: 1.5,
      envMapIntensity: Math.max(1.65, 1.85),
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    };
  }
  if (kind === 'clinical') {
    return {
      color: '#dc2626',
      emissive: '#7f1d1d',
      emissiveIntensity: 1.35,
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.24,
      clearcoatRoughness: 0.3,
      transmission: 0,
      thickness: 0,
      ior: 1.5,
      envMapIntensity: 1.65,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    };
  }
  if (kind === 'orange') {
    return {
      color: '#ea580c',
      emissive: '#9a3412',
      emissiveIntensity: 1.18,
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.24,
      clearcoatRoughness: 0.3,
      transmission: 0,
      thickness: 0,
      ior: 1.5,
      envMapIntensity: 1.55,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    };
  }
  return null;
}

interface BaseProps {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  level: number;
  goldSkin?: boolean;
  muscleStage: MuscleEvolutionStage;
  /**
   * 0 = ללא נפח קדקודים (מפרקים, כפות, אגן, ראש).
   * 1 = נפח שריר על גלילי זרוע/ירך בלבד (ביספס/שוק/ירך/אמה).
   */
  vertexInflationWeight?: number;
  /** מכפיל שכבת צמיחה לפי מקטע */
  growthLayerWeight?: number;
  pickArea?: BodyArea | null;
  injuryHighlight?: boolean;
  clinicalLocked?: boolean;
  clinicalSecondary?: boolean;
  selfCareSelected?: boolean;
  clinicalBlockSelfCare?: boolean;
  patientPortalInteractive?: boolean;
  onAreaClick?: (area: BodyArea) => void;
  /** true = mesh לא חוסם raycast (מעבר בחירה למקטע מאחור, למשל שוק מול שכבת עגל) */
  disableRaycast?: boolean;
  /** ללא אנימציית נפח — לחיצות מדויקות */
  motionSteady?: boolean;
  /** כפות יד — עור שקוף־מעט כמו אמה (לא כובע מפרק ירוק) */
  translucentWhenHealthy?: boolean;
  /**
   * `glass` — transmission. `frost` — לבן שקוף, opacity 0.85, depthWrite (ידיים/רגליים).
   */
  translucentLimbStyle?: 'glass' | 'frost';
}

function BaseSegment({
  geometry,
  position,
  rotation,
  level,
  goldSkin,
  muscleStage,
  vertexInflationWeight = 0,
  growthLayerWeight = 1,
  pickArea = null,
  injuryHighlight = false,
  clinicalLocked = false,
  clinicalSecondary = false,
  selfCareSelected = false,
  clinicalBlockSelfCare = false,
  patientPortalInteractive = false,
  onAreaClick,
  disableRaycast = false,
  motionSteady = false,
  translucentWhenHealthy = false,
  translucentLimbStyle = 'glass',
}: BaseProps) {
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;
  const baseColor = goldSkin ? GOLD_SKIN : BASE_SKIN;
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const inflationU = useMemo(() => ({ value: 0 }), []);
  const inflationEnabled = !goldSkin && level > 20 && vertexInflationWeight > 0;
  const pickable = !!pickArea && !!onAreaClick && !goldSkin;

  useLayoutEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    if (disableRaycast) {
      m.raycast = () => {};
    } else {
      m.raycast = THREE.Mesh.prototype.raycast.bind(m);
    }
  }, [disableRaycast]);

  useLayoutEffect(() => {
    if (!inflationEnabled) {
      inflationU.value = 0;
      return () => {
        clearMuscleVertexInflationPatch(matRef.current);
      };
    }
    let raf = 0;
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const m = matRef.current;
        if (m) installMuscleVertexInflation(m, inflationU);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      clearMuscleVertexInflationPatch(matRef.current);
    };
  }, [inflationEnabled, inflationU]);

  useFrame(({ clock }) => {
    if (!inflationEnabled || motionSteady) return;
    const g = Math.max(0, Math.min(1, growthLayerWeight));
    inflationU.value =
      getMuscleVertexInflation(level, clock.elapsedTime) * vertexInflationWeight * g;
  });

  const injuryLight =
    injuryHighlight && pickArea ? (
      <pointLight color="#ff2200" intensity={1.05} distance={0.48} decay={2} position={[0, 0, 0.05]} />
    ) : null;

  const pointerProps = pickable
    ? {
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          document.body.style.cursor =
            patientPortalInteractive && clinicalBlockSelfCare ? 'not-allowed' : 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          if (pickArea) onAreaClick!(pickArea);
        },
      }
    : {};

  const limbKind = limbPickOverlayKind(
    injuryHighlight,
    clinicalSecondary,
    clinicalLocked,
    selfCareSelected
  );
  const tier = getLevelTier(level);
  const limbTint = limbPickPhysicalTint(limbKind, goldSkin ?? false, tier);
  const hasLimbVisualOverlay = limbTint != null && !goldSkin;
  const transSkin =
    Boolean(translucentWhenHealthy) && !goldSkin && limbTint == null;
  const useFrostTranslucent = transSkin && translucentLimbStyle === 'frost';
  const meshRenderOrder = useFrostTranslucent ? 1 : 0;

  if (!goldSkin && muscleStage === 'post_injury') {
    if (hasLimbVisualOverlay) {
      return (
        <group position={position} rotation={rot} scale={[0.96, 0.97, 0.96]}>
          {injuryLight}
          <mesh
            ref={meshRef}
            geometry={geometry}
            castShadow
            receiveShadow
            renderOrder={meshRenderOrder}
            {...pointerProps}
          >
            <meshPhysicalMaterial
              ref={matRef}
              color={limbTint.color}
              roughness={limbTint.roughness}
              metalness={limbTint.metalness}
              clearcoat={limbTint.clearcoat}
              clearcoatRoughness={limbTint.clearcoatRoughness}
              transmission={limbTint.transmission}
              thickness={limbTint.thickness}
              ior={limbTint.ior}
              envMapIntensity={limbTint.envMapIntensity}
              emissive={limbTint.emissive}
              emissiveIntensity={limbTint.emissiveIntensity}
              iridescence={limbTint.iridescence}
              iridescenceIOR={limbTint.iridescenceIOR}
              iridescenceThicknessRange={limbTint.iridescenceThicknessRange}
              transparent={false}
              opacity={1}
              depthWrite
            />
          </mesh>
        </group>
      );
    }
    return (
      <group position={position} rotation={rot} scale={[0.96, 0.97, 0.96]}>
        {injuryLight}
        <mesh
          ref={meshRef}
          geometry={geometry}
          castShadow
          receiveShadow
          renderOrder={meshRenderOrder}
          {...pointerProps}
        >
          <meshPhysicalMaterial
            ref={matRef}
            color={useFrostTranslucent ? '#ffffff' : transSkin ? '#eef8fa' : '#cbd5e1'}
            roughness={useFrostTranslucent ? 0.5 : transSkin ? 0.28 : 0.4}
            metalness={0.1}
            clearcoat={useFrostTranslucent ? 0.1 : transSkin ? 0.22 : 0.18}
            clearcoatRoughness={useFrostTranslucent ? 0.45 : transSkin ? 0.32 : 0.36}
            transmission={useFrostTranslucent ? 0 : transSkin ? 0.34 : 0}
            thickness={useFrostTranslucent ? 0 : transSkin ? 0.4 : 0}
            ior={1.5}
            envMapIntensity={useFrostTranslucent ? 0.65 : transSkin ? 0.95 : 0.72}
            emissive={useFrostTranslucent ? '#000000' : '#0e7490'}
            emissiveIntensity={useFrostTranslucent ? 0 : 0.08}
            iridescence={0}
            iridescenceIOR={1}
            iridescenceThicknessRange={[0, 0]}
            transparent={transSkin}
            opacity={useFrostTranslucent ? 0.85 : 1}
            depthWrite={useFrostTranslucent || !transSkin}
          />
        </mesh>
      </group>
    );
  }

  if (tier === 'injured') {
    if (hasLimbVisualOverlay) {
      return (
        <group position={position} rotation={rot}>
          {injuryLight}
          <mesh
            ref={meshRef}
            geometry={geometry}
            castShadow
            receiveShadow
            renderOrder={meshRenderOrder}
            {...pointerProps}
          >
            <meshPhysicalMaterial
              ref={matRef}
              color={limbTint.color}
              roughness={limbTint.roughness}
              metalness={limbTint.metalness}
              clearcoat={limbTint.clearcoat}
              clearcoatRoughness={limbTint.clearcoatRoughness}
              transmission={limbTint.transmission}
              thickness={limbTint.thickness}
              ior={limbTint.ior}
              envMapIntensity={limbTint.envMapIntensity}
              emissive={limbTint.emissive}
              emissiveIntensity={limbTint.emissiveIntensity}
              iridescence={limbTint.iridescence}
              iridescenceIOR={limbTint.iridescenceIOR}
              iridescenceThicknessRange={limbTint.iridescenceThicknessRange}
              transparent={false}
              opacity={1}
              depthWrite
            />
          </mesh>
        </group>
      );
    }
    return (
      <group position={position} rotation={rot}>
        {injuryLight}
        <mesh
          ref={meshRef}
          geometry={geometry}
          castShadow
          receiveShadow
          renderOrder={meshRenderOrder}
          {...pointerProps}
        >
          <meshPhysicalMaterial
            ref={matRef}
            color={goldSkin ? '#b8941f' : useFrostTranslucent ? '#ffffff' : transSkin ? '#eef8fa' : '#e8eaef'}
            roughness={goldSkin ? 0.32 : useFrostTranslucent ? 0.5 : transSkin ? 0.28 : 0.4}
            metalness={goldSkin ? 0.45 : 0.1}
            clearcoat={goldSkin ? 0.35 : useFrostTranslucent ? 0.1 : transSkin ? 0.2 : 0.14}
            clearcoatRoughness={goldSkin ? 0.28 : useFrostTranslucent ? 0.45 : transSkin ? 0.34 : 0.38}
            transmission={goldSkin || useFrostTranslucent ? 0 : transSkin ? 0.34 : 0}
            thickness={useFrostTranslucent ? 0 : transSkin ? 0.4 : 0}
            ior={1.5}
            envMapIntensity={goldSkin ? 1.2 : useFrostTranslucent ? 0.65 : transSkin ? 0.9 : 0.4}
            emissive={goldSkin ? '#3d2a06' : '#000000'}
            emissiveIntensity={goldSkin ? 0.04 : 0}
            iridescence={0}
            iridescenceIOR={1}
            iridescenceThicknessRange={[0, 0]}
            transparent={!goldSkin && transSkin}
            opacity={useFrostTranslucent ? 0.85 : 1}
            depthWrite={goldSkin || useFrostTranslucent || !transSkin}
          />
        </mesh>
      </group>
    );
  }

  if (tier === 'active') {
    return (
      <group position={position} rotation={rot}>
        {injuryLight}
        <mesh
          ref={meshRef}
          geometry={geometry}
          castShadow
          receiveShadow
          renderOrder={meshRenderOrder}
          {...pointerProps}
        >
          <meshPhysicalMaterial
            ref={matRef}
            color={
              limbTint?.color ??
              (useFrostTranslucent ? '#ffffff' : transSkin ? '#eef8fa' : baseColor)
            }
            roughness={
              limbTint ? limbTint.roughness : goldSkin ? 0.35 : useFrostTranslucent ? 0.5 : transSkin ? 0.26 : 0.35
            }
            metalness={limbTint ? limbTint.metalness : goldSkin ? 0.55 : 0.1}
            clearcoat={
              limbTint ? limbTint.clearcoat : goldSkin ? 0.42 : useFrostTranslucent ? 0.1 : transSkin ? 0.2 : 0.22
            }
            clearcoatRoughness={
              limbTint
                ? limbTint.clearcoatRoughness
                : goldSkin
                  ? 0.28
                  : useFrostTranslucent
                    ? 0.45
                    : transSkin
                      ? 0.32
                      : 0.3
            }
            transmission={limbTint ? limbTint.transmission : useFrostTranslucent ? 0 : transSkin ? 0.38 : 0}
            thickness={limbTint ? limbTint.thickness : useFrostTranslucent ? 0 : transSkin ? 0.42 : 0}
            ior={limbTint ? limbTint.ior : 1.5}
            envMapIntensity={
              limbTint ? limbTint.envMapIntensity : goldSkin ? 1.45 : useFrostTranslucent ? 0.65 : transSkin ? 1.08 : 1.22
            }
            emissive={limbTint?.emissive ?? (goldSkin ? '#3d2a06' : useFrostTranslucent ? '#000000' : '#082830')}
            emissiveIntensity={
              limbTint?.emissiveIntensity ?? (goldSkin ? 0.04 : useFrostTranslucent ? 0 : 0.06)
            }
            iridescence={limbTint ? limbTint.iridescence : 0}
            iridescenceIOR={limbTint ? limbTint.iridescenceIOR : 1}
            iridescenceThicknessRange={limbTint ? limbTint.iridescenceThicknessRange : [0, 0]}
            transparent={Boolean(limbTint) ? false : transSkin}
            opacity={useFrostTranslucent ? 0.85 : 1}
            depthWrite={Boolean(limbTint) || useFrostTranslucent || !transSkin}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={rot}>
      {injuryLight}
      <mesh
        ref={meshRef}
        geometry={geometry}
        castShadow
        receiveShadow
        renderOrder={meshRenderOrder}
        {...pointerProps}
      >
        <meshPhysicalMaterial
          ref={matRef}
          color={
            limbTint?.color ??
            (injuryHighlight ? '#fecaca' : useFrostTranslucent ? '#ffffff' : transSkin ? '#eef8fa' : baseColor)
          }
          roughness={
            limbTint ? limbTint.roughness : goldSkin ? 0.28 : useFrostTranslucent ? 0.5 : transSkin ? 0.26 : 0.32
          }
          metalness={limbTint ? limbTint.metalness : goldSkin ? 0.65 : 0.12}
          clearcoat={
            limbTint ? limbTint.clearcoat : goldSkin ? 0.38 : useFrostTranslucent ? 0.1 : transSkin ? 0.22 : 0.28
          }
          clearcoatRoughness={
            limbTint
              ? limbTint.clearcoatRoughness
              : goldSkin
                ? 0.24
                : useFrostTranslucent
                  ? 0.45
                  : transSkin
                    ? 0.3
                    : 0.28
          }
          transmission={limbTint ? limbTint.transmission : useFrostTranslucent ? 0 : transSkin ? 0.38 : 0}
          thickness={limbTint ? limbTint.thickness : useFrostTranslucent ? 0 : transSkin ? 0.42 : 0}
          ior={limbTint ? limbTint.ior : 1.5}
          envMapIntensity={
            limbTint ? limbTint.envMapIntensity : goldSkin ? 1.75 : useFrostTranslucent ? 0.65 : transSkin ? 1.12 : 1.55
          }
          emissive={limbTint?.emissive ?? (goldSkin ? '#3d2a06' : useFrostTranslucent ? '#000000' : '#082830')}
          emissiveIntensity={
            limbTint?.emissiveIntensity ?? (goldSkin ? 0.04 : useFrostTranslucent ? 0 : 0.06)
          }
          iridescence={limbTint ? limbTint.iridescence : 0}
          iridescenceIOR={limbTint ? limbTint.iridescenceIOR : 1}
          iridescenceThicknessRange={limbTint ? limbTint.iridescenceThicknessRange : [0, 0]}
          transparent={Boolean(limbTint) ? false : transSkin}
          opacity={useFrostTranslucent ? 0.85 : 1}
          depthWrite={Boolean(limbTint) || useFrostTranslucent || !transSkin}
        />
      </mesh>
    </group>
  );
}

/** עטיפה סטטית — תנודת idle הוסרה לטובת דיוק raycast */
function IdleSwayRoot({ children }: { children: ReactNode }) {
  return <group>{children}</group>;
}

/** פיבוט ירך / ברך להליכה במקום (קואורדינטות מקומיות מול מרכז הירך) */
const WALK_HIP_L: [number, number, number] = [0.24, 0.08, 0.07];
const WALK_HIP_R: [number, number, number] = [-0.24, 0.08, 0.07];
const WALK_KNEE_OFF: [number, number, number] = [0, -0.7, 0.01];

/** שוק: קפסולה 0.32 + r 0.068; קצה תחתון ≈ −0.588 — כף מיושרת עם חפיפה קלה לקרסול */
const SHIN_DISTAL_Y = -0.36 - (0.32 / 2 + 0.068);
/** קודם היה scale 1.06 על קבוצת הרגל — המכפלה משמרת את אותה נקודת חיבור לשוק */
const FOOT_ATTACH_Y = (SHIN_DISTAL_Y + 0.02) * 1.06;

/** אמה createForearm: גליל 0.36 — קצה דיסטלי ב־−Y; חפיפה קלה לפרק כף (בלי כדור מפרק ירוק) */
const FOREARM_CYLINDER_LEN = 0.36;
const FOREARM_DISTAL_LOCAL_Y = -FOREARM_CYLINDER_LEN / 2;
const HAND_WRIST_OVERLAP = 0.016;
const HAND_ATTACH_Y = FOREARM_DISTAL_LOCAL_Y + HAND_WRIST_OVERLAP;

/**
 * קנה מידה לתווי פנים: בסיס mobile × +30% נוסף לקריאות מרחוק.
 * (1.175 × 1.3 ≈ 1.528)
 */
const HEAD_FACE_FEATURE_SCALE = 1.175 * 1.3;

/**
 * פנים נייטרליות וידידותיות (סטייליזציה פרוצדורלית — לא פוטו־ריאל מלא ללא טקסטורות).
 * גבות ישרות־רכות, חיוך עדין; raycast כבוי.
 */
function HeadFaceFeatures({ level: _level }: { level: number }) {
  void _level;
  const zSurf = HEAD_RADIUS - 0.006;
  const F = HEAD_FACE_FEATURE_SCALE;

  const eyeWhiteGeo = useMemo(
    () => new THREE.SphereGeometry(0.023 * F, 14, 12),
    []
  );
  const irisGeo = useMemo(() => new THREE.SphereGeometry(0.0095 * F, 10, 8), []);
  const browGeo = useMemo(
    () => new THREE.BoxGeometry(0.056 * F, 0.0065 * F, 0.011 * F),
    []
  );
  const noseGeo = useMemo(() => new THREE.CylinderGeometry(0.012, 0.017, 0.044, 10, 1, false), []);
  const mouthTubeGeo = useMemo(() => {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-0.05 * F, -0.05 * F, zSurf - 0.003),
      new THREE.Vector3(-0.026 * F, -0.048 * F, zSurf - 0.001),
      new THREE.Vector3(0.026 * F, -0.048 * F, zSurf - 0.001),
      new THREE.Vector3(0.05 * F, -0.05 * F, zSurf - 0.003),
    );
    return new THREE.TubeGeometry(curve, 22, 0.0062 * F, 7, false);
  }, [zSurf, F]);

  const faceRootRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = faceRootRef.current;
    if (!g) return;
    g.traverse((o) => {
      if ((o as THREE.Object3D & { isMesh?: boolean }).isMesh) o.raycast = () => {};
    });
  }, []);

  const eyePosMul = 1.12 * 1.3;
  const eyeX = 0.053 * eyePosMul;
  const eyeY = 0.05 * eyePosMul;
  const browY = eyeY + 0.026 * 1.3;
  const matSkin = {
    roughness: 0.35,
    metalness: 0.1,
    clearcoat: 0.2,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.72,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
    iridescence: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  } as const;

  return (
    <group ref={faceRootRef} position={[0, HEAD_CENTER_Y, 0]}>
      <mesh
        geometry={eyeWhiteGeo}
        position={[eyeX, eyeY, zSurf - 0.002]}
        scale={[1, 0.5, 0.46]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshPhysicalMaterial color="#f5f9fc" {...matSkin} />
      </mesh>
      <mesh
        geometry={irisGeo}
        position={[eyeX, eyeY, zSurf + 0.014]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshBasicMaterial color="#0f172a" depthWrite />
      </mesh>

      <mesh
        geometry={eyeWhiteGeo}
        position={[-eyeX, eyeY, zSurf - 0.002]}
        scale={[1, 0.5, 0.46]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshPhysicalMaterial color="#f5f9fc" {...matSkin} />
      </mesh>
      <mesh
        geometry={irisGeo}
        position={[-eyeX, eyeY, zSurf + 0.014]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshBasicMaterial color="#0f172a" depthWrite />
      </mesh>

      <mesh
        geometry={browGeo}
        position={[eyeX, browY, zSurf - 0.004]}
        rotation={[0.03, 0, 0.1]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshBasicMaterial color="#0f172a" depthWrite />
      </mesh>
      <mesh
        geometry={browGeo}
        position={[-eyeX, browY, zSurf - 0.004]}
        rotation={[0.03, 0, -0.1]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshBasicMaterial color="#0f172a" depthWrite />
      </mesh>

      <mesh
        geometry={noseGeo}
        position={[0, 0.018, zSurf + 0.026]}
        rotation={[0.35, 0, 0]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshPhysicalMaterial
          color="#eef4f6"
          roughness={0.36}
          metalness={0.1}
          clearcoat={0.2}
          clearcoatRoughness={0.34}
          envMapIntensity={0.65}
          transmission={0}
          thickness={0}
          ior={1.5}
          iridescence={0}
          transparent={false}
          opacity={1}
          depthWrite
        />
      </mesh>

      <mesh geometry={mouthTubeGeo} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#0f172a" depthWrite />
      </mesh>
    </group>
  );
}

// ── Geometry cache (built once per render) ────────────────────────
function useGeometries() {
  return useMemo(() => ({
    upperTorso:   createUpperTorso(),
    lowerTorso:   createLowerTorso(),
    shoulderL:    createShoulder(),
    shoulderR:    createShoulder(),
    upperArmL:    createUpperArm(),
    upperArmR:    createUpperArm(),
    forearmL:     createForearm(),
    forearmR:     createForearm(),
    thighL:       createThigh(false),  // patient left = world +x
    thighR:       createThigh(true),   // patient right = world -x
    calfL:        createCalf(),
    calfR:        createCalf(),
    kneeL:        createKnee(),
    kneeR:        createKnee(),
    gluteL:       createGlute(),
    gluteR:       createGlute(),
    // Simple spheres/capsules for non-displaced parts
    head:         new THREE.SphereGeometry(HEAD_RADIUS, 36, 30),
    ear:          new THREE.SphereGeometry(0.062, 12, 10),
    neck:         new THREE.CylinderGeometry(0.096, 0.114, NECK_HEIGHT, 20, 6),
    pelvis:       new THREE.CylinderGeometry(0.230, 0.212, 0.24, 20, 6),
    handL:        createNormalHandGeometry(false),
    handR:        createNormalHandGeometry(true),
    elbowL:       new THREE.SphereGeometry(0.118, 18, 14),
    elbowR:       new THREE.SphereGeometry(0.118, 18, 14),
    footL:        createDetailedFootGeometry(false),
    footR:        createDetailedFootGeometry(true),
    shinL:        new THREE.CapsuleGeometry(0.068, 0.32, 4, 14),
    shinR:        new THREE.CapsuleGeometry(0.068, 0.32, 4, 14),
  }), []);
}

// ── Props ─────────────────────────────────────────────────────────
interface AnatomyModelProps {
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  /** Therapist clinical / rehab focus (defaults to primaryArea) */
  clinicalArea?: BodyArea;
  /** Green multi-select zones from patient picks */
  selfCareSelectedAreas?: BodyArea[];
  painByArea: Partial<Record<BodyArea, number>>;
  level: number;
  xp?: number;
  xpForNextLevel?: number;
  streak?: number;
  /** Areas with a logged exercise finish today — gold / blue muscle highlight */
  strengthenedAreasToday?: BodyArea[];
  selectedArea?: BodyArea | null;
  onAreaClick?: (area: BodyArea) => void;
  /** ציוד מעוצב — מיפוי אנטומי ב־EquippedGearAttachments */
  equippedGear: EquippedGearSnapshot;
  /** מקטעים להדגשת פגיעה — שכבת «בעיה» (אדום) */
  injuryHighlightSegments?: BodyArea[];
  /** מוקד משני מהמטפל — כתום */
  secondaryClinicalBodyAreas?: BodyArea[];
  /** כבה אנימציות מפריעות — לחיצות מדויקות (ברירת מחדל: כן) */
  stableInteraction?: boolean;
  /** פורטל מטופל — עכבר «אסור» על אזורים חסומים לפרהאב */
  patientPortalInteractive?: boolean;
  /** פורטל: הקפאת הליכה במקום בזמן hover על המפה (שומר פוזה; חידוש חלק מהשעון) */
  pauseWalkAnimation?: boolean;
  /** מכפילי נפח צמיחה לפי מקטע (שכבת «פתרון»), ברירת מחדל 1 */
  segmentGrowthMul?: Partial<Record<BodyArea, number>>;
}

export default function AnatomyModel({
  activeAreas,
  primaryArea,
  clinicalArea: clinicalAreaProp,
  selfCareSelectedAreas = [],
  painByArea,
  level,
  xp,
  xpForNextLevel,
  streak,
  strengthenedAreasToday = [],
  selectedArea,
  onAreaClick,
  equippedGear,
  injuryHighlightSegments = [],
  secondaryClinicalBodyAreas = [],
  stableInteraction = true,
  patientPortalInteractive = false,
  pauseWalkAnimation = false,
  segmentGrowthMul,
}: AnatomyModelProps) {
  const gearGoldSkin = equippedGear.skin === 'gold_skin';
  const geos = useGeometries();
  const primaryLightRef = useRef<THREE.PointLight>(null);
  const clinicalArea = clinicalAreaProp ?? primaryArea;
  const injurySet = useMemo(() => new Set(injuryHighlightSegments), [injuryHighlightSegments]);
  const secondarySet = useMemo(
    () => new Set(secondaryClinicalBodyAreas),
    [secondaryClinicalBodyAreas]
  );
  const growthOf = (a: BodyArea) =>
    Math.max(0, Math.min(1, segmentGrowthMul?.[a] ?? 1));
  const clinicalLockVisual = (a: BodyArea) =>
    clinicalArea != null &&
    bodyAreaIsClinicalFocus(a, clinicalArea) &&
    !secondarySet.has(a);
  const clinicalRefForBlock = clinicalArea ?? primaryArea ?? ('neck' as BodyArea);
  const limbPickProps = (a: BodyArea) => ({
    injuryHighlight: injurySet.has(a),
    clinicalLocked: clinicalLockVisual(a),
    clinicalSecondary: secondarySet.has(a),
    selfCareSelected:
      selfCareSelectedAreas.includes(a) &&
      !bodyAreaBlocksSelfCare(a, clinicalRefForBlock, secondaryClinicalBodyAreas),
    clinicalBlockSelfCare: bodyAreaBlocksSelfCare(a, clinicalRefForBlock, secondaryClinicalBodyAreas),
    patientPortalInteractive,
  });
  const strengthenedSet = useMemo(
    () => new Set(strengthenedAreasToday),
    [strengthenedAreasToday]
  );

  const muscleStage = useMemo(() => getMuscleEvolutionStage(level), [level]);
  const muscleMaps = useMemo(
    () => createMuscleFiberTextures(256, muscleStage === 'power' ? 'strong' : 'strengthening'),
    [muscleStage]
  );

  useEffect(() => {
    return () => {
      muscleMaps.normalMap.dispose();
      muscleMaps.roughnessMap.dispose();
    };
  }, [muscleMaps]);

  const glowPos = useMemo<[number, number, number]>(
    () => primaryArea ? (AREA_GLOW[primaryArea] ?? [0, 0.4, 0.4]) : [0, 0.4, 0.4],
    [primaryArea]
  );

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const walkInPlace = patientPortalInteractive && !prefersReducedMotion;
  const walkRootRef = useRef<THREE.Group>(null);
  const torsoSwayRef = useRef<THREE.Group>(null);
  const leftThighRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightThighRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const leftShoulderPivotRef = useRef<THREE.Group>(null);
  const leftElbowPivotRef = useRef<THREE.Group>(null);
  const rightShoulderPivotRef = useRef<THREE.Group>(null);
  const rightElbowPivotRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);

  /** סנכרון הדגשת hover בין חזה↔גב עליון ובטן↔גב תחתון (מקטע קליק נשאר נפרד) */
  const [chestHover, setChestHover] = useState(false);
  const [backUpperHover, setBackUpperHover] = useState(false);
  const [abdomenHover, setAbdomenHover] = useState(false);
  const [backLowerHover, setBackLowerHover] = useState(false);

  // Pulse primary-area glow
  useFrame(({ clock }) => {
    if (!primaryLightRef.current || stableInteraction) return;
    const lf = Math.min(level, 100) / 100;
    const pulse = Math.sin(clock.elapsedTime * 2.4) * 0.38;
    primaryLightRef.current.intensity = (0.55 + lf * 1.15) + pulse;
  });

  /** הליכה במקום — מחזור קליני (keyframes + lerpAngle), רגל ימין ב־t+0.5, bob/מותן מסונכרנים */
  useFrame(({ clock }) => {
    const resetArmPivots = () => {
      for (const r of [
        leftShoulderPivotRef,
        rightShoulderPivotRef,
        leftElbowPivotRef,
        rightElbowPivotRef,
      ]) {
        if (r.current) {
          r.current.rotation.x = 0;
          r.current.rotation.y = 0;
          r.current.rotation.z = 0;
        }
      }
    };
    const resetFeet = () => {
      if (leftFootRef.current) leftFootRef.current.rotation.x = 0;
      if (rightFootRef.current) rightFootRef.current.rotation.x = 0;
    };

    if (!walkInPlace) {
      if (walkRootRef.current) walkRootRef.current.position.y = 0;
      if (torsoSwayRef.current) {
        torsoSwayRef.current.rotation.x = 0;
        torsoSwayRef.current.rotation.y = 0;
        torsoSwayRef.current.rotation.z = 0;
      }
      if (leftThighRef.current) leftThighRef.current.rotation.x = 0;
      if (leftKneeRef.current) leftKneeRef.current.rotation.x = 0;
      if (rightThighRef.current) rightThighRef.current.rotation.x = 0;
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = 0;
      resetArmPivots();
      resetFeet();
      return;
    }
    if (pauseWalkAnimation) {
      resetArmPivots();
      resetFeet();
      return;
    }

    const t = (clock.elapsedTime % WALK_CYCLE_SEC) / WALK_CYCLE_SEC;
    const tRight = (t + 0.5) % 1.0;

    const bobAmp = 0.025;
    const bob = bobAmp * lerpAngle(t, GAIT_BOB_KEYFRAMES);
    if (walkRootRef.current) walkRootRef.current.position.y = bob;
    if (torsoSwayRef.current) {
      torsoSwayRef.current.rotation.x = lerpAngle(t, GAIT_TORSO_PITCH_KEYFRAMES);
      torsoSwayRef.current.rotation.z = lerpAngle(t, GAIT_TORSO_ROLL_KEYFRAMES);
      /** סביבת Y: אל הרגל הקדמית/ב־swing (מקס׳ ~0.08) */
      torsoSwayRef.current.rotation.y =
        GAIT_TORSO_YAW_MAX * Math.cos(t * Math.PI * 2);
    }

    const thighBias = 0.028;
    const hipLRaw = lerpAngle(t, GAIT_HIP_KEYFRAMES);
    const hipRRaw = lerpAngle(tRight, GAIT_HIP_KEYFRAMES);

    if (leftThighRef.current) {
      leftThighRef.current.rotation.x = hipLRaw * GAIT_HIP_SWING_MUL + thighBias;
    }
    if (leftKneeRef.current) {
      leftKneeRef.current.rotation.x = lerpAngle(t, GAIT_KNEE_KEYFRAMES);
    }
    if (leftFootRef.current) {
      leftFootRef.current.rotation.x =
        lerpAngle(t, GAIT_ANKLE_KEYFRAMES) * GAIT_ANKLE_ANIM_MUL;
    }

    if (rightThighRef.current) {
      rightThighRef.current.rotation.x = hipRRaw * GAIT_HIP_SWING_MUL + thighBias;
    }
    if (rightKneeRef.current) {
      rightKneeRef.current.rotation.x = lerpAngle(tRight, GAIT_KNEE_KEYFRAMES);
    }
    if (rightFootRef.current) {
      rightFootRef.current.rotation.x =
        lerpAngle(tRight, GAIT_ANKLE_KEYFRAMES) * GAIT_ANKLE_ANIM_MUL;
    }

    /**
     * נגדיות לרגל: כתף שמאל ← פאזת ירך ימין, כתף ימין ← פאזת ירך שמאל.
     * משתמשים באותו כפל כמו הירך כדי לשמור סנכרון מול כיוון ההליכה.
     */
    const shL = hipRRaw * GAIT_HIP_SWING_MUL * ARM_HIP_TO_SHOULDER;
    const shR = hipLRaw * GAIT_HIP_SWING_MUL * ARM_HIP_TO_SHOULDER;
    const elL = lerpAngle(tRight, GAIT_OPPOSITE_ELBOW_KEYFRAMES);
    const elR = -lerpAngle(t, GAIT_OPPOSITE_ELBOW_KEYFRAMES);
    if (leftShoulderPivotRef.current) {
      leftShoulderPivotRef.current.rotation.x = shL;
    }
    if (rightShoulderPivotRef.current) {
      rightShoulderPivotRef.current.rotation.x = shR;
    }
    if (leftElbowPivotRef.current) {
      leftElbowPivotRef.current.rotation.x = elL;
    }
    if (rightElbowPivotRef.current) {
      rightElbowPivotRef.current.rotation.x = elR;
    }
  });

  // Shared props factory (מפרקים: ללא אינפלציה; כן ניתן לסמן פגיעה)
  const S = (area: BodyArea | null) => {
    const inChain =
      area != null && clinicalArea != null && bodyAreaIsClinicalFocus(area, clinicalArea);
    const clinicalSecondary = area != null && secondarySet.has(area);
    const clinicalLocked = Boolean(inChain && !clinicalSecondary);
    const blockSelfCare =
      area != null &&
      bodyAreaBlocksSelfCare(
        area,
        clinicalArea ?? primaryArea ?? ('neck' as BodyArea),
        secondaryClinicalBodyAreas
      );
    const selfCareSelected =
      area != null && selfCareSelectedAreas.includes(area) && !blockSelfCare;
    const inj = area != null && injurySet.has(area);
    return {
      area,
      isActive: area ? activeAreas.includes(area) : false,
      isPrimary: area === primaryArea,
      isHighPain: area ? (painByArea[area] ?? 0) >= 6 : false,
      isSelected: area === selectedArea,
      clinicalLocked,
      selfCareSelected,
      strengthenedToday: area ? strengthenedSet.has(area) : false,
      level,
      xp,
      xpForNextLevel,
      streak,
      muscleStage: muscleStage,
      muscleNormalMap: muscleMaps.normalMap,
      muscleRoughnessMap: muscleMaps.roughnessMap,
      onAreaClick: area ? onAreaClick : undefined,
      vertexInflationWeight: 0,
      growthLayerWeight: area ? growthOf(area) : 1,
      injuryHighlight: inj,
      clinicalSecondary,
      reduceMotion: stableInteraction,
      clinicalBlockSelfCare: blockSelfCare,
      patientPortalInteractive,
    };
  };

  return (
    <group>
      <IdleSwayRoot>
        <group ref={walkRootRef}>
      {/* Pulsing injury spotlight */}
      {primaryArea && (
        <pointLight
          ref={primaryLightRef}
          position={glowPos}
          color="#fecaca"
          intensity={1.15}
          distance={1.15}
          decay={2}
        />
      )}

      <group ref={torsoSwayRef}>
      {/* ══ HEAD ═══════════════════════════════════════════════ */}
      <BaseSegment geometry={geos.head} position={[0, HEAD_CENTER_Y, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <BaseSegment geometry={geos.ear}  position={[ EAR_OFFSET_X, HEAD_CENTER_Y, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <BaseSegment geometry={geos.ear}  position={[-EAR_OFFSET_X, HEAD_CENTER_Y, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <HeadFaceFeatures level={level} />

      {/* ══ NECK ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('neck')} geometry={geos.neck} position={[0, NECK_CENTER_Y, 0]} />

      {/* ══ SHOULDERS — מפרק נפרד מזרוע; Z+ קדימה לעדיפות raycast ═══ */}
      {/* patient LEFT = viewer RIGHT = +x */}
      <MuscleSegment {...S('shoulder_left')} geometry={geos.shoulderL} position={[0.44, 1.3, 0.07]} />
      {/* patient RIGHT = viewer LEFT = -x */}
      <MuscleSegment {...S('shoulder_right')} geometry={geos.shoulderR} position={[-0.44, 1.3, 0.07]} />

      {/* ══ TORSO — גו עליון (חזה+גב צווארי־חזי) · גו תחתון (בטן+מותן); לחיצה נפרדת לכל BodyArea ═══ */}
      <MuscleSegment
        {...S('chest')}
        geometry={geos.upperTorso}
        position={[0, 0.98, 0.034]}
        extraHover={backUpperHover}
        onHoverChange={setChestHover}
      />
      <MuscleSegment
        {...S('back_upper')}
        geometry={geos.upperTorso}
        position={[0, 0.98, -0.034]}
        extraHover={chestHover}
        onHoverChange={setBackUpperHover}
      />
      <MuscleSegment
        {...S('abdomen')}
        geometry={geos.lowerTorso}
        position={[0, 0.54, 0.028]}
        extraHover={backLowerHover}
        onHoverChange={setAbdomenHover}
      />
      <MuscleSegment
        {...S('back_lower')}
        geometry={geos.lowerTorso}
        position={[0, 0.54, -0.028]}
        extraHover={abdomenHover}
        onHoverChange={setBackLowerHover}
      />
      <BaseSegment geometry={geos.pelvis} position={[0, 0.24, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />

      {/* ══ LEFT ARM (+x) — כתף → מרפק → אמה/שורש כף (קואורדינטות מקומיות ממוקדות מפרק) ═══ */}
      {/* אין כדור מפרק נפרד ל־wrist_left/wrist_right — הבחירה הקלינית ממופה ליד/אמה; האמה מצטמצמת אצל שורש כף */}
      <group ref={leftShoulderPivotRef} position={[0.44, 1.3, 0]}>
        <BaseSegment
          geometry={geos.upperArmL}
          position={[0.12, -0.4, 0.048]}
          level={level}
          goldSkin={gearGoldSkin}
          muscleStage={muscleStage}
          vertexInflationWeight={1}
          growthLayerWeight={growthOf('upper_arm_left')}
          pickArea="upper_arm_left"
          {...limbPickProps('upper_arm_left')}
          motionSteady={stableInteraction}
          onAreaClick={onAreaClick}
        />
        <group ref={leftElbowPivotRef} position={[0.14, -0.7, 0.07]}>
          <MuscleSegment {...S('elbow_left')} geometry={geos.elbowL} position={[0, 0, 0]} />
          <group ref={leftForearmRef} position={[-0.02, -0.39, -0.022]}>
            <BaseSegment
              geometry={geos.forearmL}
              position={[0, 0, 0]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={1}
              growthLayerWeight={growthOf('forearm_left')}
              pickArea="forearm_left"
              {...limbPickProps('forearm_left')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
            <BaseSegment
              geometry={geos.handL}
              position={[-0.012, HAND_ATTACH_Y, 0.005]}
              rotation={[0.06, 0.04, -0.14]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              pickArea="hand_left"
              {...limbPickProps('hand_left')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
              translucentWhenHealthy
              translucentLimbStyle="frost"
            />
          </group>
        </group>
      </group>

      {/* ══ RIGHT ARM (-x) ═════════════════════════════════════ */}
      <group ref={rightShoulderPivotRef} position={[-0.44, 1.3, 0]}>
        <BaseSegment
          geometry={geos.upperArmR}
          position={[-0.12, -0.4, 0.048]}
          level={level}
          goldSkin={gearGoldSkin}
          muscleStage={muscleStage}
          vertexInflationWeight={1}
          growthLayerWeight={growthOf('upper_arm_right')}
          pickArea="upper_arm_right"
          {...limbPickProps('upper_arm_right')}
          motionSteady={stableInteraction}
          onAreaClick={onAreaClick}
        />
        <group ref={rightElbowPivotRef} position={[-0.14, -0.7, 0.07]}>
          <MuscleSegment {...S('elbow_right')} geometry={geos.elbowR} position={[0, 0, 0]} />
          <group ref={rightForearmRef} position={[0.02, -0.39, -0.022]}>
            <BaseSegment
              geometry={geos.forearmR}
              position={[0, 0, 0]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={1}
              growthLayerWeight={growthOf('forearm_right')}
              pickArea="forearm_right"
              {...limbPickProps('forearm_right')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
            <BaseSegment
              geometry={geos.handR}
              position={[0.012, HAND_ATTACH_Y, 0.005]}
              rotation={[-0.06, -0.04, 0.14]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              pickArea="hand_right"
              {...limbPickProps('hand_right')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
              translucentWhenHealthy
              translucentLimbStyle="frost"
            />
          </group>
        </group>
      </group>

      </group>

      {/* ══ רגליים — פיבוט ירך/ברך להליכה במקום (פורטל מטופל) ═══ */}
      <group position={WALK_HIP_L}>
        <group ref={leftThighRef}>
          <MuscleSegment {...S('hip_left')} geometry={geos.gluteL} position={[0, 0.06, 0.01]} />
          <BaseSegment
            geometry={geos.thighL}
            position={[0, -0.35, -0.022]}
            level={level}
            goldSkin={gearGoldSkin}
            muscleStage={muscleStage}
            vertexInflationWeight={1}
            growthLayerWeight={growthOf('thigh_left')}
            pickArea="thigh_left"
            {...limbPickProps('thigh_left')}
            motionSteady={stableInteraction}
            onAreaClick={onAreaClick}
          />
          <group position={WALK_KNEE_OFF} ref={leftKneeRef}>
            <MuscleSegment {...S('knee_left')} geometry={geos.kneeL} position={[0, 0, 0]} />
            <BaseSegment
              geometry={geos.shinL}
              position={[0, -0.36, -0.032]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={1}
              growthLayerWeight={growthOf('shin_left')}
              pickArea="shin_left"
              {...limbPickProps('shin_left')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
            <BaseSegment
              geometry={geos.calfL}
              position={[0, -0.38, -0.08]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              disableRaycast
            />
            <group ref={leftFootRef}>
              <BaseSegment
                geometry={geos.footL}
                position={[0.01, FOOT_ATTACH_Y, 0.018]}
                rotation={[0.055, 0.075, 0]}
                level={level}
                goldSkin={gearGoldSkin}
                muscleStage={muscleStage}
                vertexInflationWeight={0}
                pickArea="foot_left"
                {...limbPickProps('foot_left')}
                motionSteady={stableInteraction}
                onAreaClick={onAreaClick}
                translucentWhenHealthy
                translucentLimbStyle="frost"
              />
            </group>
          </group>
        </group>
      </group>

      <group position={WALK_HIP_R}>
        <group ref={rightThighRef}>
          <MuscleSegment {...S('hip_right')} geometry={geos.gluteR} position={[0, 0.06, 0.01]} />
          <BaseSegment
            geometry={geos.thighR}
            position={[0, -0.35, -0.022]}
            level={level}
            goldSkin={gearGoldSkin}
            muscleStage={muscleStage}
            vertexInflationWeight={1}
            growthLayerWeight={growthOf('thigh_right')}
            pickArea="thigh_right"
            {...limbPickProps('thigh_right')}
            motionSteady={stableInteraction}
            onAreaClick={onAreaClick}
          />
          <group position={WALK_KNEE_OFF} ref={rightKneeRef}>
            <MuscleSegment {...S('knee_right')} geometry={geos.kneeR} position={[0, 0, 0]} />
            <BaseSegment
              geometry={geos.shinR}
              position={[0, -0.36, -0.032]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={1}
              growthLayerWeight={growthOf('shin_right')}
              pickArea="shin_right"
              {...limbPickProps('shin_right')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
            <BaseSegment
              geometry={geos.calfR}
              position={[0, -0.38, -0.08]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              disableRaycast
            />
            <group ref={rightFootRef}>
              <BaseSegment
                geometry={geos.footR}
                position={[-0.01, FOOT_ATTACH_Y, 0.018]}
                rotation={[0.055, -0.075, 0]}
                level={level}
                goldSkin={gearGoldSkin}
                muscleStage={muscleStage}
                vertexInflationWeight={0}
                pickArea="foot_right"
                {...limbPickProps('foot_right')}
                motionSteady={stableInteraction}
                onAreaClick={onAreaClick}
                translucentWhenHealthy
                translucentLimbStyle="frost"
              />
            </group>
          </group>
        </group>
      </group>

      <EquippedGearAttachments equipped={equippedGear} />

      {/* ══ GROUND SHADOW (עם שורש ההליכה — צל עוקב אחרי נשיאת הגוף) ═══ */}
      <ContactShadows
        position={[0, -1.712, 0]}
        opacity={0.42}
        scale={2.75}
        blur={2.85}
        far={1.05}
        color="#1e293b"
        resolution={768}
      />
        </group>
      </IdleSwayRoot>
    </group>
  );
}
