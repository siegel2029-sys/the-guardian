import { useRef, useState, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getLevelTier } from '../../body/levelTier';

export interface MuscleSegmentProps {
  area: BodyArea | null;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  isActive: boolean;
  isPrimary: boolean;
  isHighPain: boolean;
  isSelected: boolean;
  clinicalLocked?: boolean;
  selfCareSelected?: boolean;
  /** Self-care zone finished today — gold / blue (overrides level look) */
  strengthenedToday?: boolean;
  /** Patient level (1–10) — drives material evolution */
  level: number;
  /** Passed through for parity with portal data; reserved for future micro-tuning */
  xp?: number;
  xpForNextLevel?: number;
  /** Current streak — reserved (streak VFX live on BodyMap3D) */
  streak?: number;
  onAreaClick?: (area: BodyArea) => void;
  children?: ReactNode;
}

interface MatProps {
  useStandardMaterial: boolean;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThicknessRange: [number, number];
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  targetScale: number;
}

function strongPalette(area: BodyArea): { color: string; emissive: string } {
  const gold = (area.charCodeAt(0) + area.length) % 2 === 0;
  if (gold) return { color: '#e8c547', emissive: '#b8860b' };
  return { color: '#38bdf8', emissive: '#0284c7' };
}

function recoveredChromeExtras(): Pick<
  MatProps,
  'metalness' | 'roughness' | 'clearcoat' | 'clearcoatRoughness' | 'iridescence' | 'iridescenceIOR' | 'iridescenceThicknessRange' | 'envMapIntensity'
> {
  return {
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 0.88,
    clearcoatRoughness: 0.22,
    envMapIntensity: 2.05,
    iridescence: 1,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [120, 420],
  };
}

function activeMatteTeal(): Pick<
  MatProps,
  'metalness' | 'roughness' | 'clearcoat' | 'clearcoatRoughness' | 'envMapIntensity' | 'iridescence' | 'iridescenceIOR' | 'iridescenceThicknessRange'
> {
  return {
    metalness: 0.06,
    roughness: 0.78,
    clearcoat: 0.14,
    clearcoatRoughness: 0.58,
    envMapIntensity: 1.38,
    iridescence: 0,
    iridescenceIOR: 1,
    iridescenceThicknessRange: [0, 0],
  };
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
  const envAccent = clinicalLocked || selfCareSelected ? 2.15 : 1.42;

  const strongPal =
    strengthenedToday && !isHighPain && selfCareSelected && area
      ? strongPalette(area)
      : null;

  const basePhysical = (
    partial: Partial<MatProps> & Pick<MatProps, 'color' | 'emissive' | 'emissiveIntensity' | 'targetScale'>
  ): MatProps => ({
    useStandardMaterial: false,
    roughness: 0.5,
    metalness: 0.2,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    envMapIntensity: envAccent,
    iridescence: 0,
    iridescenceIOR: 1,
    iridescenceThicknessRange: [0, 0],
    transparent: false,
    opacity: 1,
    depthWrite: true,
    ...partial,
  });

  if (!area) {
    return {
      useStandardMaterial: false,
      color: '#8fb8c8',
      emissive: '#000000',
      emissiveIntensity: 0,
      ...activeMatteTeal(),
      transparent: false,
      opacity: 1,
      depthWrite: true,
      targetScale: 1,
    };
  }

  if (clinicalLocked) {
    const chrome = tier === 'recovered' ? recoveredChromeExtras() : activeMatteTeal();
    return basePhysical({
      color: '#ff6b6b',
      emissive: '#ff1744',
      emissiveIntensity: 1.35 + hv * 0.85,
      targetScale: 1.045 + (isHovered ? 0.025 : 0),
      ...chrome,
      metalness: tier === 'recovered' ? chrome.metalness * 0.85 : 0.28,
      roughness: tier === 'recovered' ? chrome.roughness + 0.06 : 0.24,
      clearcoat: tier === 'recovered' ? chrome.clearcoat * 0.92 : 0.52,
    });
  }

  if (selfCareSelected) {
    if (strongPal) {
      return basePhysical({
        color: strongPal.color,
        emissive: strongPal.emissive,
        emissiveIntensity: 1.52 + hv * 0.95,
        targetScale: 1.08 + (isHovered ? 0.035 : 0),
        metalness: 0.42,
        roughness: 0.2,
        clearcoat: 0.68,
        clearcoatRoughness: 0.24,
        envMapIntensity: Math.max(envAccent, 1.9),
        iridescence: 0.25,
        iridescenceIOR: 1.15,
        iridescenceThicknessRange: [80, 280],
      });
    }
    const green = basePhysical({
      color: '#6bff8f',
      emissive: '#39ff14',
      emissiveIntensity: 1.28 + hv * 0.9,
      targetScale: 1.065 + (isHovered ? 0.035 : 0),
      roughness: tier === 'injured' ? 0.42 : 0.24,
      metalness: tier === 'injured' ? 0.12 : 0.22,
      clearcoat: tier === 'injured' ? 0.2 : 0.52,
      transparent: tier === 'injured',
      opacity: tier === 'injured' ? 0.72 : 1,
      depthWrite: tier !== 'injured',
    });
    if (tier === 'recovered') {
      const c = recoveredChromeExtras();
      return basePhysical({
        ...green,
        metalness: c.metalness * 0.35,
        roughness: c.roughness + 0.12,
        clearcoat: c.clearcoat * 0.55,
        envMapIntensity: c.envMapIntensity,
        iridescence: 0.45,
        iridescenceIOR: c.iridescenceIOR,
        iridescenceThicknessRange: c.iridescenceThicknessRange,
        transparent: false,
        opacity: 1,
        depthWrite: true,
      });
    }
    return green;
  }

  if (isHighPain) {
    return basePhysical({
      color: '#fb923c',
      emissive: '#c2410c',
      emissiveIntensity: 0.22 + hv,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.55,
      targetScale: 1,
      envMapIntensity: 1.15,
    });
  }

  if (!isActive) {
    if (tier === 'injured') {
      return {
        useStandardMaterial: true,
        color: isHovered ? '#e2e8f0' : '#d8dee6',
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.94,
        metalness: 0.02,
        clearcoat: 0,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0,
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        targetScale: 1 + (isHovered ? 0.03 : 0),
      };
    }
    const m = activeMatteTeal();
    return basePhysical({
      color: isHovered ? '#9fdbef' : '#7ec8de',
      emissive: '#000000',
      emissiveIntensity: 0,
      targetScale: 1 + (isHovered ? 0.03 : 0),
      ...m,
      roughness: m.roughness + 0.04,
    });
  }

  const colorStops = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'];
  const ci = Math.min(Math.floor(lf * 5), 4);
  const baseColor = isSelected ? '#99f6e4' : colorStops[ci];
  const baseEmissive = '#0d9488';

  if (tier === 'injured') {
    return {
      useStandardMaterial: true,
      color: '#cfd8dc',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.9,
      metalness: 0.03,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      targetScale:
        1 +
        (isPrimary ? 0.06 : 0.02) +
        (isHovered ? 0.05 : 0) +
        (isSelected ? 0.04 : 0),
    };
  }

  if (tier === 'active') {
    const m = activeMatteTeal();
    return basePhysical({
      color: baseColor,
      emissive: baseEmissive,
      emissiveIntensity: lf * (isPrimary ? 0.48 : 0.26) + hv + (isSelected ? 0.12 : 0),
      targetScale:
        1 +
        (isPrimary ? lf * 0.18 : lf * 0.07) +
        (isHovered ? 0.05 : 0) +
        (isSelected ? 0.04 : 0),
      ...m,
    });
  }

  const c = recoveredChromeExtras();
  return basePhysical({
    color: baseColor,
    emissive: baseEmissive,
    emissiveIntensity: lf * (isPrimary ? 0.62 : 0.38) + hv + 0.08 + (isSelected ? 0.12 : 0),
    targetScale:
      1 +
      (isPrimary ? lf * 0.2 : lf * 0.09) +
      (isHovered ? 0.05 : 0) +
      (isSelected ? 0.04 : 0),
    ...c,
  });
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
  xp: _xp,
  xpForNextLevel: _xn,
  streak: _st,
  onAreaClick,
  children,
}: MuscleSegmentProps) {
  void _xp;
  void _xn;
  void _st;

  const meshRef = useRef<THREE.Mesh>(null);
  const stdRef = useRef<THREE.MeshStandardMaterial>(null);
  const physRef = useRef<THREE.MeshPhysicalMaterial>(null);
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
    if (!mesh) return;
    _sv.setScalar(mp.targetScale);
    mesh.scale.lerp(_sv, 0.12);

    if (mp.useStandardMaterial) {
      const mat = stdRef.current;
      if (!mat) return;
      _tc.set(mp.color);
      mat.color.lerp(_tc, 0.15);
      mat.emissive.set(mp.emissive);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, mp.emissiveIntensity, 0.12);
      mat.roughness = THREE.MathUtils.lerp(mat.roughness, mp.roughness, 0.12);
      mat.metalness = THREE.MathUtils.lerp(mat.metalness, mp.metalness, 0.12);
      mat.transparent = mp.transparent;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, mp.opacity, 0.14);
      mat.depthWrite = mp.depthWrite;
    } else {
      const mat = physRef.current;
      if (!mat) return;
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
      mat.iridescence = THREE.MathUtils.lerp(mat.iridescence, mp.iridescence, 0.12);
      mat.iridescenceIOR = THREE.MathUtils.lerp(mat.iridescenceIOR, mp.iridescenceIOR, 0.12);
      const tr = mp.iridescenceThicknessRange;
      const cur = mat.iridescenceThicknessRange;
      cur[0] = THREE.MathUtils.lerp(cur[0], tr[0], 0.1);
      cur[1] = THREE.MathUtils.lerp(cur[1], tr[1], 0.1);
      mat.transparent = mp.transparent;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, mp.opacity, 0.14);
      mat.depthWrite = mp.depthWrite;
    }
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
        {mp.useStandardMaterial ? (
          <meshStandardMaterial
            ref={stdRef}
            color={mp.color}
            emissive={mp.emissive}
            emissiveIntensity={mp.emissiveIntensity}
            roughness={mp.roughness}
            metalness={mp.metalness}
            transparent={mp.transparent}
            opacity={mp.opacity}
            depthWrite={mp.depthWrite}
          />
        ) : (
          <meshPhysicalMaterial
            ref={physRef}
            color={mp.color}
            emissive={mp.emissive}
            emissiveIntensity={mp.emissiveIntensity}
            roughness={mp.roughness}
            metalness={mp.metalness}
            clearcoat={mp.clearcoat}
            clearcoatRoughness={mp.clearcoatRoughness}
            envMapIntensity={mp.envMapIntensity}
            iridescence={mp.iridescence}
            iridescenceIOR={mp.iridescenceIOR}
            iridescenceThicknessRange={mp.iridescenceThicknessRange}
            transparent={mp.transparent}
            opacity={mp.opacity}
            depthWrite={mp.depthWrite}
          />
        )}

        {children}
      </mesh>

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
