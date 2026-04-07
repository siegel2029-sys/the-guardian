import { useRef, useState, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';

export interface MuscleSegmentProps {
  area: BodyArea | null;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  isActive: boolean;
  isPrimary: boolean;
  isHighPain: boolean;
  isSelected: boolean;
  level: number;
  onAreaClick?: (area: BodyArea) => void;
  children?: ReactNode; // optional overlay (e.g. wireframe)
}

// ── Material parameters computed from state ──────────────────────
interface MatProps {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  targetScale: number;
}

function computeMatProps(
  area: BodyArea | null,
  isActive: boolean,
  isPrimary: boolean,
  isHighPain: boolean,
  isSelected: boolean,
  isHovered: boolean,
  level: number
): MatProps {
  const lf = Math.min(Math.max(level, 1), 10) / 10;
  const hv = isHovered ? 0.06 : 0;

  // ── Non-interactive base segment ─────────────────────────────
  if (!area) {
    return {
      color: '#8fb8c8',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.82,
      metalness: 0.04,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
      targetScale: 1.0,
    };
  }

  // ── High pain (≥ 6) — soft warning orange ────────────────────
  if (isHighPain) {
    return {
      color: '#fb923c',
      emissive: '#c2410c',
      emissiveIntensity: 0.20 + hv,
      roughness: 0.60,
      metalness: 0.0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
      targetScale: 1.0,
    };
  }

  // ── Inactive (not in this patient's plan) ────────────────────
  if (!isActive) {
    return {
      color: isHovered ? '#b0d8e8' : '#90bac8',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.80,
      metalness: 0.0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.70,
      targetScale: 1.0 + (isHovered ? 0.03 : 0),
    };
  }

  // ── Active/prescribed – level drives ALL visual parameters ───
  // Five colour stops from pale mint → deep clinical teal
  const colorStops = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'];
  const ci = Math.min(Math.floor(lf * 5), 4);
  const baseColor = isSelected ? '#99f6e4' : colorStops[ci];

  // As level rises: less rough (silkier), more metal (sheen), more glow
  const roughness = Math.max(0.12, 0.82 - lf * 0.72);
  const metalness = lf * (isPrimary ? 0.44 : 0.22);
  // Clearcoat simulates the "fascial sheath" over muscles
  const clearcoat = 0.12 + lf * (isPrimary ? 0.30 : 0.16);
  const clearcoatRoughness = Math.max(0.20, 0.68 - lf * 0.48);

  const emissiveIntensity =
    lf * (isPrimary ? 0.55 : 0.25) + hv + (isSelected ? 0.14 : 0);

  // Muscle "grows" as level increases — primary area most pronounced
  const scaleBoost =
    (isPrimary ? lf * 0.22 : lf * 0.08) +
    (isHovered ? 0.05 : 0) +
    (isSelected ? 0.04 : 0);

  return {
    color: baseColor,
    emissive: '#0d9488',
    emissiveIntensity,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness,
    targetScale: 1 + scaleBoost,
  };
}

// ── Reused scratch objects ────────────────────────────────────────
const _sv = new THREE.Vector3();
const _tc = new THREE.Color();
const _te = new THREE.Color();

export default function MuscleSegment({
  area,
  geometry,
  position,
  rotation,
  isActive,
  isPrimary,
  isHighPain,
  isSelected,
  level,
  onAreaClick,
  children,
}: MuscleSegmentProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const mp = useMemo(
    () => computeMatProps(area, isActive, isPrimary, isHighPain, isSelected, hovered, level),
    [area, isActive, isPrimary, isHighPain, isSelected, hovered, level]
  );

  // Smooth scale lerp + material lerp every frame
  useFrame(() => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    // Scale
    _sv.setScalar(mp.targetScale);
    mesh.scale.lerp(_sv, 0.12);

    // Material colour lerp (avoids abrupt jumps when switching patients)
    _tc.set(mp.color);
    _te.set(mp.emissive);
    (mat.color as THREE.Color).lerp(_tc, 0.15);
    (mat.emissive as THREE.Color).lerp(_te, 0.15);
    mat.roughness = THREE.MathUtils.lerp(mat.roughness, mp.roughness, 0.12);
    mat.metalness = THREE.MathUtils.lerp(mat.metalness, mp.metalness, 0.12);
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, mp.emissiveIntensity, 0.12);
    mat.clearcoat = THREE.MathUtils.lerp(mat.clearcoat, mp.clearcoat, 0.10);
    mat.clearcoatRoughness = THREE.MathUtils.lerp(mat.clearcoatRoughness, mp.clearcoatRoughness, 0.10);
  });

  const interactive = !!area;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={rotation ? (rotation as unknown as THREE.Euler) : undefined}
      castShadow
      receiveShadow
      onPointerOver={
        interactive
          ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => { setHovered(false); document.body.style.cursor = ''; }
          : undefined
      }
      onClick={
        interactive && onAreaClick
          ? (e) => { e.stopPropagation(); onAreaClick(area!); }
          : undefined
      }
    >
      {/* MeshPhysicalMaterial for clearcoat + roughness texture */}
      <meshPhysicalMaterial
        ref={matRef}
        color={mp.color}
        emissive={mp.emissive}
        emissiveIntensity={mp.emissiveIntensity}
        roughness={mp.roughness}
        metalness={mp.metalness}
        clearcoat={mp.clearcoat}
        clearcoatRoughness={mp.clearcoatRoughness}
        envMapIntensity={1.4}
      />

      {children}

      {/* Hebrew hover tooltip */}
      {hovered && area && (
        <Html position={[0, 0.28, 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
          <div
            style={{
              background: 'rgba(13,148,136,0.92)',
              color: '#fff',
              padding: '3px 9px',
              borderRadius: '7px',
              fontSize: '11px',
              fontFamily: '"Arial Hebrew", Arial, sans-serif',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              direction: 'rtl',
              boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
              backdropFilter: 'blur(4px)',
              userSelect: 'none',
            }}
          >
            {bodyAreaLabels[area]}
          </div>
        </Html>
      )}
    </mesh>
  );
}
