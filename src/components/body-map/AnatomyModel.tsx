import {
  useRef,
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
import { bodyAreaIsClinicalFocus } from '../../body/bodyPickMapping';
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
import { getLevelTier } from '../../body/levelTier';
import { getMuscleEvolutionStage, getMuscleVertexInflation } from '../../body/anatomicalEvolution';
import type { MuscleEvolutionStage } from '../../body/anatomicalEvolution';
import { createMuscleFiberTextures } from './proceduralMuscleTextures';
import {
  installMuscleVertexInflation,
  clearMuscleVertexInflationPatch,
} from './muscleVertexInflation';
import EquippedGearAttachments from './equippedGear/EquippedGearAttachments';
import type { EquippedGearSnapshot } from '../../config/gearCatalog';

// ── Static world-position for each area's pulsing glow light ─────
const AREA_GLOW: Partial<Record<BodyArea, [number, number, number]>> = {
  neck:           [0,    1.48, 0.22],
  shoulder_left:  [0.44, 1.30, 0.18],
  shoulder_right: [-0.44,1.30, 0.18],
  back_upper:     [0,    0.98, 0.30],
  back_lower:     [0,    0.55, 0.30],
  elbow_left:     [0.58, 0.60, 0.16],
  elbow_right:    [-0.58,0.60, 0.16],
  wrist_left:     [0.58, -0.04,0.16],
  wrist_right:    [-0.58,-0.04,0.16],
  hip_left:       [0.24, 0.14, 0.22],
  hip_right:      [-0.24,0.14, 0.22],
  knee_left:      [0.24, -0.62,0.22],
  knee_right:     [-0.24,-0.62,0.22],
  ankle_left:     [0.24, -1.33,0.16],
  ankle_right:    [-0.24,-1.33,0.16],
};

// ── Simple non-interactive meshes (base body silhouette) ──────────
const BASE_SKIN = '#8fb8c8';
const GOLD_SKIN = '#c9a227';

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
}

function BaseSegment({
  geometry,
  position,
  rotation,
  level,
  goldSkin,
  muscleStage,
  vertexInflationWeight = 0,
}: BaseProps) {
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;
  const baseColor = goldSkin ? GOLD_SKIN : BASE_SKIN;
  const matRef = useRef<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | null>(null);
  const inflationU = useMemo(() => ({ value: 0 }), []);
  const inflationEnabled = !goldSkin && level > 20 && vertexInflationWeight > 0;

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
    if (!inflationEnabled) return;
    inflationU.value = getMuscleVertexInflation(level, clock.elapsedTime) * vertexInflationWeight;
  });

  if (!goldSkin && muscleStage === 'post_injury') {
    return (
      <group position={position} rotation={rot} scale={[0.96, 0.97, 0.96]}>
        <mesh geometry={geometry} castShadow receiveShadow>
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

  const tier = getLevelTier(level);

  if (tier === 'injured') {
    return (
      <group position={position} rotation={rot}>
        <mesh geometry={geometry} castShadow receiveShadow>
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
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={matRef}
            color={baseColor}
            roughness={goldSkin ? 0.35 : 0.82}
            metalness={goldSkin ? 0.65 : 0.05}
            clearcoat={goldSkin ? 0.55 : 0.1}
            clearcoatRoughness={0.42}
            envMapIntensity={goldSkin ? 1.45 : 1.22}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={rot}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={matRef}
          color={baseColor}
          roughness={goldSkin ? 0.22 : 0.26}
          metalness={goldSkin ? 0.78 : 0.55}
          clearcoat={goldSkin ? 0.9 : 0.82}
          clearcoatRoughness={0.2}
          envMapIntensity={goldSkin ? 1.95 : 1.85}
          emissive={goldSkin ? '#3d2a06' : '#082830'}
          emissiveIntensity={goldSkin ? 0.04 : 0.06}
          iridescence={goldSkin ? 0.35 : 1}
          iridescenceIOR={1.22}
          iridescenceThicknessRange={[120, 420]}
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

/** תנודת idle עדינה — אביזרים וגוף נעים יחד */
function IdleSwayRoot({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = Math.sin(t * 0.38) * 0.02;
    g.position.y = Math.sin(t * 0.88) * 0.014;
  });
  return <group ref={ref}>{children}</group>;
}

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
    wristL:       new THREE.SphereGeometry(0.086, 14, 12),
    wristR:       new THREE.SphereGeometry(0.086, 14, 12),
    handL:        new THREE.CapsuleGeometry(0.074, 0.20, 4, 10),
    handR:        new THREE.CapsuleGeometry(0.074, 0.20, 4, 10),
    elbowL:       new THREE.SphereGeometry(0.100, 16, 14),
    elbowR:       new THREE.SphereGeometry(0.100, 16, 14),
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
}: AnatomyModelProps) {
  const gearGoldSkin = equippedGear.skin === 'gold_skin';
  const geos = useGeometries();
  const primaryLightRef = useRef<THREE.PointLight>(null);
  const clinicalArea = clinicalAreaProp ?? primaryArea;
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

  // Pulse primary-area glow
  useFrame(({ clock }) => {
    if (!primaryLightRef.current) return;
    const lf = Math.min(level, 100) / 100;
    const pulse = Math.sin(clock.elapsedTime * 2.4) * 0.38;
    primaryLightRef.current.intensity = (0.55 + lf * 1.15) + pulse;
  });

  // Shared props factory
  const S = (area: BodyArea | null) => {
    const clinicalLocked =
      area != null && clinicalArea != null && bodyAreaIsClinicalFocus(area, clinicalArea);
    const selfCareSelected =
      area != null &&
      selfCareSelectedAreas.includes(area) &&
      !clinicalLocked;
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
      /** נפח קדקודים רק על גלילי זרוע/ירך — לא על מפרקים (מרפק/ברך וכו') */
      vertexInflationWeight: 0,
    };
  };

  return (
    <group>
      <IdleSwayRoot>
        <group>
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

      {/* ══ HEAD ═══════════════════════════════════════════════ */}
      <BaseSegment geometry={geos.head} position={[0, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />
      <BaseSegment geometry={geos.ear}  position={[ 0.235, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />
      <BaseSegment geometry={geos.ear}  position={[-0.235, 1.73, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />
      <HeadFaceFeatures level={level} />

      {/* ══ NECK ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('neck')} geometry={geos.neck} position={[0, 1.48, 0]} />

      {/* ══ SHOULDERS ══════════════════════════════════════════ */}
      {/* patient LEFT = viewer RIGHT = +x */}
      <MuscleSegment {...S('shoulder_left')}  geometry={geos.shoulderL} position={[ 0.44, 1.30, 0]} />
      {/* patient RIGHT = viewer LEFT = -x */}
      <MuscleSegment {...S('shoulder_right')} geometry={geos.shoulderR} position={[-0.44, 1.30, 0]} />

      {/* ══ TORSO ══════════════════════════════════════════════ */}
      <MuscleSegment {...S('back_upper')} geometry={geos.upperTorso} position={[0, 0.98, 0]} />
      <MuscleSegment {...S('back_lower')} geometry={geos.lowerTorso} position={[0, 0.54, 0]} />
      {/* Pelvis bridge (non-interactive) */}
      <BaseSegment geometry={geos.pelvis} position={[0, 0.24, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      {/* ══ LEFT ARM (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmL} position={[ 0.56, 0.90, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('elbow_left')}  geometry={geos.elbowL}    position={[ 0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmL}  position={[ 0.56, 0.21, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('wrist_left')}  geometry={geos.wristL}    position={[ 0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handL}     position={[ 0.57,-0.22, 0.02]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      {/* ══ RIGHT ARM (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmR} position={[-0.56, 0.90, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('elbow_right')} geometry={geos.elbowR}    position={[-0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmR}  position={[-0.56, 0.21, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('wrist_right')} geometry={geos.wristR}    position={[-0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handR}     position={[-0.57,-0.22, 0.02]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      {/* ══ HIPS ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('hip_left')}  geometry={geos.gluteL} position={[ 0.24, 0.14, 0]} />
      <MuscleSegment {...S('hip_right')} geometry={geos.gluteR} position={[-0.24, 0.14, 0]} />

      {/* ══ LEFT LEG (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighL}  position={[ 0.24,-0.27, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('knee_left')}  geometry={geos.kneeL}  position={[ 0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinL}   position={[ 0.24,-0.98, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('ankle_left')} geometry={geos.ankleL} position={[ 0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footL}   position={[ 0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      {/* ══ RIGHT LEG (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighR}  position={[-0.24,-0.27, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('knee_right')} geometry={geos.kneeR}  position={[-0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinR}   position={[-0.24,-0.98, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={1} />
      <MuscleSegment {...S('ankle_right')} geometry={geos.ankleR} position={[-0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footR}   position={[-0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      {/* ══ CALF detail (overlaid on shins for back muscle detail) */}
      <BaseSegment geometry={geos.calfL} position={[ 0.24,-1.00, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />
      <BaseSegment geometry={geos.calfR} position={[-0.24,-1.00, 0]} level={level} goldSkin={gearGoldSkin} muscleStage={muscleStage} vertexInflationWeight={0} />

      <EquippedGearAttachments equipped={equippedGear} />
        </group>
      </IdleSwayRoot>

      {/* ══ GROUND SHADOW ══════════════════════════════════════ */}
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
  );
}
