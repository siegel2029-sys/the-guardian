import { useCallback, useMemo, type ReactNode } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import type { BodyArea } from '../../types';
import type { GranularPickKey } from '../../body/bodyPickMapping';
import {
  pickKeyToBodyArea,
  isGranularPickKey,
  isPickKeyClinicalFocus,
} from '../../body/bodyPickMapping';

export interface ProceduralHumanoidSceneProps {
  activeAreas: BodyArea[];
  clinicalArea?: BodyArea;
  /** Therapist primary body area — clinical parts are non-clickable. */
  primaryBodyArea?: BodyArea;
  selectedPickKeys?: GranularPickKey[];
  onPickKey?: (key: GranularPickKey) => void;
  onAreaClick?: (area: BodyArea) => void;
  fullBodyInteractive?: boolean;
}

/** One granular key per primitive — drives self-care zones + exercise cards. */
export const PROCEDURAL_PART_TO_KEY: Record<string, GranularPickKey> = {
  head: 'cranium',
  torso: 'torso_upper',
  leftArm: 'l_upper_arm',
  rightArm: 'r_upper_arm',
  leftLeg: 'l_shin',
  rightLeg: 'r_shin',
};

type PartId = keyof typeof PROCEDURAL_PART_TO_KEY;

function isPartSelected(
  part: PartId,
  keys: GranularPickKey[]
): boolean {
  const k = PROCEDURAL_PART_TO_KEY[part];
  return keys.includes(k);
}

/** Torso primitive maps to upper back; therapist primary may be lower back — still highlight trunk. */
function partShowsClinicalGlow(
  part: PartId,
  partArea: BodyArea,
  clinicalZone: BodyArea
): boolean {
  if (partArea === clinicalZone) return true;
  if (
    part === 'torso' &&
    (clinicalZone === 'back_lower' || clinicalZone === 'back_upper')
  ) {
    return true;
  }
  if (part === 'leftLeg' && clinicalZone === 'hip_left') return true;
  if (part === 'rightLeg' && clinicalZone === 'hip_right') return true;
  return false;
}

function PartMesh({
  name,
  geometry,
  position,
  rotation = [0, 0, 0],
  selected,
  clinicalZone,
  clinicalPickBlocked,
  onClick,
}: {
  name: PartId;
  geometry: ReactNode;
  position: [number, number, number];
  rotation?: [number, number, number];
  selected: boolean;
  clinicalZone?: BodyArea;
  /** Part matches therapist clinical focus — red glow, no toggle */
  clinicalPickBlocked: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const key = PROCEDURAL_PART_TO_KEY[name];
  const area = pickKeyToBodyArea(key);
  const isClinicalZone =
    clinicalZone != null && partShowsClinicalGlow(name, area, clinicalZone);

  const { color, emissive, emissiveIntensity } = useMemo(() => {
    // Clinical rehab focus always visible (not overridden by self-care green).
    if (isClinicalZone) {
      return {
        color: '#ef4444',
        emissive: '#7f1d1d',
        emissiveIntensity: 0.58,
      };
    }
    if (selected) {
      return {
        color: '#22c55e',
        emissive: '#166534',
        emissiveIntensity: 0.62,
      };
    }
    return {
      color: '#94a3b8',
      emissive: '#334155',
      emissiveIntensity: 0.12,
    };
  }, [selected, isClinicalZone]);

  return (
    <mesh
      name={name}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      onClick={clinicalPickBlocked ? undefined : onClick}
      onPointerOver={(e) => {
        if (clinicalPickBlocked) {
          e.stopPropagation();
          return;
        }
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {geometry}
      <meshStandardMaterial
        color={color}
        roughness={0.42}
        metalness={0.12}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export default function ProceduralHumanoidScene({
  activeAreas,
  clinicalArea: clinicalZone,
  primaryBodyArea,
  selectedPickKeys = [],
  onPickKey,
  onAreaClick,
  fullBodyInteractive = false,
}: ProceduralHumanoidSceneProps) {
  const keys = selectedPickKeys.filter(isGranularPickKey);

  const clinicalBlocked = useCallback(
    (part: PartId) =>
      primaryBodyArea != null &&
      isPickKeyClinicalFocus(PROCEDURAL_PART_TO_KEY[part], primaryBodyArea),
    [primaryBodyArea]
  );

  const handlePartClick = useCallback(
    (part: PartId) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const key = PROCEDURAL_PART_TO_KEY[part];
      if (primaryBodyArea != null && isPickKeyClinicalFocus(key, primaryBodyArea)) {
        return;
      }
      console.log('[PHYSIOSHIELD BodyMap] procedural pick', { part, pickKey: key });

      if (onPickKey) {
        onPickKey(key);
        return;
      }

      const area = pickKeyToBodyArea(key);
      const isClinicalHit = clinicalZone != null && area === clinicalZone;
      const inPlan = activeAreas.includes(area);
      if (fullBodyInteractive || inPlan || isClinicalHit) {
        onAreaClick?.(area);
      }
    },
    [onPickKey, onAreaClick, clinicalZone, activeAreas, fullBodyInteractive, primaryBodyArea]
  );

  return (
    <group rotation={[0, Math.PI, 0]}>
      <PartMesh
        name="head"
        position={[0, 1.38, 0]}
        selected={isPartSelected('head', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('head')}
        onClick={handlePartClick('head')}
        geometry={<sphereGeometry args={[0.2, 24, 24]} />}
      />
      <PartMesh
        name="torso"
        position={[0, 0.92, 0]}
        selected={isPartSelected('torso', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('torso')}
        onClick={handlePartClick('torso')}
        geometry={<cylinderGeometry args={[0.22, 0.26, 0.52, 24]} />}
      />
      <PartMesh
        name="leftArm"
        position={[-0.38, 1.02, 0]}
        rotation={[0, 0, 0.35]}
        selected={isPartSelected('leftArm', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('leftArm')}
        onClick={handlePartClick('leftArm')}
        geometry={<cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />}
      />
      <PartMesh
        name="rightArm"
        position={[0.38, 1.02, 0]}
        rotation={[0, 0, -0.35]}
        selected={isPartSelected('rightArm', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('rightArm')}
        onClick={handlePartClick('rightArm')}
        geometry={<cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />}
      />
      <PartMesh
        name="leftLeg"
        position={[-0.12, 0.38, 0]}
        selected={isPartSelected('leftLeg', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('leftLeg')}
        onClick={handlePartClick('leftLeg')}
        geometry={<cylinderGeometry args={[0.09, 0.09, 0.62, 16]} />}
      />
      <PartMesh
        name="rightLeg"
        position={[0.12, 0.38, 0]}
        selected={isPartSelected('rightLeg', keys)}
        clinicalZone={clinicalZone}
        clinicalPickBlocked={clinicalBlocked('rightLeg')}
        onClick={handlePartClick('rightLeg')}
        geometry={<cylinderGeometry args={[0.09, 0.09, 0.62, 16]} />}
      />
    </group>
  );
}
