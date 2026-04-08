import { useRef, useMemo, useLayoutEffect, type RefObject } from 'react';
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

interface BaseProps {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  level: number;
}

function BaseSegment({ geometry, position, rotation, level }: BaseProps) {
  const tier = getLevelTier(level);
  const ghost = tier === 'ghost';
  const matte = tier === 'matte';
  const chrome = tier === 'chrome';

  const roughness = ghost ? 0.88 : matte ? 0.91 : 0.32;
  const metalness = ghost ? 0.03 : matte ? 0.02 : 0.38;
  const clearcoat = ghost ? 0.05 : matte ? 0.05 : 0.48;
  const clearcoatRoughness = ghost ? 0.72 : matte ? 0.78 : 0.28;
  const envMapIntensity = ghost ? 0.75 : matte ? 0.95 : 1.65;
  const emissive = chrome ? '#0a3340' : '#000000';
  const emissiveIntensity = chrome ? 0.085 : 0;
  const transparent = ghost;
  const opacity = ghost ? 0.34 : 1;

  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;

  return (
    <group position={position} rotation={rot}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={BASE_SKIN}
          roughness={roughness}
          metalness={metalness}
          clearcoat={clearcoat}
          clearcoatRoughness={clearcoatRoughness}
          envMapIntensity={envMapIntensity}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>
      {ghost && (
        <mesh geometry={geometry} raycast={() => {}}>
          <meshBasicMaterial
            color="#6eb8c4"
            wireframe
            transparent
            opacity={0.18}
            depthWrite={false}
          />
        </mesh>
      )}
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
  const ghost = getLevelTier(level) === 'ghost';
  const faceOpacity = ghost ? 0.45 : 1;
  const faceTransparent = ghost;

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
  /** Areas with a logged exercise finish today — gold / blue muscle highlight */
  strengthenedAreasToday?: BodyArea[];
  selectedArea?: BodyArea | null;
  onAreaClick?: (area: BodyArea) => void;
}

export default function AnatomyModel({
  activeAreas,
  primaryArea,
  clinicalArea: clinicalAreaProp,
  selfCareSelectedAreas = [],
  painByArea,
  level,
  strengthenedAreasToday = [],
  selectedArea,
  onAreaClick,
}: AnatomyModelProps) {
  const geos = useGeometries();
  const primaryLightRef = useRef<THREE.PointLight>(null);
  const clinicalArea = clinicalAreaProp ?? primaryArea;
  const strengthenedSet = useMemo(
    () => new Set(strengthenedAreasToday),
    [strengthenedAreasToday]
  );

  const glowPos = useMemo<[number, number, number]>(
    () => primaryArea ? (AREA_GLOW[primaryArea] ?? [0, 0.4, 0.4]) : [0, 0.4, 0.4],
    [primaryArea]
  );

  // Pulse primary-area glow
  useFrame(({ clock }) => {
    if (!primaryLightRef.current) return;
    const lf = Math.min(level, 10) / 10;
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
      onAreaClick: area ? onAreaClick : undefined,
    };
  };

  return (
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
      <BaseSegment geometry={geos.head} position={[0, 1.73, 0]} level={level} />
      <BaseSegment geometry={geos.ear}  position={[ 0.235, 1.73, 0]} level={level} />
      <BaseSegment geometry={geos.ear}  position={[-0.235, 1.73, 0]} level={level} />
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
      <BaseSegment geometry={geos.pelvis} position={[0, 0.24, 0]} level={level} />

      {/* ══ LEFT ARM (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmL} position={[ 0.56, 0.90, 0]} level={level} />
      <MuscleSegment {...S('elbow_left')}  geometry={geos.elbowL}    position={[ 0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmL}  position={[ 0.56, 0.21, 0]} level={level} />
      <MuscleSegment {...S('wrist_left')}  geometry={geos.wristL}    position={[ 0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handL}     position={[ 0.57,-0.22, 0.02]} level={level} />

      {/* ══ RIGHT ARM (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmR} position={[-0.56, 0.90, 0]} level={level} />
      <MuscleSegment {...S('elbow_right')} geometry={geos.elbowR}    position={[-0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmR}  position={[-0.56, 0.21, 0]} level={level} />
      <MuscleSegment {...S('wrist_right')} geometry={geos.wristR}    position={[-0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handR}     position={[-0.57,-0.22, 0.02]} level={level} />

      {/* ══ HIPS ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('hip_left')}  geometry={geos.gluteL} position={[ 0.24, 0.14, 0]} />
      <MuscleSegment {...S('hip_right')} geometry={geos.gluteR} position={[-0.24, 0.14, 0]} />

      {/* ══ LEFT LEG (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighL}  position={[ 0.24,-0.27, 0]} level={level} />
      <MuscleSegment {...S('knee_left')}  geometry={geos.kneeL}  position={[ 0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinL}   position={[ 0.24,-0.98, 0]} level={level} />
      <MuscleSegment {...S('ankle_left')} geometry={geos.ankleL} position={[ 0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footL}   position={[ 0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} level={level} />

      {/* ══ RIGHT LEG (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighR}  position={[-0.24,-0.27, 0]} level={level} />
      <MuscleSegment {...S('knee_right')} geometry={geos.kneeR}  position={[-0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinR}   position={[-0.24,-0.98, 0]} level={level} />
      <MuscleSegment {...S('ankle_right')} geometry={geos.ankleR} position={[-0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footR}   position={[-0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} level={level} />

      {/* ══ CALF detail (overlaid on shins for back muscle detail) */}
      <BaseSegment geometry={geos.calfL} position={[ 0.24,-1.00, 0]} level={level} />
      <BaseSegment geometry={geos.calfR} position={[-0.24,-1.00, 0]} level={level} />

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
