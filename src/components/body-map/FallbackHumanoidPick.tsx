import { useCallback, useState } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import type { BodyArea } from '../../types';
import type { GranularPickKey } from '../../body/bodyPickMapping';
import {
  pickKeyToBodyArea,
  isGranularPickKey,
  mixamoBoneNameToPickKey,
} from '../../body/bodyPickMapping';

export interface FallbackHumanoidPickProps {
  activeAreas: BodyArea[];
  clinicalArea?: BodyArea;
  selectedPickKeys?: GranularPickKey[];
  onPickKey?: (key: GranularPickKey) => void;
  onAreaClick?: (area: BodyArea) => void;
  fullBodyInteractive?: boolean;
}

/** Mixamo-style bone names → boxes (true mesh-level picking). */
const PARTS: { name: string; pos: [number, number, number]; size: [number, number, number] }[] = [
  { name: 'Head', pos: [0, 1.52, 0], size: [0.24, 0.26, 0.22] },
  { name: 'Neck', pos: [0, 1.32, 0], size: [0.14, 0.12, 0.14] },
  { name: 'Spine2', pos: [0, 1.12, 0], size: [0.32, 0.38, 0.18] },
  { name: 'Hips', pos: [0, 0.88, 0], size: [0.36, 0.14, 0.22] },
  { name: 'LeftArm', pos: [-0.42, 1.22, 0], size: [0.14, 0.32, 0.14] },
  { name: 'LeftForeArm', pos: [-0.52, 0.92, 0], size: [0.12, 0.28, 0.12] },
  { name: 'LeftHand', pos: [-0.58, 0.68, 0], size: [0.1, 0.14, 0.1] },
  { name: 'RightArm', pos: [0.42, 1.22, 0], size: [0.14, 0.32, 0.14] },
  { name: 'RightForeArm', pos: [0.52, 0.92, 0], size: [0.12, 0.28, 0.12] },
  { name: 'RightHand', pos: [0.58, 0.68, 0], size: [0.1, 0.14, 0.1] },
  { name: 'LeftUpLeg', pos: [-0.14, 0.62, 0], size: [0.14, 0.4, 0.14] },
  { name: 'LeftLeg', pos: [-0.14, 0.28, 0], size: [0.12, 0.28, 0.12] },
  { name: 'LeftFoot', pos: [-0.14, 0.06, 0.08], size: [0.12, 0.1, 0.22] },
  { name: 'RightUpLeg', pos: [0.14, 0.62, 0], size: [0.14, 0.4, 0.14] },
  { name: 'RightLeg', pos: [0.14, 0.28, 0], size: [0.12, 0.28, 0.12] },
  { name: 'RightFoot', pos: [0.14, 0.06, 0.08], size: [0.12, 0.1, 0.22] },
];

function meshNameToPickKey(meshName: string): GranularPickKey | null {
  return mixamoBoneNameToPickKey(meshName);
}

function PickablePart({
  name,
  position,
  size,
  selected,
  hovered,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  selected: boolean;
  hovered: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const baseColor = selected ? '#4ade80' : hovered ? '#6ee7b7' : '#7dd3fc';
  const emissive = selected ? '#166534' : hovered ? '#065f46' : '#0c4a6e';

  return (
    <mesh
      name={name}
      position={position}
      castShadow
      receiveShadow
      onClick={onClick}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onPointerEnter();
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onPointerLeave();
        document.body.style.cursor = '';
      }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={baseColor}
        roughness={0.45}
        metalness={0.08}
        emissive={emissive}
        emissiveIntensity={selected ? 0.45 : hovered ? 0.28 : 0.1}
      />
    </mesh>
  );
}

export default function FallbackHumanoidPick({
  activeAreas,
  clinicalArea: clinicalZone,
  selectedPickKeys = [],
  onPickKey,
  onAreaClick,
  fullBodyInteractive = false,
}: FallbackHumanoidPickProps) {
  const [hoverName, setHoverName] = useState<string | null>(null);
  const keys = selectedPickKeys.filter(isGranularPickKey);

  const selectedForMesh = useCallback(
    (meshName: string) => {
      const k = meshNameToPickKey(meshName);
      return k ? keys.includes(k) : false;
    },
    [keys]
  );

  const handlePartClick = useCallback(
    (meshName: string) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const key = meshNameToPickKey(meshName);
      console.log('[PHYSIOSHIELD BodyMap] pick (fallback humanoid)', { meshName, pickKey: key });
      if (!key) return;
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
    [onPickKey, onAreaClick, clinicalZone, activeAreas, fullBodyInteractive]
  );

  return (
    <group rotation={[0, Math.PI, 0]}>
      {PARTS.map((p) => (
        <PickablePart
          key={p.name}
          name={p.name}
          position={p.pos}
          size={p.size}
          selected={selectedForMesh(p.name)}
          hovered={hoverName === p.name}
          onPointerEnter={() => setHoverName(p.name)}
          onPointerLeave={() => setHoverName(null)}
          onClick={handlePartClick(p.name)}
        />
      ))}
    </group>
  );
}
