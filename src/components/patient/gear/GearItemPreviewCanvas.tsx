import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GEAR_BY_ID,
  isGearItemId,
  type GearItemId,
  type GearPreviewKind,
} from '../../../config/gearCatalog';

function PreviewContent({ kind, color }: { kind: GearPreviewKind; color: string }) {
  const box = useMemo(() => new THREE.BoxGeometry(0.45, 0.35, 0.45), []);
  const torus = useMemo(() => new THREE.TorusGeometry(0.22, 0.06, 10, 24), []);

  switch (kind) {
    case 'aura_sphere':
      return (
        <mesh scale={1.05}>
          <sphereGeometry args={[0.42, 24, 18]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.55}
            metalness={0.2}
            roughness={0.35}
          />
        </mesh>
      );
    case 'aura_wire':
      return (
        <mesh scale={1.02}>
          <sphereGeometry args={[0.44, 16, 12]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
      );
    case 'mesh_emblem':
      return (
        <mesh rotation={[0.4, 0.5, 0]}>
          <octahedronGeometry args={[0.38, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            metalness={0.55}
            roughness={0.22}
          />
        </mesh>
      );
    case 'mesh_trail':
      return (
        <group>
          <mesh position={[-0.12, -0.28, 0]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.14, -0.32, 0.04]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={0.9} />
          </mesh>
        </group>
      );
    case 'mesh_weights':
      return (
        <group>
          <mesh geometry={box} position={[-0.2, 0, 0]}>
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.28} />
          </mesh>
          <mesh geometry={box} position={[0.2, 0, 0]}>
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.28} />
          </mesh>
        </group>
      );
    case 'mesh_shield':
      return (
        <mesh rotation={[0.15, 0, 0]}>
          <circleGeometry args={[0.48, 32]} />
          <meshPhysicalMaterial
            color={color}
            transparent
            opacity={0.45}
            metalness={0.2}
            roughness={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      );
    case 'mesh_cape':
      return (
        <mesh rotation={[0.2, 0, 0]}>
          <planeGeometry args={[0.85, 0.65]} />
          <meshStandardMaterial
            color={color}
            side={THREE.DoubleSide}
            emissive={color}
            emissiveIntensity={0.12}
            roughness={0.5}
          />
        </mesh>
      );
    case 'mesh_booster':
      return (
        <mesh rotation={[0.35, 0.4, 0]} geometry={torus}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.65}
            metalness={0.45}
            roughness={0.2}
          />
        </mesh>
      );
    default:
      return (
        <mesh>
          <boxGeometry args={[0.35, 0.35, 0.35]} />
          <meshStandardMaterial color="#64748b" roughness={0.6} />
        </mesh>
      );
  }
}

export default function GearItemPreviewCanvas({ itemId }: { itemId: GearItemId }) {
  const entry = GEAR_BY_ID[itemId];
  const color = entry.accentColor ?? '#94a3b8';

  return (
    <div className="h-[88px] w-full rounded-lg overflow-hidden border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 2.8], zoom: 95, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['transparent']} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.2, 2.5, 2]} intensity={1.1} />
        <directionalLight position={[-1.5, 0.5, -1]} intensity={0.35} color="#a5b4fc" />
        <Suspense fallback={null}>
          <PreviewContent kind={entry.preview} color={color} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function gearItemPreviewSupported(itemId: string): itemId is GearItemId {
  return isGearItemId(itemId) && GEAR_BY_ID[itemId as GearItemId].preview !== 'none';
}
