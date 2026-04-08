import { useRef, useMemo, useLayoutEffect, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { EquippedGearSnapshot } from '../../../config/gearCatalog';
import { GEAR_BY_ID, isGearItemId, type GearItemId } from '../../../config/gearCatalog';

function useNoRaycast<T extends THREE.Object3D>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const o = ref.current;
    if (!o) return;
    o.raycast = () => {};
  }, []);
}

function AuraTintSphere({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  return (
    <mesh ref={ref} position={[0, 0.95, 0]} scale={[0.78, 1.12, 0.48]}>
      <sphereGeometry args={[1.12, 28, 20]} />
      <meshPhysicalMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.35}
        transparent
        opacity={0.14}
        roughness={0.4}
        metalness={0.1}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function AuraWireShell({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  return (
    <mesh ref={ref} position={[0, 0.92, 0]} scale={[0.74, 1.08, 0.44]}>
      <sphereGeometry args={[1.18, 26, 18]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function HandWeights({ color }: { color: string }) {
  const box = useMemo(() => new THREE.BoxGeometry(0.1, 0.08, 0.12), []);
  const l = useRef<THREE.Mesh>(null);
  const r = useRef<THREE.Mesh>(null);
  useNoRaycast(l);
  useNoRaycast(r);
  return (
    <group>
      <group position={[0.57, -0.22, 0.02]}>
        <mesh ref={l} geometry={box} position={[0.05, 0.14, 0.08]} castShadow>
          <meshStandardMaterial color={color} metalness={0.65} roughness={0.32} />
        </mesh>
      </group>
      <group position={[-0.57, -0.22, 0.02]}>
        <mesh ref={r} geometry={box} position={[-0.05, 0.14, 0.08]} castShadow>
          <meshStandardMaterial color={color} metalness={0.65} roughness={0.32} />
        </mesh>
      </group>
    </group>
  );
}

function FloatingShield() {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  return (
    <mesh ref={ref} position={[0, 0.78, 0.48]} rotation={[0.08, 0, 0]}>
      <circleGeometry args={[0.52, 40]} />
      <meshPhysicalMaterial
        color="#7dd3fc"
        transparent
        opacity={0.22}
        metalness={0.18}
        roughness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ClinicalCapeMesh({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  return (
    <mesh ref={ref} position={[0, 1.12, -0.14]} rotation={[0.12, 0, 0]}>
      <planeGeometry args={[0.95, 0.72]} />
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        roughness={0.55}
        metalness={0.08}
        emissive={color}
        emissiveIntensity={0.06}
      />
    </mesh>
  );
}

function ChestEmblem({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  return (
    <mesh ref={ref} position={[0, 1.02, 0.2]} rotation={[-0.08, 0, 0]}>
      <octahedronGeometry args={[0.065, 0]} />
      <meshPhysicalMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.45}
        metalness={0.5}
        roughness={0.25}
      />
    </mesh>
  );
}

function FootTrailSpark({ position, phase }: { position: [number, number, number]; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useNoRaycast(ref);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime + phase;
    const s = 0.045 + Math.sin(t * 4) * 0.018;
    m.scale.setScalar(s / 0.045);
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.85 + Math.sin(t * 5) * 0.35;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.045, 10, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.9} />
    </mesh>
  );
}

function FeetParticleTrails() {
  return (
    <group>
      <FootTrailSpark position={[0.22, -1.48, 0.08]} phase={0} />
      <FootTrailSpark position={[-0.22, -1.48, 0.08]} phase={1.2} />
      <FootTrailSpark position={[0.18, -1.5, -0.04]} phase={2.1} />
      <FootTrailSpark position={[-0.18, -1.5, -0.04]} phase={0.7} />
    </group>
  );
}

function renderAura(auraId: string | null) {
  if (!auraId || !isGearItemId(auraId)) return null;
  const e = GEAR_BY_ID[auraId as GearItemId];
  const c = e.accentColor ?? '#22d3ee';
  if (e.preview === 'aura_wire') return <AuraWireShell color={c} />;
  return <AuraTintSphere color={c} />;
}

export default function EquippedGearAttachments({ equipped }: { equipped: EquippedGearSnapshot }) {
  return (
    <group>
      {renderAura(equipped.aura)}
      {equipped.hands === 'training_weights' && (
        <HandWeights color={GEAR_BY_ID.training_weights.accentColor ?? '#64748b'} />
      )}
      {equipped.torso === 'protective_shield' && <FloatingShield />}
      {equipped.cape === 'clinical_cape' && (
        <ClinicalCapeMesh color={GEAR_BY_ID.clinical_cape.accentColor ?? '#0ea5e9'} />
      )}
      {equipped.chest === 'emblem_clinical' && (
        <ChestEmblem color={GEAR_BY_ID.emblem_clinical.accentColor ?? '#38bdf8'} />
      )}
      {equipped.feet === 'trail_sparks' && <FeetParticleTrails />}
    </group>
  );
}
