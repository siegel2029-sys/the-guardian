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
  /** מוקד משני מטפל — כתום */
  clinicalSecondary?: boolean;
  selfCareSelected?: boolean;
  /** אזור חסום לפרהאב (מטפל/משני) — לסמן עכבר בפורטל בלבד */
  clinicalBlockSelfCare?: boolean;
  patientPortalInteractive?: boolean;
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
  /** הדגשת hover ממקטע צמוד (חזה↔גב עליון, בטן↔גב תחתון) — ללא שינוי אזור הלחיצה */
  extraHover?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  /** ללא לרפות scale/פולס — לחיצות יציבות */
  reduceMotion?: boolean;
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
  /** Always 0 — opaque medical matte (kept for uniform lerp / future use). */
  transmission: number;
  thickness: number;
  ior: number;
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
  const alt = (area.charCodeAt(0) + area.length) % 2 === 0;
  if (alt) return { color: '#4ade80', emissive: '#166534' };
  return { color: '#22c55e', emissive: '#14532d' };
}

/** Premium matte accent for high tier — no chrome / iridescence (clinical UI). */
function recoveredAccentMatte(): Pick<
  MatProps,
  'metalness' | 'roughness' | 'clearcoat' | 'clearcoatRoughness' | 'iridescence' | 'iridescenceIOR' | 'iridescenceThicknessRange' | 'envMapIntensity'
> {
  return {
    metalness: 0.12,
    roughness: 0.32,
    clearcoat: 0.3,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.62,
    iridescence: 0,
    iridescenceIOR: 1,
    iridescenceThicknessRange: [0, 0],
  };
}

/** Base body: opaque premium matte / plastic (high-end medical UI). */
function activeMatteTeal(): Pick<
  MatProps,
  | 'metalness'
  | 'roughness'
  | 'clearcoat'
  | 'clearcoatRoughness'
  | 'transmission'
  | 'thickness'
  | 'ior'
  | 'envMapIntensity'
  | 'iridescence'
  | 'iridescenceIOR'
  | 'iridescenceThicknessRange'
> {
  return {
    metalness: 0.1,
    roughness: 0.35,
    clearcoat: 0.22,
    clearcoatRoughness: 0.3,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
    envMapIntensity: 1.22,
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
  clinicalSecondary: boolean,
  selfCareSelected: boolean,
  strengthenedToday: boolean,
  isHovered: boolean,
  level: number,
  stage: MuscleEvolutionStage,
  injuryHighlight: boolean,
  patientPortalInteractive = false,
  /** תצוגת מטפל יציבה (תצוגה מקדימה של כאב) — זוהר עז יותר */
  reduceMotion = false
): MatProps {
  const tier = getLevelTier(level);
  const lf = Math.min(Math.max(level, 1), 100) / 100;
  const hoverK = patientPortalInteractive ? 0.11 : 0.06;
  const hv = isHovered ? hoverK : 0;
  const envAccent =
    clinicalLocked || clinicalSecondary || selfCareSelected ? 2.15 : 1.42;
  const volBoost = muscleStageVolumeBoost(stage);
  const glowX = muscleStageHealthyGlowExtra(stage);

  const strongPal =
    strengthenedToday && !isHighPain && selfCareSelected && area
      ? strongPalette(area)
      : null;

  const basePhysical = (
    partial: Partial<MatProps> & Pick<MatProps, 'color' | 'emissive' | 'emissiveIntensity' | 'targetScale'>
  ): MatProps => ({
    roughness: 0.35,
    metalness: 0.1,
    clearcoat: 0.22,
    clearcoatRoughness: 0.3,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
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
      color: '#E0F7FA',
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
    if (patientPortalInteractive) {
      return basePhysical({
        color: '#ff0505',
        emissive: '#380000',
        emissiveIntensity: 3.25 + hv * 1.35,
        targetScale: 1.09 + (isHovered ? 0.04 : 0),
        metalness: 0.14,
        roughness: 0.2,
        clearcoat: 0.4,
        clearcoatRoughness: 0.16,
        transmission: 0,
        thickness: 0,
        envMapIntensity: Math.max(envAccent, 2.55),
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
      });
    }
    if (reduceMotion) {
      return basePhysical({
        color: '#ff0303',
        emissive: '#500000',
        emissiveIntensity: 3.42 + hv * 1.32,
        targetScale: 1.065 + (isHovered ? 0.038 : 0),
        metalness: 0.12,
        roughness: 0.2,
        clearcoat: 0.4,
        clearcoatRoughness: 0.18,
        transmission: 0,
        thickness: 0,
        envMapIntensity: Math.max(envAccent, 2.72),
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
      });
    }
    return basePhysical({
      color: '#fecaca',
      emissive: '#dc2626',
      emissiveIntensity: 1.25 + hv * 0.85,
      targetScale: 1.04 + (isHovered ? 0.03 : 0),
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.24,
      clearcoatRoughness: 0.32,
      transmission: 0,
      thickness: 0,
      envMapIntensity: 1.48,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    });
  }

  if (clinicalSecondary) {
    if (reduceMotion && !patientPortalInteractive) {
      return basePhysical({
        color: '#ff7400',
        emissive: '#71320d',
        emissiveIntensity: 3.05 + hv * 1.22,
        targetScale: 1.055 + (isHovered ? 0.032 : 0) + volBoost,
        metalness: 0.11,
        roughness: 0.22,
        clearcoat: 0.38,
        clearcoatRoughness: 0.2,
        transmission: 0,
        thickness: 0,
        envMapIntensity: Math.max(envAccent, 2.45),
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
      });
    }
    return basePhysical({
      color: '#ff6a00',
      emissive: '#9a3412',
      emissiveIntensity: 1.42 + hv * 0.82,
      targetScale: 1.045 + (isHovered ? 0.028 : 0) + volBoost,
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.24,
      clearcoatRoughness: 0.3,
      transmission: 0,
      thickness: 0,
      envMapIntensity: Math.max(envAccent, 1.55),
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    });
  }

  if (clinicalLocked) {
    const accent = tier === 'recovered' ? recoveredAccentMatte() : activeMatteTeal();
    return basePhysical({
      color: '#dc2626',
      emissive: '#7f1d1d',
      emissiveIntensity: 1.35 + hv * 0.85 + glowX * 0.25,
      targetScale: 1.045 + (isHovered ? 0.025 : 0) + volBoost,
      ...accent,
      metalness: tier === 'recovered' ? accent.metalness : 0.1,
      roughness: tier === 'recovered' ? accent.roughness : 0.35,
      clearcoat: tier === 'recovered' ? accent.clearcoat : 0.24,
      clearcoatRoughness: tier === 'recovered' ? accent.clearcoatRoughness : 0.3,
      transmission: 0,
      thickness: 0,
      iridescence: 0,
      iridescenceIOR: 1,
      iridescenceThicknessRange: [0, 0],
    });
  }

  if (selfCareSelected) {
    if (strongPal) {
      return basePhysical({
        color: strongPal.color,
        emissive: strongPal.emissive,
        emissiveIntensity: 1.52 + hv * 0.95,
        targetScale: 1.08 + (isHovered ? 0.035 : 0) + volBoost,
        metalness: 0.1,
        roughness: 0.35,
        clearcoat: 0.26,
        clearcoatRoughness: 0.28,
        transmission: 0,
        thickness: 0,
        envMapIntensity: Math.max(envAccent, 1.75),
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
      });
    }
    const green = basePhysical({
      color: tier === 'injured' ? '#4ade80' : '#22c55e',
      emissive: '#15803d',
      emissiveIntensity: 1.45 + hv * 1.05 + glowX,
      targetScale: 1.08 + (isHovered ? 0.04 : 0) + volBoost,
      roughness: tier === 'injured' ? 0.4 : 0.35,
      metalness: 0.1,
      clearcoat: tier === 'injured' ? 0.2 : 0.24,
      clearcoatRoughness: 0.32,
      transmission: 0,
      thickness: 0,
      transparent: false,
      opacity: 1,
      depthWrite: true,
    });
    if (tier === 'recovered') {
      const c = recoveredAccentMatte();
      return basePhysical({
        ...green,
        metalness: c.metalness,
        roughness: c.roughness,
        clearcoat: c.clearcoat,
        clearcoatRoughness: c.clearcoatRoughness,
        transmission: 0,
        thickness: 0,
        envMapIntensity: c.envMapIntensity,
        iridescence: 0,
        iridescenceIOR: 1,
        iridescenceThicknessRange: [0, 0],
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
      roughness: 0.38,
      metalness: 0.1,
      clearcoat: 0.2,
      clearcoatRoughness: 0.34,
      transmission: 0,
      thickness: 0,
      targetScale: 1,
      envMapIntensity: 1.12,
    });
  }

  if (
    stage === 'post_injury' &&
    area &&
    !clinicalLocked &&
    !clinicalSecondary &&
    !selfCareSelected &&
    isActive
  ) {
    return basePhysical({
      color: isPrimary ? '#bae6fd' : '#94a3b8',
      emissive: '#0e7490',
      emissiveIntensity: 0.06 + hv * 0.45,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 0.18,
      clearcoatRoughness: 0.36,
      transmission: 0,
      thickness: 0,
      envMapIntensity: 0.72,
      targetScale:
        0.98 +
        (isPrimary ? 0.04 : 0.015) +
        (isHovered ? 0.03 : 0) +
        (isSelected ? 0.025 : 0),
    });
  }

  if (!isActive) {
    if (tier === 'injured') {
      return basePhysical({
        color: isHovered ? '#e2e8f0' : '#d8dee6',
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.42,
        metalness: 0.08,
        clearcoat: 0.12,
        clearcoatRoughness: 0.4,
        transmission: 0,
        thickness: 0,
        envMapIntensity: 0.35,
        targetScale: 1 + (isHovered ? 0.03 : 0),
      });
    }
    const m = activeMatteTeal();
    return basePhysical({
      color: isHovered ? '#c5eef6' : '#E0F7FA',
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
    return basePhysical({
      color: '#cfd8dc',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 0.14,
      clearcoatRoughness: 0.38,
      transmission: 0,
      thickness: 0,
      envMapIntensity: 0.4,
      targetScale:
        1 +
        (isPrimary ? 0.06 : 0.02) +
        (isHovered ? 0.05 : 0) +
        (isSelected ? 0.04 : 0),
    });
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

  const c = recoveredAccentMatte();
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
    transmission: 0,
    thickness: 0,
    iridescence: 0,
    iridescenceIOR: 1,
    iridescenceThicknessRange: [0, 0],
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
  clinicalSecondary = false,
  selfCareSelected = false,
  clinicalBlockSelfCare = false,
  patientPortalInteractive = false,
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
  extraHover = false,
  onHoverChange,
  reduceMotion = false,
  children,
}: MuscleSegmentProps) {
  void _xp;
  void _xn;
  void _st;

  const muscleStage = muscleStageProp ?? getMuscleEvolutionStage(level);

  const meshRef = useRef<THREE.Mesh>(null);
  const physRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const effectiveHovered = hovered || extraHover;

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
        clinicalSecondary,
        selfCareSelected,
        strengthenedToday,
        effectiveHovered,
        level,
        muscleStage,
        injuryHighlight,
        patientPortalInteractive,
        reduceMotion
      ),
    [
      area,
      isActive,
      isPrimary,
      isHighPain,
      isSelected,
      clinicalLocked,
      clinicalSecondary,
      selfCareSelected,
      strengthenedToday,
      effectiveHovered,
      level,
      muscleStage,
      injuryHighlight,
      patientPortalInteractive,
      reduceMotion,
    ]
  );

  const useMuscleMaps =
    muscleStageUsesFiberNormalMap(muscleStage) &&
    muscleNormalMap != null &&
    muscleRoughnessMap != null;

  const normalMul = muscleStageNormalScaleMul(muscleStage);
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
        clearMuscleVertexInflationPatch(physRef.current);
      };
    }
    let raf = 0;
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const m = physRef.current;
        if (m) installMuscleVertexInflation(m, inflationUniform);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      clearMuscleVertexInflationPatch(physRef.current);
    };
  }, [inflationEnabled, inflationUniform, vertexInflationWeight]);

  useFrame(({ clock }) => {
    const g = Math.max(0, Math.min(1, growthLayerWeight));
    inflationUniform.value = inflationEnabled
      ? getMuscleVertexInflation(level, clock.elapsedTime) * vertexInflationWeight * g
      : 0;

    const mesh = meshRef.current;
    if (!mesh) return;
    _sv.setScalar(mp.targetScale);
    const k = reduceMotion ? 1 : 0.12;
    mesh.scale.lerp(_sv, k);

    const mat = physRef.current;
    if (!mat) return;
    _tc.set(mp.color);
    _te.set(mp.emissive);
    mat.color.lerp(_tc, reduceMotion ? 1 : 0.15);
    mat.emissive.lerp(_te, reduceMotion ? 1 : 0.15);
    mat.roughness = THREE.MathUtils.lerp(mat.roughness, mp.roughness, k);
    mat.metalness = THREE.MathUtils.lerp(mat.metalness, mp.metalness, k);
    const injPulseP =
      reduceMotion ? 1 : injuryHighlight ? 1 + 0.22 * Math.sin(clock.elapsedTime * 3.1) : 1;
    const pulseP =
      (reduceMotion
        ? 1
        : muscleStage === 'power'
          ? 1 + 0.085 * Math.sin(clock.elapsedTime * 2.12)
          : 1) * injPulseP;
    mat.emissiveIntensity = THREE.MathUtils.lerp(
      mat.emissiveIntensity,
      mp.emissiveIntensity * pulseP,
      k
    );
    mat.clearcoat = THREE.MathUtils.lerp(mat.clearcoat, mp.clearcoat, reduceMotion ? 1 : 0.1);
    mat.clearcoatRoughness = THREE.MathUtils.lerp(
      mat.clearcoatRoughness,
      mp.clearcoatRoughness,
      reduceMotion ? 1 : 0.1
    );
    mat.envMapIntensity = THREE.MathUtils.lerp(
      mat.envMapIntensity,
      mp.envMapIntensity,
      reduceMotion ? 1 : 0.1
    );
    mat.transmission = THREE.MathUtils.lerp(mat.transmission, mp.transmission, reduceMotion ? 1 : 0.12);
    mat.thickness = THREE.MathUtils.lerp(mat.thickness, mp.thickness, reduceMotion ? 1 : 0.12);
    mat.ior = THREE.MathUtils.lerp(mat.ior, mp.ior, reduceMotion ? 1 : 0.12);
    mat.iridescence = THREE.MathUtils.lerp(mat.iridescence, mp.iridescence, reduceMotion ? 1 : 0.12);
    mat.iridescenceIOR = THREE.MathUtils.lerp(
      mat.iridescenceIOR,
      mp.iridescenceIOR,
      reduceMotion ? 1 : 0.12
    );
    const tr = mp.iridescenceThicknessRange;
    const cur = mat.iridescenceThicknessRange;
    cur[0] = THREE.MathUtils.lerp(cur[0], tr[0], reduceMotion ? 1 : 0.1);
    cur[1] = THREE.MathUtils.lerp(cur[1], tr[1], reduceMotion ? 1 : 0.1);
    mat.transparent = mp.transparent;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, mp.opacity, reduceMotion ? 1 : 0.14);
    mat.depthWrite = mp.depthWrite;
  });

  /** לחיצות מותרות גם באזור קליני — הפורטל מסנן ב־handleAvatar; המטפל מסנן לפי תרגילים */
  const interactive = !!area && participatesInHitTest && !!onAreaClick;
  const rot = rotation ? (rotation as unknown as THREE.Euler) : undefined;

  return (
    <group position={position} rotation={rot}>
      {injuryHighlight && area && (
        <pointLight
          color="#ff2200"
          intensity={
            patientPortalInteractive ? 1.42 : reduceMotion ? 2.08 : 1.15
          }
          distance={reduceMotion ? 0.62 : 0.52}
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
                onHoverChange?.(true);
                const blockCursor = patientPortalInteractive && clinicalBlockSelfCare;
                document.body.style.cursor = blockCursor ? 'not-allowed' : 'pointer';
              }
            : clinicalLocked && area
              ? (e) => {
                  e.stopPropagation();
                  setHovered(true);
                  onHoverChange?.(true);
                }
              : undefined
        }
        onPointerOut={
          interactive || (clinicalLocked && area)
            ? () => {
                setHovered(false);
                onHoverChange?.(false);
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
          ref={physRef}
          color={mp.color}
          emissive={mp.emissive}
          emissiveIntensity={mp.emissiveIntensity}
          roughness={mp.roughness}
          metalness={mp.metalness}
          clearcoat={mp.clearcoat}
          clearcoatRoughness={mp.clearcoatRoughness}
          transmission={mp.transmission}
          thickness={mp.thickness}
          ior={mp.ior}
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

        {children}
      </mesh>

      {hovered && area && !patientPortalInteractive && (
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
