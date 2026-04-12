import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

export type GordyPrimitiveHandle = {
  celebrate: () => void;
};

type Props = {
  floatHeight?: number;
  bobAmplitude?: number;
  bobSpeed?: number;
  therapistAlert?: boolean;
};

const BODY_COLOR = '#5cdbef';
const EMISSIVE_ALERT = '#ef4444';
const HEART_COLOR = '#ef4444';
const ALERT_SKIN_TINT = new THREE.Color('#fecdd3');
const NEON_EMISSIVE_A = new THREE.Color('#00b4d8');
const NEON_EMISSIVE_B = new THREE.Color('#90f0ff');
const EYE_EMISSIVE_A = new THREE.Color('#22d3ee');
const EYE_EMISSIVE_B = new THREE.Color('#cffafe');

const CELEBRATE_DUR = 1.05;
const ANT_END = 0.12;
const AIR_END = 0.72;

const GordyPrimitive = forwardRef<GordyPrimitiveHandle, Props>(function GordyPrimitive(
  { floatHeight = 0, bobAmplitude = 0.06, bobSpeed = 1.15, therapistAlert = false },
  ref,
) {
  const rootRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const triggerCelebrate = useRef(false);
  const celebrationStart = useRef<number | null>(null);

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: BODY_COLOR,
        transparent: true,
        opacity: 0.56,
        roughness: 0.07,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1,
        emissive: NEON_EMISSIVE_B.clone(),
        emissiveIntensity: 0.52,
        transmission: 0.5,
        thickness: 0.52,
        ior: 1.52,
        side: THREE.FrontSide,
      }),
    [],
  );

  const eyeMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0369a1',
        emissive: EYE_EMISSIVE_B.clone(),
        emissiveIntensity: 2.95,
        roughness: 0.05,
        metalness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
      }),
    [],
  );

  const faceLineMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0c4a6e',
        emissive: '#164e63',
        emissiveIntensity: 0.15,
        roughness: 0.35,
        metalness: 0,
      }),
    [],
  );

  const blushMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#fda4af',
        emissive: '#fb7185',
        emissiveIntensity: 0.12,
        roughness: 0.4,
        transparent: true,
        opacity: 0.75,
      }),
    [],
  );

  const capeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        emissive: '#450a0a',
        emissiveIntensity: 0.12,
        roughness: 0.55,
        metalness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  const capePivotRef = useRef<THREE.Group>(null);

  useEffect(() => {
    return () => {
      bodyMaterial.dispose();
      eyeMaterial.dispose();
      faceLineMaterial.dispose();
      blushMaterial.dispose();
      capeMaterial.dispose();
    };
  }, [bodyMaterial, eyeMaterial, faceLineMaterial, blushMaterial, capeMaterial]);

  useImperativeHandle(ref, () => ({
    celebrate: () => {
      triggerCelebrate.current = true;
    },
  }));

  useFrame((state) => {
    const root = rootRef.current;
    if (!root) return;

    const t = state.clock.elapsedTime;

    if (capePivotRef.current) {
      capePivotRef.current.rotation.y = Math.sin(t * 1.35) * 0.07;
      capePivotRef.current.rotation.x = 0.1 + Math.sin(t * 1.1) * 0.025;
    }

    const calmPulse = 0.5 + 0.5 * Math.sin(t * 2.35);
    const neonPulse = 0.5 + 0.5 * Math.sin(t * 2.85 + 0.4);
    const alertPulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    if (therapistAlert) {
      bodyMaterial.color.set(BODY_COLOR).lerp(ALERT_SKIN_TINT, 0.16 + alertPulse * 0.1);
      bodyMaterial.emissive.set(EMISSIVE_ALERT);
      bodyMaterial.emissiveIntensity = 0.42 + alertPulse * 0.55;
    } else {
      bodyMaterial.color.set(BODY_COLOR);
      bodyMaterial.emissive.copy(NEON_EMISSIVE_A).lerp(NEON_EMISSIVE_B, 0.2 + neonPulse * 0.75);
      bodyMaterial.emissiveIntensity = 0.38 + calmPulse * 0.52 + neonPulse * 0.15;
    }

    const eyePulse = 0.5 + 0.5 * Math.sin(t * 3.15 + 0.6);
    eyeMaterial.emissive.copy(EYE_EMISSIVE_A).lerp(EYE_EMISSIVE_B, 0.35 + eyePulse * 0.55);
    eyeMaterial.emissiveIntensity = 2.75 + eyePulse * 1.85;

    if (triggerCelebrate.current) {
      triggerCelebrate.current = false;
      celebrationStart.current = t;
    }

    const start = celebrationStart.current;
    const sinBob = Math.sin(t * bobSpeed) * bobAmplitude;

    if (start != null) {
      const elapsed = t - start;
      if (elapsed >= CELEBRATE_DUR) {
        celebrationStart.current = null;
        root.rotation.y = 0;
        root.position.y = floatHeight + sinBob;
        const breath = 1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.3));
        root.scale.setScalar(breath);
        return;
      }

      const u = elapsed / CELEBRATE_DUR;

      if (u < ANT_END) {
        const k = u / ANT_END;
        const ease = k * k;
        root.scale.y = 1 - 0.32 * ease;
        const sxz = 1 + 0.12 * ease;
        root.scale.x = sxz;
        root.scale.z = sxz;
        root.rotation.y = 0;
        root.position.y = floatHeight + sinBob * 0.25 - 0.055 * ease;
      } else if (u < AIR_END) {
        const k = (u - ANT_END) / (AIR_END - ANT_END);
        const jump = Math.sin(k * Math.PI) * 0.5;
        root.rotation.y = k * Math.PI * 2;
        const arc = Math.sin(k * Math.PI);
        root.scale.y = THREE.MathUtils.lerp(0.68, 1, k) + 0.22 * arc;
        const sxz = THREE.MathUtils.lerp(1.12, 1, k) - 0.08 * arc;
        root.scale.x = sxz;
        root.scale.z = sxz;
        root.position.y = floatHeight + jump + sinBob * 0.28;
      } else {
        const k = (u - AIR_END) / (1 - AIR_END);
        const settle = 1 - Math.pow(1 - k, 2);
        root.rotation.y = THREE.MathUtils.lerp(Math.PI * 2, 0, settle);
        const yEndAir = floatHeight + sinBob * 0.28;
        root.position.y = THREE.MathUtils.lerp(yEndAir, floatHeight + sinBob, settle);
        root.scale.set(1, 1, 1);
      }
      return;
    }

    root.position.y = floatHeight + sinBob;
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, 0, 0.08);
    const breath = 1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.3));
    root.scale.setScalar(breath);

    const breathPhase = t * 2.05;
    if (torsoRef.current) {
      const g = torsoRef.current;
      g.rotation.x = Math.sin(breathPhase) * 0.038;
      g.rotation.z = Math.sin(breathPhase * 0.92 + 1.1) * 0.022;
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 0.4 + Math.sin(breathPhase + 0.45) * 0.055;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -0.4 + Math.sin(breathPhase + 0.45) * -0.055;
    }
  });

  return (
    <group ref={rootRef}>
      <group ref={capePivotRef} position={[0, 0.02, -0.2]}>
        <mesh rotation={[0.12, 0, 0]} material={capeMaterial} renderOrder={-2}>
          <planeGeometry args={[0.44, 0.52, 1, 1]} />
        </mesh>
      </group>

      <group ref={torsoRef}>
        <RoundedBox
          args={[0.54, 0.5, 0.32]}
          radius={0.09}
          smoothness={4}
          position={[0, 0, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={bodyMaterial} attach="material" />
        </RoundedBox>

        <mesh position={[0, 0.08, 0.168]}>
          <sphereGeometry args={[0.048, 12, 12]} />
          <meshPhysicalMaterial
            color={HEART_COLOR}
            emissive="#fca5a5"
            emissiveIntensity={0.35}
            roughness={0.25}
            clearcoat={0.9}
            clearcoatRoughness={0.12}
          />
        </mesh>

        <mesh position={[0, 0.48, 0]} castShadow>
          <sphereGeometry args={[0.27, 36, 32]} />
          <primitive object={bodyMaterial} attach="material" />
        </mesh>

        <mesh position={[-0.08, 0.46, 0.22]} material={eyeMaterial} castShadow>
          <sphereGeometry args={[0.048, 16, 16]} />
        </mesh>
        <mesh position={[0.08, 0.46, 0.22]} material={eyeMaterial} castShadow>
          <sphereGeometry args={[0.048, 16, 16]} />
        </mesh>

        <mesh position={[-0.065, 0.468, 0.242]}>
          <sphereGeometry args={[0.013, 8, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0.095, 0.468, 0.242]}>
          <sphereGeometry args={[0.013, 8, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>

        <mesh position={[-0.11, 0.4, 0.21]} material={blushMaterial}>
          <sphereGeometry args={[0.022, 8, 8]} />
        </mesh>
        <mesh position={[0.11, 0.4, 0.21]} material={blushMaterial}>
          <sphereGeometry args={[0.022, 8, 8]} />
        </mesh>

        <mesh position={[-0.07, 0.52, 0.2]} rotation={[0, 0, 0.35]} material={faceLineMaterial}>
          <capsuleGeometry args={[0.012, 0.055, 4, 8]} />
        </mesh>
        <mesh position={[0.07, 0.52, 0.2]} rotation={[0, 0, -0.35]} material={faceLineMaterial}>
          <capsuleGeometry args={[0.012, 0.055, 4, 8]} />
        </mesh>

        <mesh position={[0, 0.36, 0.23]} rotation={[0.25, 0, 0]} material={faceLineMaterial}>
          <capsuleGeometry args={[0.008, 0.09, 4, 8]} />
        </mesh>

        <group ref={leftArmRef} position={[-0.29, 0.12, 0]} rotation={[0, 0, 0.4]}>
          <mesh position={[0.1, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.072, 0.12, 6, 12]} />
          </mesh>
          <mesh position={[0.2, -0.12, 0.02]} rotation={[0, 0.12, Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.058, 0.1, 5, 10]} />
          </mesh>
          <mesh position={[0.28, -0.2, 0.03]} rotation={[0, 0.2, Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.048, 0.055, 4, 8]} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.29, 0.12, 0]} rotation={[0, 0, -0.4]}>
          <mesh position={[-0.1, -0.02, 0]} rotation={[0, 0, -Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.072, 0.12, 6, 12]} />
          </mesh>
          <mesh position={[-0.2, -0.12, 0.02]} rotation={[0, -0.12, -Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.058, 0.1, 5, 10]} />
          </mesh>
          <mesh position={[-0.28, -0.2, 0.03]} rotation={[0, -0.2, -Math.PI / 2]} material={bodyMaterial} castShadow>
            <capsuleGeometry args={[0.048, 0.055, 4, 8]} />
          </mesh>
        </group>
      </group>

      <group position={[0, -0.26, 0]}>
        <mesh position={[-0.11, -0.12, 0]} material={bodyMaterial} castShadow>
          <capsuleGeometry args={[0.078, 0.12, 6, 12]} />
        </mesh>
        <mesh position={[0.11, -0.12, 0]} material={bodyMaterial} castShadow>
          <capsuleGeometry args={[0.078, 0.12, 6, 12]} />
        </mesh>
        <mesh position={[-0.11, -0.26, 0.04]} material={bodyMaterial} castShadow>
          <capsuleGeometry args={[0.065, 0.08, 5, 10]} />
        </mesh>
        <mesh position={[0.11, -0.26, 0.04]} material={bodyMaterial} castShadow>
          <capsuleGeometry args={[0.065, 0.08, 5, 10]} />
        </mesh>
      </group>
    </group>
  );
});

export default GordyPrimitive;
