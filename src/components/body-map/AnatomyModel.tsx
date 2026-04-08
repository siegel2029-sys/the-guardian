import { useRef, useMemo } from 'react';
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
}

function BaseSegment({ geometry, position, rotation }: BaseProps) {
  return (
    <mesh geometry={geometry} position={position} rotation={rotation as unknown as THREE.Euler} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={BASE_SKIN}
        roughness={0.82}
        metalness={0.04}
        clearcoat={0.08}
        clearcoatRoughness={0.65}
        envMapIntensity={1.2}
      />
    </mesh>
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
  selectedArea,
  onAreaClick,
}: AnatomyModelProps) {
  const geos = useGeometries();
  const primaryLightRef = useRef<THREE.PointLight>(null);
  const clinicalArea = clinicalAreaProp ?? primaryArea;

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
      <BaseSegment geometry={geos.head} position={[0, 1.73, 0]} />
      <BaseSegment geometry={geos.ear}  position={[ 0.235, 1.73, 0]} />
      <BaseSegment geometry={geos.ear}  position={[-0.235, 1.73, 0]} />

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
      <BaseSegment geometry={geos.pelvis} position={[0, 0.24, 0]} />

      {/* ══ LEFT ARM (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmL} position={[ 0.56, 0.90, 0]} />
      <MuscleSegment {...S('elbow_left')}  geometry={geos.elbowL}    position={[ 0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmL}  position={[ 0.56, 0.21, 0]} />
      <MuscleSegment {...S('wrist_left')}  geometry={geos.wristL}    position={[ 0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handL}     position={[ 0.57,-0.22, 0.02]} />

      {/* ══ RIGHT ARM (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.upperArmR} position={[-0.56, 0.90, 0]} />
      <MuscleSegment {...S('elbow_right')} geometry={geos.elbowR}    position={[-0.58, 0.60, 0]} />
      <BaseSegment    geometry={geos.forearmR}  position={[-0.56, 0.21, 0]} />
      <MuscleSegment {...S('wrist_right')} geometry={geos.wristR}    position={[-0.57,-0.04, 0]} />
      <BaseSegment    geometry={geos.handR}     position={[-0.57,-0.22, 0.02]} />

      {/* ══ HIPS ═══════════════════════════════════════════════ */}
      <MuscleSegment {...S('hip_left')}  geometry={geos.gluteL} position={[ 0.24, 0.14, 0]} />
      <MuscleSegment {...S('hip_right')} geometry={geos.gluteR} position={[-0.24, 0.14, 0]} />

      {/* ══ LEFT LEG (+x) ══════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighL}  position={[ 0.24,-0.27, 0]} />
      <MuscleSegment {...S('knee_left')}  geometry={geos.kneeL}  position={[ 0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinL}   position={[ 0.24,-0.98, 0]} />
      <MuscleSegment {...S('ankle_left')} geometry={geos.ankleL} position={[ 0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footL}   position={[ 0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} />

      {/* ══ RIGHT LEG (-x) ═════════════════════════════════════ */}
      <BaseSegment    geometry={geos.thighR}  position={[-0.24,-0.27, 0]} />
      <MuscleSegment {...S('knee_right')} geometry={geos.kneeR}  position={[-0.24,-0.62, 0]} />
      <BaseSegment    geometry={geos.shinR}   position={[-0.24,-0.98, 0]} />
      <MuscleSegment {...S('ankle_right')} geometry={geos.ankleR} position={[-0.24,-1.33, 0]} />
      <BaseSegment    geometry={geos.footR}   position={[-0.255,-1.52, 0.06]} rotation={[0.18, 0, 0]} />

      {/* ══ CALF detail (overlaid on shins for back muscle detail) */}
      <BaseSegment geometry={geos.calfL} position={[ 0.24,-1.00, 0]} />
      <BaseSegment geometry={geos.calfR} position={[-0.24,-1.00, 0]} />

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
