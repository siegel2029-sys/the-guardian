import { useRef, useState, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getLevelTier, type LevelTier } from '../../body/levelTier';

export interface MuscleSegmentProps {
  area: BodyArea | null;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  isActive: boolean;
  isPrimary: boolean;
  isHighPain: boolean;
  isSelected: boolean;
  /** Therapist clinical focus — red glow, not clickable */
  clinicalLocked?: boolean;
  /** Patient-selected self-care zone — green glow */
  selfCareSelected?: boolean;
  /** Completed a session for this area today — gold / electric blue */
  strengthenedToday?: boolean;
  level: number;
  onAreaClick?: (area: BodyArea) => void;
  children?: ReactNode;
}

interface MatProps {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  targetScale: number;
  envMapIntensity: number;
  transparent: boolean;
  opacity: number;
  showWireframeOverlay: boolean;
}

function strongPalette(area: BodyArea): { color: string; emissive: string } {
  const gold = (area.charCodeAt(0) + area.length) % 2 === 0;
  if (gold) {
    return { color: '#e8c547', emissive: '#b8860b' };
  }
  return { color: '#38bdf8', emissive: '#0284c7' };
}

function applyLevelTier(
  mp: Omit<MatProps, 'showWireframeOverlay'>,
  tier: LevelTier,
  clinicalLocked: boolean,
  isHighPain: boolean
): Omit<MatProps, 'showWireframeOverlay'> {
  const out = { ...mp };
  out.transparent = false;
  out.opacity = 1;

  if (tier === 'ghost') {
    const baseOp = clinicalLocked ? 0.58 : isHighPain ? 0.52 : 0.4;
    out.transparent = true;
    out.opacity = Math.min(0.92, baseOp + Math.min(0.14, mp.emissiveIntensity * 0.08));
    out.roughness = Math.min(1, mp.roughness + 0.14);
    out.metalness = mp.metalness * 0.65;
    out.clearcoat = mp.clearcoat * 0.55;
    out.emissiveIntensity = mp.emissiveIntensity * 0.88;
    out.envMapIntensity = mp.envMapIntensity * 0.75;
  } else if (tier === 'matte') {
    out.roughness = Math.min(1, mp.roughness + 0.2);
    out.metalness = mp.metalness * 0.42;
    out.clearcoat = mp.clearcoat * 0.48;
    out.envMapIntensity = mp.envMapIntensity * 0.92;
  } else {
    if (!clinicalLocked && !isHighPain) {
      out.metalness = Math.max(mp.metalness, 0.62);
      out.roughness = Math.min(mp.roughness, 0.2);
      out.clearcoat = Math.max(mp.clearcoat, 0.55);
      out.clearcoatRoughness = Math.min(mp.clearcoatRoughness, 0.28);
      out.emissiveIntensity = mp.emissiveIntensity * 1.12 + 0.06;
      out.envMapIntensity = Math.max(mp.envMapIntensity, 1.85);
    } else {
      out.metalness = Math.max(mp.metalness, 0.35);
      out.roughness = Math.min(mp.roughness, 0.35);
      out.envMapIntensity = mp.envMapIntensity * 1.08;
    }
  }
  return out;
}

function computeMatProps(
  area: BodyArea | null,
  isActive: boolean,
  isPrimary: boolean,
  isHighPain: boolean,
  isSelected: boolean,
  clinicalLocked: boolean,
  selfCareSelected: boolean,
  strengthenedToday: boolean,
  isHovered: boolean,
  level: number
): MatProps {
  const tier = getLevelTier(level);
  const lf = Math.min(Math.max(level, 1), 10) / 10;
  const hv = isHovered ? 0.06 : 0;

  const envBase = clinicalLocked || selfCareSelected ? 2.15 : 1.4;

  if (!area) {
    const base = {
      color: '#8fb8c8',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.82,
      metalness: 0.04,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
      targetScale: 1.0,
      envMapIntensity: 1.15,
      transparent: false,
      opacity: 1,
    };
    const tiered = applyLevelTier(base, tier, false, false);
    return { ...tiered, showWireframeOverlay: tier === 'ghost' };
  }

  if (clinicalLocked) {
    const base = {
      color: '#ff6b6b',
      emissive: '#ff1744',
      emissiveIntensity: 1.35 + hv * 0.85,
      roughness: 0.22,
      metalness: 0.28,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      targetScale: 1.045 + (isHovered ? 0.025 : 0),
      envMapIntensity: envBase,
      transparent: false,
      opacity: 1,
    };
    const tiered = applyLevelTier(base, tier, true, false);
    return { ...tiered, showWireframeOverlay: tier === 'ghost' };
  }

  const strongPal =
    strengthenedToday && !isHighPain && (selfCareSelected || isActive)
      ? strongPalette(area)
      : null;

  if (selfCareSelected) {
    const pal = strongPal ?? { color: '#6bff8f', emissive: '#39ff14' };
    const base = {
      color: pal.color,
      emissive: pal.emissive,
      emissiveIntensity: (strongPal ? 1.45 : 1.28) + hv * 0.9,
      roughness: strongPal ? 0.2 : 0.24,
      metalness: strongPal ? 0.38 : 0.22,
      clearcoat: strongPal ? 0.62 : 0.52,
      clearcoatRoughness: strongPal ? 0.22 : 0.3,
      targetScale: 1.065 + (isHovered ? 0.035 : 0),
      envMapIntensity: envBase,
      transparent: false,
      opacity: 1,
    };
    const tiered = applyLevelTier(base, tier, false, false);
    return { ...tiered, showWireframeOverlay: tier === 'ghost' };
  }

  if (isHighPain) {
    const base = {
      color: '#fb923c',
      emissive: '#c2410c',
      emissiveIntensity: 0.2 + hv,
      roughness: 0.6,
      metalness: 0.0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
      targetScale: 1.0,
      envMapIntensity: 1.2,
      transparent: false,
      opacity: 1,
    };
    const tiered = applyLevelTier(base, tier, false, true);
    return { ...tiered, showWireframeOverlay: tier === 'ghost' };
  }

  if (!isActive) {
    const base = {
      color: isHovered ? '#b0d8e8' : '#90bac8',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.8,
      metalness: 0.0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.7,
      targetScale: 1.0 + (isHovered ? 0.03 : 0),
      envMapIntensity: 1.1,
      transparent: false,
      opacity: 1,
    };
    const tiered = applyLevelTier(base, tier, false, false);
    return { ...tiered, showWireframeOverlay: tier === 'ghost' };
  }

  const colorStops = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'];
  const ci = Math.min(Math.floor(lf * 5), 4);
  const pal = strongPal ?? { color: isSelected ? '#99f6e4' : colorStops[ci], emissive: '#0d9488' };

  const roughness = strongPal
    ? Math.max(0.14, 0.55 - lf * 0.35)
    : Math.max(0.12, 0.82 - lf * 0.72);
  const metalness = strongPal
    ? Math.max(0.35, lf * (isPrimary ? 0.5 : 0.32))
    : lf * (isPrimary ? 0.44 : 0.22);
  const clearcoat = strongPal
    ? 0.35 + lf * (isPrimary ? 0.22 : 0.12)
    : 0.12 + lf * (isPrimary ? 0.3 : 0.16);
  const clearcoatRoughness = strongPal
    ? Math.max(0.18, 0.45 - lf * 0.28)
    : Math.max(0.2, 0.68 - lf * 0.48);

  const emissiveIntensity =
    (strongPal ? lf * 0.65 + 0.35 : lf * (isPrimary ? 0.55 : 0.25)) +
    hv +
    (isSelected ? 0.14 : 0);

  const scaleBoost =
    (isPrimary ? lf * 0.22 : lf * 0.08) +
    (isHovered ? 0.05 : 0) +
    (isSelected ? 0.04 : 0);

  const base = {
    color: pal.color,
    emissive: pal.emissive,
    emissiveIntensity,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness,
    targetScale: 1 + scaleBoost,
    envMapIntensity: strongPal ? Math.max(envBase, 1.75) : envBase,
    transparent: false,
    opacity: 1,
  };
  const tiered = applyLevelTier(base, tier, false, false);
  return { ...tiered, showWireframeOverlay: tier === 'ghost' };
}

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
  clinicalLocked = false,
  selfCareSelected = false,
  strengthenedToday = false,
  level,
  onAreaClick,
  children,
}: MuscleSegmentProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const mp = useMemo(
    () =>
      computeMatProps(
        area,
        isActive,
        isPrimary,
        isHighPain,
        isSelected,
        clinicalLocked,
        selfCareSelected,
        strengthenedToday,
        hovered,
        level
      ),
    [
      area,
      isActive,
      isPrimary,
      isHighPain,
      isSelected,
      clinicalLocked,
      selfCareSelected,
      strengthenedToday,
      hovered,
      level,
    ]
  );

  useFrame(() => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    _sv.setScalar(mp.targetScale);
    mesh.scale.lerp(_sv, 0.12);

    _tc.set(mp.color);
    _te.set(mp.emissive);
    mat.color.lerp(_tc, 0.15);
    mat.emissive.lerp(_te, 0.15);
    mat.roughness = THREE.MathUtils.lerp(mat.roughness, mp.roughness, 0.12);
    mat.metalness = THREE.MathUtils.lerp(mat.metalness, mp.metalness, 0.12);
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, mp.emissiveIntensity, 0.12);
    mat.clearcoat = THREE.MathUtils.lerp(mat.clearcoat, mp.clearcoat, 0.1);
    mat.clearcoatRoughness = THREE.MathUtils.lerp(mat.clearcoatRoughness, mp.clearcoatRoughness, 0.1);
    mat.envMapIntensity = THREE.MathUtils.lerp(mat.envMapIntensity, mp.envMapIntensity, 0.1);
    mat.transparent = mp.transparent;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, mp.opacity, 0.14);
    mat.depthWrite = mat.opacity >= 0.98 && !mp.transparent;
  });

  const interactive = !!area && !clinicalLocked;
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;

  return (
    <group position={position} rotation={rot}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerOver={
          interactive
            ? (e) => {
                e.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
              }
            : clinicalLocked && area
              ? (e) => {
                  e.stopPropagation();
                  setHovered(true);
                }
              : undefined
        }
        onPointerOut={
          interactive || (clinicalLocked && area)
            ? () => {
                setHovered(false);
                document.body.style.cursor = '';
              }
            : undefined
        }
        onClick={
          interactive && onAreaClick
            ? (e) => {
                e.stopPropagation();
                onAreaClick(area!);
              }
            : undefined
        }
      >
        <meshPhysicalMaterial
          ref={matRef}
          color={mp.color}
          emissive={mp.emissive}
          emissiveIntensity={mp.emissiveIntensity}
          roughness={mp.roughness}
          metalness={mp.metalness}
          clearcoat={mp.clearcoat}
          clearcoatRoughness={mp.clearcoatRoughness}
          envMapIntensity={mp.envMapIntensity}
          transparent={mp.transparent}
          opacity={mp.opacity}
          depthWrite={!mp.transparent || mp.opacity >= 0.95}
        />

        {children}
      </mesh>

      {mp.showWireframeOverlay && (
        <mesh geometry={geometry} raycast={() => {}}>
          <meshBasicMaterial
            color="#7dd3c0"
            wireframe
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      )}

      {hovered && area && (
        <Html position={[0, 0.28, 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
          <div
            style={{
              background: clinicalLocked
                ? 'rgba(185,28,28,0.92)'
                : selfCareSelected
                  ? 'rgba(21,101,52,0.92)'
                  : 'rgba(13,148,136,0.92)',
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
    </group>
  );
}
