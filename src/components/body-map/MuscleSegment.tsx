import { useRef, useState, useMemo, useLayoutEffect, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getLevelTier } from '../../body/levelTier';
import type { MuscleEvolutionStage } from '../../body/anatomicalEvolution';
import {
  getMuscleEvolutionStage,
  getMuscleVertexInflation,
  muscleStageHealthyGlowExtra,
  muscleStageNormalScaleMul,
  muscleStageUsesFiberNormalMap,
  muscleStageVolumeBoost,
} from '../../body/anatomicalEvolution';
import {
  installMuscleVertexInflation,
  clearMuscleVertexInflationPatch,
} from './muscleVertexInflation';

const MUSCLE_NORMAL_STD = new THREE.Vector2(0.42, 0.42);
const MUSCLE_NORMAL_PHYS = new THREE.Vector2(0.48, 0.48);

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
  /** Patient level (1–100) — נפח שריר וחומרים */
  level: number;
  /** Passed through for parity with portal data; reserved for future micro-tuning */
  xp?: number;
  xpForNextLevel?: number;
  /** Current streak — reserved (streak VFX live on BodyMap3D) */
  streak?: number;
  /** שלבי נפח שריר: התאוששות → חיזוק → כוח */
  muscleStage?: MuscleEvolutionStage;
  muscleNormalMap?: THREE.Texture | null;
  muscleRoughnessMap?: THREE.Texture | null;
  /**
   * 0 = ללא נפח קדקודים (מפרקים ומקטעי בחירה על גאומטריית מפרק).
   * נפח שריר מוחל רק ב־AnatomyModel על גלילי זרוע/ירך (BaseSegment).
   */
  vertexInflationWeight?: number;
  /** מכפיל נפח צמיחה לפי מקטע (1 = מלא לפי רמת המטופל) */
  growthLayerWeight?: number;
  /** שכבת פגיעה — זוהר אדום נפרד ממיקוד קליני */
  injuryHighlight?: boolean;
  /**
   * false = המפרק לא חוסם raycast — לחיצה «על האמצע» של הגפ תיפול על הגליל (ירך/שוק/זרוע/אמה).
   */
  participatesInHitTest?: boolean;
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
  const tealSide = (area.charCodeAt(0) + area.length) % 2 === 0;
  if (tealSide) return { color: '#5eead4', emissive: '#0d9488' };
  return { color: '#ef4444', emissive: '#7f1d1d' };
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
  level: number,
  stage: MuscleEvolutionStage,
  injuryHighlight: boolean
): MatProps {
  const tier = getLevelTier(level);
  const lf = Math.min(Math.max(level, 1), 100) / 100;
  const hv = isHovered ? 0.06 : 0;
  const envAccent = clinicalLocked || selfCareSelected ? 2.15 : 1.42;
  const volBoost = muscleStageVolumeBoost(stage);
  const glowX = muscleStageHealthyGlowExtra(stage);

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

  if (injuryHighlight) {
    return basePhysical({
      color: '#fecaca',
      emissive: '#dc2626',
      emissiveIntensity: 1.25 + hv * 0.85,
      targetScale: 1.04 + (isHovered ? 0.03 : 0),
      metalness: 0.22,
      roughness: 0.38,
      clearcoat: 0.45,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.55,
      iridescence: 0.12,
      iridescenceIOR: 1.12,
      iridescenceThicknessRange: [60, 200],
    });
  }

  if (clinicalLocked) {
    const chrome = tier === 'recovered' ? recoveredChromeExtras() : activeMatteTeal();
    return basePhysical({
      color: '#dc2626',
      emissive: '#7f1d1d',
      emissiveIntensity: 1.35 + hv * 0.85 + glowX * 0.25,
      targetScale: 1.045 + (isHovered ? 0.025 : 0) + volBoost,
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
        targetScale: 1.08 + (isHovered ? 0.035 : 0) + volBoost,
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
      color: '#2dd4bf',
      emissive: '#0f766e',
      emissiveIntensity: 1.22 + hv * 0.85 + glowX,
      targetScale: 1.065 + (isHovered ? 0.035 : 0) + volBoost,
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

  if (
    stage === 'post_injury' &&
    area &&
    !clinicalLocked &&
    !selfCareSelected &&
    isActive
  ) {
    return {
      useStandardMaterial: true,
      color: isPrimary ? '#bae6fd' : '#94a3b8',
      emissive: '#0e7490',
      emissiveIntensity: 0.06 + hv * 0.45,
      roughness: 0.9,
      metalness: 0.04,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.45,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      targetScale:
        0.98 +
        (isPrimary ? 0.04 : 0.015) +
        (isHovered ? 0.03 : 0) +
        (isSelected ? 0.025 : 0),
    };
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
      color: isHovered ? '#7dd3fc' : '#5eead4',
      emissive: '#0f172a',
      emissiveIntensity: stage === 'power' ? 0.05 : 0,
      targetScale: 1 + (isHovered ? 0.03 : 0) + volBoost * 0.4,
      ...m,
      roughness: m.roughness + 0.04,
    });
  }

  const colorStops = ['#991b1b', '#b91c1c', '#dc2626', '#14b8a6', '#2dd4bf'];
  const ci = Math.min(Math.floor(lf * 5), 4);
  const baseColor = isSelected ? '#5eead4' : colorStops[ci];
  const baseEmissive = ci <= 2 ? '#450a0a' : '#0f766e';

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
      emissiveIntensity:
        lf * (isPrimary ? 0.48 : 0.26) + hv + (isSelected ? 0.12 : 0) + glowX,
      targetScale:
        1 +
        (isPrimary ? lf * 0.18 : lf * 0.07) +
        (isHovered ? 0.05 : 0) +
        (isSelected ? 0.04 : 0) +
        volBoost,
      ...m,
    });
  }

  const c = recoveredChromeExtras();
  return basePhysical({
    color: baseColor,
    emissive: baseEmissive,
    emissiveIntensity:
      lf * (isPrimary ? 0.62 : 0.38) + hv + 0.08 + (isSelected ? 0.12 : 0) + glowX,
    targetScale:
      1 +
      (isPrimary ? lf * 0.2 : lf * 0.09) +
      (isHovered ? 0.05 : 0) +
      (isSelected ? 0.04 : 0) +
      volBoost,
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
  muscleStage: muscleStageProp,
  muscleNormalMap = null,
  muscleRoughnessMap = null,
  vertexInflationWeight = 0,
  growthLayerWeight = 1,
  injuryHighlight = false,
  participatesInHitTest = true,
  onAreaClick,
  children,
}: MuscleSegmentProps) {
  void _xp;
  void _xn;
  void _st;

  const muscleStage = muscleStageProp ?? getMuscleEvolutionStage(level);

  const meshRef = useRef<THREE.Mesh>(null);
  const stdRef = useRef<THREE.MeshStandardMaterial>(null);
  const physRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [hovered, setHovered] = useState(false);

  useLayoutEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    if (!participatesInHitTest) {
      m.raycast = () => {};
    } else {
      m.raycast = THREE.Mesh.prototype.raycast.bind(m);
    }
  }, [participatesInHitTest]);

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
        level,
        muscleStage,
        injuryHighlight
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
      muscleStage,
      injuryHighlight,
    ]
  );

  const useMuscleMaps =
    muscleStageUsesFiberNormalMap(muscleStage) &&
    muscleNormalMap != null &&
    muscleRoughnessMap != null;

  const normalMul = muscleStageNormalScaleMul(muscleStage);
  const normalStdScaled = useMemo(
    () => new THREE.Vector2(MUSCLE_NORMAL_STD.x * normalMul, MUSCLE_NORMAL_STD.y * normalMul),
    [normalMul]
  );
  const normalPhysScaled = useMemo(
    () => new THREE.Vector2(MUSCLE_NORMAL_PHYS.x * normalMul, MUSCLE_NORMAL_PHYS.y * normalMul),
    [normalMul]
  );

  const inflationUniform = useMemo(() => ({ value: 0 }), []);
  const inflationEnabled = level > 20 && vertexInflationWeight > 0;

  useLayoutEffect(() => {
    if (!inflationEnabled) {
      inflationUniform.value = 0;
      return () => {
        const m = stdRef.current ?? physRef.current;
        clearMuscleVertexInflationPatch(m);
      };
    }
    let raf = 0;
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const m = stdRef.current ?? physRef.current;
        if (m) installMuscleVertexInflation(m, inflationUniform);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      const m = stdRef.current ?? physRef.current;
      clearMuscleVertexInflationPatch(m);
    };
  }, [inflationEnabled, inflationUniform, mp.useStandardMaterial, vertexInflationWeight]);

  useFrame(({ clock }) => {
    const g = Math.max(0, Math.min(1, growthLayerWeight));
    inflationUniform.value = inflationEnabled
      ? getMuscleVertexInflation(level, clock.elapsedTime) * vertexInflationWeight * g
      : 0;

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
      const injPulse = injuryHighlight ? 1 + 0.22 * Math.sin(clock.elapsedTime * 3.1) : 1;
      const pulse =
        (muscleStage === 'power' ? 1 + 0.08 * Math.sin(clock.elapsedTime * 2.12) : 1) * injPulse;
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity,
        mp.emissiveIntensity * pulse,
        0.12
      );
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
      const injPulse = injuryHighlight ? 1 + 0.22 * Math.sin(clock.elapsedTime * 3.1) : 1;
      const pulseP =
        (muscleStage === 'power' ? 1 + 0.085 * Math.sin(clock.elapsedTime * 2.12) : 1) * injPulse;
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity,
        mp.emissiveIntensity * pulseP,
        0.12
      );
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

  const interactive = !!area && !clinicalLocked && participatesInHitTest;
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;

  return (
    <group position={position} rotation={rot}>
      {injuryHighlight && area && (
        <pointLight
          color="#ff2200"
          intensity={1.15}
          distance={0.52}
          decay={2}
          position={[0, 0, 0.06]}
        />
      )}
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
            normalMap={useMuscleMaps ? muscleNormalMap ?? undefined : undefined}
            roughnessMap={useMuscleMaps ? muscleRoughnessMap ?? undefined : undefined}
            normalScale={useMuscleMaps ? normalStdScaled : undefined}
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
            normalMap={useMuscleMaps ? muscleNormalMap ?? undefined : undefined}
            roughnessMap={useMuscleMaps ? muscleRoughnessMap ?? undefined : undefined}
            normalScale={useMuscleMaps ? normalPhysScaled : undefined}
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
