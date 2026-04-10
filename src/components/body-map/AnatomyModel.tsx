import {
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
  useEffect,
  type RefObject,
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
const AREA_GLOW: Partial<Record<BodyArea, [number, number, number]>> = {
  neck: [0, 1.48, 0.22],
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

// ── Simple non-interactive meshes (base body silhouette) ──────────
const BASE_SKIN = '#8fb8c8';
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
      metalness: 0.2,
      roughness: 0.38,
      clearcoat: 0.45,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.55,
      iridescence: 0.12,
      iridescenceIOR: 1.12,
      iridescenceThicknessRange: [60, 200],
    };
  }
  if (kind === 'selfCare') {
    return {
      color: '#22c55e',
      emissive: '#15803d',
      emissiveIntensity: 1.45 + (inj ? 0 : 0.08),
      metalness: inj ? 0.14 : 0.28,
      roughness: inj ? 0.38 : 0.18,
      clearcoat: inj ? 0.22 : 0.62,
      clearcoatRoughness: inj ? 0.42 : 0.24,
      envMapIntensity: Math.max(1.9, 2.05),
      iridescence: inj ? 0.12 : 0.25,
      iridescenceIOR: 1.15,
      iridescenceThicknessRange: [80, 280],
    };
  }
  if (kind === 'clinical') {
    return {
      color: '#dc2626',
      emissive: '#7f1d1d',
      emissiveIntensity: 1.35,
      metalness: inj ? 0.14 : 0.28,
      roughness: inj ? 0.32 : 0.24,
      clearcoat: inj ? 0.28 : 0.52,
      clearcoatRoughness: inj ? 0.4 : 0.3,
      envMapIntensity: 1.78,
      iridescence: 0.15,
      iridescenceIOR: 1.12,
      iridescenceThicknessRange: [70, 220],
    };
  }
  if (kind === 'orange') {
    return {
      color: '#ea580c',
      emissive: '#9a3412',
      emissiveIntensity: 1.18,
      metalness: 0.24,
      roughness: 0.34,
      clearcoat: 0.52,
      clearcoatRoughness: 0.32,
      envMapIntensity: 1.72,
      iridescence: 0.18,
      iridescenceIOR: 1.14,
      iridescenceThicknessRange: [70, 240],
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
}: BaseProps) {
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;
  const baseColor = goldSkin ? GOLD_SKIN : BASE_SKIN;
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | null>(null);
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
  const injuredSelfCareGlass = tier === 'injured' && limbKind === 'selfCare' && hasLimbVisualOverlay;

  if (!goldSkin && muscleStage === 'post_injury') {
    if (hasLimbVisualOverlay) {
      return (
        <group position={position} rotation={rot} scale={[0.96, 0.97, 0.96]}>
          {injuryLight}
          <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
            <meshPhysicalMaterial
              ref={matRef}
              color={limbTint.color}
              roughness={limbTint.roughness}
              metalness={limbTint.metalness}
              clearcoat={limbTint.clearcoat}
              clearcoatRoughness={limbTint.clearcoatRoughness}
              envMapIntensity={limbTint.envMapIntensity}
              emissive={limbTint.emissive}
              emissiveIntensity={limbTint.emissiveIntensity}
              iridescence={limbTint.iridescence}
              iridescenceIOR={limbTint.iridescenceIOR}
              iridescenceThicknessRange={limbTint.iridescenceThicknessRange}
              transparent
              opacity={injuredSelfCareGlass ? 0.78 : 0.92}
              depthWrite={!injuredSelfCareGlass}
            />
          </mesh>
        </group>
      );
    }
    return (
      <group position={position} rotation={rot} scale={[0.96, 0.97, 0.96]}>
        {injuryLight}
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
          <meshStandardMaterial
            ref={matRef}
            color="#cbd5e1"
            roughness={0.94}
            metalness={0.02}
            envMapIntensity={0.28}
            transparent
            opacity={0.88}
            depthWrite
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
          <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
            <meshPhysicalMaterial
              ref={matRef}
              color={limbTint.color}
              roughness={limbTint.roughness}
              metalness={limbTint.metalness}
              clearcoat={limbTint.clearcoat}
              clearcoatRoughness={limbTint.clearcoatRoughness}
              envMapIntensity={limbTint.envMapIntensity}
              emissive={limbTint.emissive}
              emissiveIntensity={limbTint.emissiveIntensity}
              iridescence={limbTint.iridescence}
              iridescenceIOR={limbTint.iridescenceIOR}
              iridescenceThicknessRange={limbTint.iridescenceThicknessRange}
              transparent={injuredSelfCareGlass}
              opacity={injuredSelfCareGlass ? 0.72 : 1}
              depthWrite={!injuredSelfCareGlass}
            />
          </mesh>
        </group>
      );
    }
    return (
      <group position={position} rotation={rot}>
        {injuryLight}
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
          <meshStandardMaterial
            ref={matRef}
            color={goldSkin ? '#b8941f' : '#e8eaef'}
            roughness={0.92}
            metalness={goldSkin ? 0.35 : 0.02}
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  }

  if (tier === 'active') {
    return (
      <group position={position} rotation={rot}>
        {injuryLight}
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
          <meshPhysicalMaterial
            ref={matRef}
            color={limbTint?.color ?? baseColor}
            roughness={limbTint ? limbTint.roughness : goldSkin ? 0.35 : 0.82}
            metalness={limbTint ? limbTint.metalness : goldSkin ? 0.65 : 0.05}
            clearcoat={limbTint ? limbTint.clearcoat : goldSkin ? 0.55 : 0.1}
            clearcoatRoughness={limbTint ? limbTint.clearcoatRoughness : 0.42}
            envMapIntensity={limbTint ? limbTint.envMapIntensity : goldSkin ? 1.45 : 1.22}
            emissive={limbTint?.emissive ?? (goldSkin ? '#3d2a06' : '#082830')}
            emissiveIntensity={limbTint?.emissiveIntensity ?? (goldSkin ? 0.04 : 0.06)}
            iridescence={limbTint ? limbTint.iridescence : 0}
            iridescenceIOR={limbTint ? limbTint.iridescenceIOR : 1.22}
            iridescenceThicknessRange={limbTint ? limbTint.iridescenceThicknessRange : [120, 420]}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={rot}>
      {injuryLight}
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow {...pointerProps}>
        <meshPhysicalMaterial
          ref={matRef}
          color={limbTint?.color ?? (injuryHighlight ? '#fecaca' : baseColor)}
          roughness={limbTint ? limbTint.roughness : goldSkin ? 0.22 : 0.26}
          metalness={limbTint ? limbTint.metalness : goldSkin ? 0.78 : 0.55}
          clearcoat={limbTint ? limbTint.clearcoat : goldSkin ? 0.9 : 0.82}
          clearcoatRoughness={limbTint ? limbTint.clearcoatRoughness : 0.2}
          envMapIntensity={limbTint ? limbTint.envMapIntensity : goldSkin ? 1.95 : 1.85}
          emissive={limbTint?.emissive ?? (goldSkin ? '#3d2a06' : '#082830')}
          emissiveIntensity={limbTint?.emissiveIntensity ?? (goldSkin ? 0.04 : 0.06)}
          iridescence={limbTint ? limbTint.iridescence : goldSkin ? 0.35 : 1}
          iridescenceIOR={limbTint ? limbTint.iridescenceIOR : 1.22}
          iridescenceThicknessRange={limbTint ? limbTint.iridescenceThicknessRange : [120, 420]}
        />
      </mesh>
    </group>
  );
}

/** Minimal face markers on +Z (camera-facing); does not replace head mesh. Raycast disabled so picks pass through. */
const FACE_EYE_COLOR = '#2a4554';
const FACE_MOUTH_COLOR = '#3a5666';

function useNoRaycast<T extends THREE.Object3D>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const o = ref.current;
    if (!o) return;
    o.raycast = () => {};
  }, []);
}

/** עטיפה סטטית — תנודת idle הוסרה לטובת דיוק raycast */
function IdleSwayRoot({ children }: { children: ReactNode }) {
  return <group>{children}</group>;
}

/** פיבוט ירך / ברך להליכה במקום (קואורדינטות מקומיות מול מרכז הירך) */
const WALK_HIP_L: [number, number, number] = [0.24, 0.08, 0.07];
const WALK_HIP_R: [number, number, number] = [-0.24, 0.08, 0.07];
const WALK_KNEE_OFF: [number, number, number] = [0, -0.7, 0.01];

function HeadFaceFeatures({ level }: { level: number }) {
  const headCenterY = 1.73;
  const headRadius = 0.225;
  /** Surface Z ≈ +headRadius; features sit slightly inside to avoid z-fighting with head sphere */
  const faceZ = headRadius - 0.012;

  const eyeGeo = useMemo(() => new THREE.SphereGeometry(0.021, 10, 8), []);
  const mouthTubeGeo = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.064, -0.078, faceZ),
      new THREE.Vector3(0, -0.095, faceZ + 0.004),
      new THREE.Vector3(0.064, -0.078, faceZ)
    );
    return new THREE.TubeGeometry(curve, 14, 0.0075, 6, false);
  }, [faceZ]);

  const eyeLRef = useRef<THREE.Mesh>(null);
  const eyeRRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  useNoRaycast(eyeLRef);
  useNoRaycast(eyeRRef);
  useNoRaycast(mouthRef);

  const eyeY = 0.046;
  const eyeX = 0.056;
  const injured = getLevelTier(level) === 'injured';
  const faceOpacity = injured ? 0.5 : 1;
  const faceTransparent = injured;

  return (
    <group position={[0, headCenterY, 0]}>
      <mesh
        ref={eyeLRef}
        geometry={eyeGeo}
        position={[eyeX, eyeY, faceZ]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshPhysicalMaterial
          color={FACE_EYE_COLOR}
          roughness={0.48}
          metalness={0.06}
          clearcoat={0.12}
          clearcoatRoughness={0.45}
          envMapIntensity={0.85}
          transparent={faceTransparent}
          opacity={faceOpacity}
          depthWrite={!faceTransparent}
        />
      </mesh>
      <mesh
        ref={eyeRRef}
        geometry={eyeGeo}
        position={[-eyeX, eyeY, faceZ]}
        castShadow={false}
        receiveShadow={false}
      >
        <meshPhysicalMaterial
          color={FACE_EYE_COLOR}
          roughness={0.48}
          metalness={0.06}
          clearcoat={0.12}
          clearcoatRoughness={0.45}
          envMapIntensity={0.85}
          transparent={faceTransparent}
          opacity={faceOpacity}
          depthWrite={!faceTransparent}
        />
      </mesh>
      <mesh ref={mouthRef} geometry={mouthTubeGeo} castShadow={false} receiveShadow={false}>
        <meshPhysicalMaterial
          color={FACE_MOUTH_COLOR}
          roughness={0.55}
          metalness={0.05}
          clearcoat={0.08}
          clearcoatRoughness={0.5}
          envMapIntensity={0.8}
          transparent={faceTransparent}
          opacity={faceOpacity}
          depthWrite={!faceTransparent}
        />
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
    head:         new THREE.SphereGeometry(0.225, 32, 26),
    ear:          new THREE.SphereGeometry(0.058, 12, 10),
    neck:         new THREE.CylinderGeometry(0.092, 0.112, 0.31, 18, 8),
    pelvis:       new THREE.CylinderGeometry(0.230, 0.212, 0.24, 20, 6),
    wristL:       new THREE.SphereGeometry(0.098, 16, 12),
    wristR:       new THREE.SphereGeometry(0.098, 16, 12),
    handL:        new THREE.CapsuleGeometry(0.074, 0.20, 4, 10),
    handR:        new THREE.CapsuleGeometry(0.074, 0.20, 4, 10),
    elbowL:       new THREE.SphereGeometry(0.118, 18, 14),
    elbowR:       new THREE.SphereGeometry(0.118, 18, 14),
    ankleL:       new THREE.SphereGeometry(0.098, 14, 12),
    ankleR:       new THREE.SphereGeometry(0.098, 14, 12),
    footL:        new THREE.BoxGeometry(0.158, 0.080, 0.300),
    footR:        new THREE.BoxGeometry(0.158, 0.080, 0.300),
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

  /** הליכה במקום — קצב עדין, קומה זקופה (סיבוב מתון סביב מפרקי ירך/ברך) */
  useFrame(({ clock }) => {
    if (!walkInPlace) {
      if (walkRootRef.current) walkRootRef.current.position.y = 0;
      if (torsoSwayRef.current) {
        torsoSwayRef.current.rotation.x = 0;
        torsoSwayRef.current.rotation.z = 0;
      }
      if (leftThighRef.current) leftThighRef.current.rotation.x = 0;
      if (leftKneeRef.current) leftKneeRef.current.rotation.x = 0;
      if (rightThighRef.current) rightThighRef.current.rotation.x = 0;
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = 0;
      return;
    }
    if (pauseWalkAnimation) {
      return;
    }
    const t = clock.elapsedTime * (Math.PI * 2) * 1.08;
    const bob = 0.014 * Math.abs(Math.sin(t));
    if (walkRootRef.current) walkRootRef.current.position.y = bob;
    if (torsoSwayRef.current) {
      torsoSwayRef.current.rotation.x = -0.026 * Math.sin(t);
      torsoSwayRef.current.rotation.z = 0.017 * Math.sin(2 * t);
    }
    const ls = 0.19 * Math.sin(t);
    const lk = Math.max(0, Math.sin(t - 0.4)) * 0.42;
    const rs = 0.19 * Math.sin(t + Math.PI);
    const rk = Math.max(0, Math.sin(t + Math.PI - 0.4)) * 0.42;
    if (leftThighRef.current) leftThighRef.current.rotation.x = ls + 0.028;
    if (leftKneeRef.current) leftKneeRef.current.rotation.x = lk;
    if (rightThighRef.current) rightThighRef.current.rotation.x = rs + 0.028;
    if (rightKneeRef.current) rightKneeRef.current.rotation.x = rk;
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
      <BaseSegment geometry={geos.head} position={[0, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <BaseSegment geometry={geos.ear}  position={[ 0.235, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <BaseSegment geometry={geos.ear}  position={[-0.235, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} disableRaycast />
      <HeadFaceFeatures level={level} />

      {/* ══ NECK ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('neck')} geometry={geos.neck} position={[0, 1.48, 0]} />

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

      {/* ══ LEFT ARM (+x) ══════════════════════════════════════ */}
      <BaseSegment
        geometry={geos.upperArmL}
        position={[0.56, 0.9, 0.048]}
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
      <MuscleSegment {...S('elbow_left')} geometry={geos.elbowL} position={[0.58, 0.6, 0.07]} />
      <BaseSegment
        geometry={geos.forearmL}
        position={[0.56, 0.21, 0.048]}
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
      <MuscleSegment {...S('wrist_left')} geometry={geos.wristL} position={[0.57, -0.04, 0.075]} />
      <BaseSegment
        geometry={geos.handL}
        position={[0.57, -0.22, 0.045]}
        level={level}
        goldSkin={gearGoldSkin}
        muscleStage={muscleStage}
        vertexInflationWeight={0}
        pickArea="hand_left"
        {...limbPickProps('hand_left')}
        motionSteady={stableInteraction}
        onAreaClick={onAreaClick}
      />

      {/* ══ RIGHT ARM (-x) ═════════════════════════════════════ */}
      <BaseSegment
        geometry={geos.upperArmR}
        position={[-0.56, 0.9, 0.048]}
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
      <MuscleSegment {...S('elbow_right')} geometry={geos.elbowR} position={[-0.58, 0.6, 0.07]} />
      <BaseSegment
        geometry={geos.forearmR}
        position={[-0.56, 0.21, 0.048]}
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
      <MuscleSegment {...S('wrist_right')} geometry={geos.wristR} position={[-0.57, -0.04, 0.075]} />
      <BaseSegment
        geometry={geos.handR}
        position={[-0.57, -0.22, 0.045]}
        level={level}
        goldSkin={gearGoldSkin}
        muscleStage={muscleStage}
        vertexInflationWeight={0}
        pickArea="hand_right"
        {...limbPickProps('hand_right')}
        motionSteady={stableInteraction}
        onAreaClick={onAreaClick}
      />

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
            <MuscleSegment {...S('ankle_left')} geometry={geos.ankleL} position={[0, -0.71, 0.005]} />
            <BaseSegment
              geometry={geos.footL}
              position={[0.015, -0.9, 0.02]}
              rotation={[0.18, 0, 0]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              pickArea="foot_left"
              {...limbPickProps('foot_left')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
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
            <MuscleSegment {...S('ankle_right')} geometry={geos.ankleR} position={[0, -0.71, 0.005]} />
            <BaseSegment
              geometry={geos.footR}
              position={[-0.015, -0.9, 0.02]}
              rotation={[0.18, 0, 0]}
              level={level}
              goldSkin={gearGoldSkin}
              muscleStage={muscleStage}
              vertexInflationWeight={0}
              pickArea="foot_right"
              {...limbPickProps('foot_right')}
              motionSteady={stableInteraction}
              onAreaClick={onAreaClick}
            />
          </group>
        </group>
      </group>

      <EquippedGearAttachments equipped={equippedGear} />

      {/* ══ GROUND SHADOW (עם שורש ההליכה — צל עוקב אחרי נשיאת הגוף) ═══ */}
      <ContactShadows
        position={[0, -1.73, 0]}
        opacity={0.32}
        scale={2.4}
        blur={2.2}
        far={1.1}
        color="#0a6e68"
        resolution={512}
      />
        </group>
      </IdleSwayRoot>
    </group>
  );
}
