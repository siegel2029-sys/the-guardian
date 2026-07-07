import { useMemo } from 'react';
import * as THREE from 'three';
import { isStoreItemId, type StoreItemId } from '../../../config/storeCatalog';

/** גובה כפות הרגליים — פריטים יושבים על הרצפה */
const FLOOR_Y = -1.48;

type Props = {
  equippedItems: StoreItemId[];
};

function TherapyBall() {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.16, 24, 18), []);
  return (
    <mesh geometry={geometry} position={[0.78, FLOOR_Y + 0.16, 0.12]} castShadow receiveShadow>
      <meshStandardMaterial color="#ef4444" roughness={0.45} metalness={0.08} />
    </mesh>
  );
}

function FloorDumbbell() {
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 0.28, 16), []);
  return (
    <mesh
      geometry={geometry}
      position={[-0.78, FLOOR_Y + 0.06, 0.1]}
      rotation={[0, 0, Math.PI / 2]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#94a3b8" roughness={0.38} metalness={0.55} />
    </mesh>
  );
}

function CompanionDog() {
  const geometry = useMemo(() => new THREE.BoxGeometry(0.32, 0.2, 0.42), []);
  return (
    <mesh geometry={geometry} position={[0.42, FLOOR_Y + 0.1, -0.52]} castShadow receiveShadow>
      <meshStandardMaterial color="#92400e" roughness={0.72} metalness={0.04} />
    </mesh>
  );
}

export default function EquippedStoreFloorProps({ equippedItems }: Props) {
  const ids = useMemo(
    () => equippedItems.filter((id): id is StoreItemId => isStoreItemId(id)),
    [equippedItems]
  );

  if (ids.length === 0) return null;

  return (
    <group>
      {ids.includes('therapy_ball') && <TherapyBall />}
      {ids.includes('dumbbell') && <FloorDumbbell />}
      {ids.includes('dog') && <CompanionDog />}
    </group>
  );
}
