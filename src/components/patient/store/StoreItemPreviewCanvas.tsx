import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import {
  STORE_BY_ID,
  isStoreItemId,
  type StoreItemId,
  type StorePreviewKind,
} from '../../../config/storeCatalog';

function PreviewMesh({ kind, color }: { kind: StorePreviewKind; color: string }) {
  const sphere = useMemo(() => new THREE.SphereGeometry(0.38, 20, 16), []);
  const cylinder = useMemo(() => new THREE.CylinderGeometry(0.14, 0.14, 0.55, 16), []);
  const box = useMemo(() => new THREE.BoxGeometry(0.5, 0.32, 0.65), []);

  switch (kind) {
    case 'sphere':
      return (
        <mesh geometry={sphere}>
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh geometry={cylinder} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.5} />
        </mesh>
      );
    case 'box':
      return (
        <mesh geometry={box}>
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
        </mesh>
      );
    default:
      return null;
  }
}

export default function StoreItemPreviewCanvas({ itemId }: { itemId: StoreItemId }) {
  const entry = STORE_BY_ID[itemId];

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
          <PreviewMesh kind={entry.preview} color={entry.accentColor} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function storeItemPreviewSupported(itemId: string): itemId is StoreItemId {
  return isStoreItemId(itemId);
}
