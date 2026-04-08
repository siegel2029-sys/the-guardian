import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnatomicalStage } from '../../body/anatomicalEvolution';
import {
  anatomicalStageShowsNeural,
  anatomicalStageShowsVascular,
} from '../../body/anatomicalEvolution';

function tubeFromPoints(points: THREE.Vector3[], radius: number, tubular = 24): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  return new THREE.TubeGeometry(curve, tubular, radius, 6, false);
}

function VascularTubes({ intensity }: { intensity: number }) {
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const { geoms, materials } = useMemo(() => {
    const paths: THREE.Vector3[][] = [
      [
        new THREE.Vector3(0, 1.35, 0.2),
        new THREE.Vector3(0.12, 1.05, 0.22),
        new THREE.Vector3(0.22, 0.75, 0.18),
        new THREE.Vector3(0.18, 0.45, 0.16),
      ],
      [
        new THREE.Vector3(0, 1.32, 0.2),
        new THREE.Vector3(-0.14, 0.98, 0.21),
        new THREE.Vector3(-0.24, 0.68, 0.17),
        new THREE.Vector3(-0.2, 0.4, 0.15),
      ],
      [
        new THREE.Vector3(0.08, 0.95, 0.28),
        new THREE.Vector3(0.42, 0.88, 0.14),
        new THREE.Vector3(0.52, 0.55, 0.12),
        new THREE.Vector3(0.48, 0.2, 0.1),
      ],
      [
        new THREE.Vector3(-0.08, 0.95, 0.28),
        new THREE.Vector3(-0.42, 0.88, 0.14),
        new THREE.Vector3(-0.52, 0.55, 0.12),
        new THREE.Vector3(-0.48, 0.2, 0.1),
      ],
      [
        new THREE.Vector3(0, 0.55, 0.26),
        new THREE.Vector3(0.2, 0.35, 0.22),
        new THREE.Vector3(0.22, -0.05, 0.2),
        new THREE.Vector3(0.2, -0.55, 0.16),
      ],
      [
        new THREE.Vector3(0, 0.52, 0.26),
        new THREE.Vector3(-0.2, 0.32, 0.22),
        new THREE.Vector3(-0.22, -0.08, 0.2),
        new THREE.Vector3(-0.2, -0.58, 0.16),
      ],
      [
        new THREE.Vector3(0.18, 0.15, 0.24),
        new THREE.Vector3(0.26, -0.35, 0.2),
        new THREE.Vector3(0.24, -0.95, 0.14),
      ],
      [
        new THREE.Vector3(-0.18, 0.15, 0.24),
        new THREE.Vector3(-0.26, -0.35, 0.2),
        new THREE.Vector3(-0.24, -0.95, 0.14),
      ],
    ];
    const mats = paths.map(
      () =>
        new THREE.MeshStandardMaterial({
          color: '#7f1d1d',
          emissive: '#ef4444',
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        })
    );
    const geoms = paths.map((pts, i) => tubeFromPoints(pts, 0.008 + (i % 3) * 0.002));
    return { geoms, materials: mats };
  }, []);

  materialsRef.current = materials;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.75 + Math.sin(t * 2.1) * 0.22;
    materialsRef.current.forEach((m) => {
      m.emissiveIntensity = 0.45 * intensity * pulse;
      m.opacity = THREE.MathUtils.clamp(0.22 * intensity + 0.12 * pulse, 0.12, 0.72);
    });
  });

  return (
    <group renderOrder={2}>
      {geoms.map((g, i) => (
        <mesh key={`v-${i}`} geometry={g} material={materials[i]} raycast={() => {}} />
      ))}
    </group>
  );
}

function NeuralTubes({ intensity }: { intensity: number }) {
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const { geoms, materials } = useMemo(() => {
    const paths: THREE.Vector3[][] = [
      [
        new THREE.Vector3(0, 1.72, 0.12),
        new THREE.Vector3(0.06, 1.4, 0.18),
        new THREE.Vector3(0.1, 1.0, 0.24),
        new THREE.Vector3(0.08, 0.55, 0.26),
        new THREE.Vector3(0, 0.2, 0.22),
      ],
      [
        new THREE.Vector3(0, 1.7, 0.12),
        new THREE.Vector3(-0.06, 1.38, 0.18),
        new THREE.Vector3(-0.1, 0.98, 0.24),
        new THREE.Vector3(-0.08, 0.52, 0.26),
        new THREE.Vector3(0, 0.18, 0.22),
      ],
      [
        new THREE.Vector3(0, 1.25, 0.32),
        new THREE.Vector3(0.35, 0.95, 0.2),
        new THREE.Vector3(0.48, 0.5, 0.16),
        new THREE.Vector3(0.42, -0.2, 0.14),
        new THREE.Vector3(0.28, -0.85, 0.1),
      ],
      [
        new THREE.Vector3(0, 1.22, 0.32),
        new THREE.Vector3(-0.35, 0.92, 0.2),
        new THREE.Vector3(-0.48, 0.48, 0.16),
        new THREE.Vector3(-0.42, -0.22, 0.14),
        new THREE.Vector3(-0.28, -0.88, 0.1),
      ],
      [
        new THREE.Vector3(0, 0.85, 0.3),
        new THREE.Vector3(0.15, 0.4, 0.28),
        new THREE.Vector3(0.12, -0.2, 0.24),
        new THREE.Vector3(0.1, -0.9, 0.18),
      ],
      [
        new THREE.Vector3(0, 0.82, 0.3),
        new THREE.Vector3(-0.15, 0.38, 0.28),
        new THREE.Vector3(-0.12, -0.22, 0.24),
        new THREE.Vector3(-0.1, -0.92, 0.18),
      ],
    ];
    const mats = paths.map(
      () =>
        new THREE.MeshStandardMaterial({
          color: '#312e81',
          emissive: '#67e8f9',
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        })
    );
    const geoms = paths.map((pts) => tubeFromPoints(pts, 0.005, 32));
    return { geoms, materials: mats };
  }, []);

  materialsRef.current = materials;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const w = 0.82 + Math.sin(t * 3.2) * 0.28 + Math.sin(t * 5.7) * 0.08;
    materialsRef.current.forEach((m) => {
      m.emissiveIntensity = 0.75 * intensity * w;
      m.opacity = THREE.MathUtils.clamp(0.28 * intensity + 0.1 * w, 0.15, 0.85);
    });
  });

  return (
    <group renderOrder={3}>
      {geoms.map((g, i) => (
        <mesh key={`n-${i}`} geometry={g} material={materials[i]} raycast={() => {}} />
      ))}
    </group>
  );
}

export default function VascularNeuralEvolution({ stage }: { stage: AnatomicalStage }) {
  const showV = anatomicalStageShowsVascular(stage);
  const showN = anatomicalStageShowsNeural(stage);
  const vInt = showV ? (stage === 'neural' ? 0.62 : 1) : 0;
  const nInt = showN ? 1 : 0;

  if (!showV && !showN) return null;

  return (
    <group>
      {showV && <VascularTubes intensity={vInt} />}
      {showN && <NeuralTubes intensity={nInt} />}
    </group>
  );
}
