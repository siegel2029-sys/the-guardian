import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useGraph } from '@react-three/fiber';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { AnimationAction, Group, Object3D, SkinnedMesh } from 'three';
import { LoopRepeat, MathUtils } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { ComponentProps } from 'react';

/** Served from `public/models/`; respects Vite `base` for subpath deploys. */
export const GORDIE_MODEL_DEFAULT_URL = `${import.meta.env.BASE_URL}models/gordy_rigged.glb.glb`;

/**
 * GLB armature uses scale 0.01 (Mixamo/Blender units → meters). Without this, the mesh is
 * ~2% of a unit tall while the camera sits several units away — effectively invisible.
 */
const MODEL_DISPLAY_SCALE = 55;

export type GordieModelHandle = {
  celebrate: () => void;
};

type Props = {
  url?: string;
  /**
   * GLTF clip name (exact) or substring to match (case-insensitive), e.g. `Wave`, `Exercise1`.
   * Mixamo exports often look like `Armature|mixamo.com|Layer0` — a short name still matches by substring.
   */
  animationName?: string;
  /** Blend duration when switching clips (seconds). */
  crossfade?: number;
} & ComponentProps<'group'>;

function pickAnimationKey(
  actions: Record<string, AnimationAction | null | undefined>,
  animationName?: string,
): string | undefined {
  const keys = Object.keys(actions).filter((k) => actions[k] != null);
  if (keys.length === 0) return undefined;
  if (!animationName?.trim()) return keys[0];
  const raw = animationName.trim();
  if (actions[raw]) return raw;
  const q = raw.toLowerCase().replace(/\s+/g, '');
  const byIncludes = keys.find((k) => {
    const kl = k.toLowerCase().replace(/\s+/g, '');
    return (
      kl.includes(q) ||
      k.split('|').some((seg) => seg.toLowerCase().replace(/\s+/g, '').includes(q))
    );
  });
  return byIncludes ?? keys[0];
}

function isSkinnedMesh(o: unknown): o is SkinnedMesh {
  return !!o && (o as SkinnedMesh).isSkinnedMesh === true;
}

function pickSkinned(
  nodes: Record<string, Object3D>,
  ...names: string[]
): SkinnedMesh | undefined {
  for (const name of names) {
    const n = nodes[name];
    if (isSkinnedMesh(n)) return n;
  }
  return undefined;
}

function pickHipsBone(nodes: Record<string, Object3D>): Object3D | undefined {
  const direct = nodes.mixamorigHips;
  if (direct) return direct;
  return Object.values(nodes).find(
    (o) => o && o.type === 'Bone' && /hips/i.test(o.name),
  );
}

/** Transparent teal / blue hologram with emissive glow (tone-mapped off reads brighter). */
function TealHologramMaterial() {
  return (
    <meshStandardMaterial
      color="#2dd4e8"
      emissive="#0891b2"
      emissiveIntensity={1.85}
      transparent
      opacity={0.72}
      roughness={0.22}
      metalness={0.08}
      depthWrite={false}
      toneMapped={false}
    />
  );
}

function SolidRedMaterial() {
  return (
    <meshStandardMaterial
      color="#c41e1e"
      roughness={0.42}
      metalness={0.12}
    />
  );
}

/**
 * Rigged Gordie from GLB: `mixamorigHips` drives the skeleton; body / cape / shield are separate
 * skinned meshes when the asset provides them. Current `gordy_rigged.glb.glb` ships a single merged
 * `model` mesh — re-export from Blender with meshes named Body, Cape, and Shield to get split materials.
 */
const GordieModel = forwardRef<GordieModelHandle, Props>(function GordieModel(
  {
    url = GORDIE_MODEL_DEFAULT_URL,
    animationName,
    crossfade = 0.4,
    ...groupProps
  },
  ref,
) {
  const root = useRef<Group>(null);
  const celebrateUntil = useRef(0);

  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as { nodes: Record<string, Object3D> };

  const { actions } = useAnimations(animations, root);

  const hips = pickHipsBone(nodes);
  const explicitBody = pickSkinned(nodes, 'Body');
  const mergedModel = pickSkinned(nodes, 'model');
  const cape = pickSkinned(nodes, 'Cape');
  const shield = pickSkinned(nodes, 'Shield', 'Logo', 'ChestLogo', 'Chest_Shield');

  const bodySkin = explicitBody ?? mergedModel;

  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    const key = pickAnimationKey(actions, animationName);
    const next = key ? actions[key] : undefined;
    const fade = crossfade;
    (Object.entries(actions) as [string, AnimationAction | null | undefined][]).forEach(
      ([k, a]) => {
        if (a && k !== key) a.fadeOut(fade);
      },
    );
    if (next) {
      next.reset();
      next.setLoop(LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.fadeIn(fade).play();
    }
    return () => {
      next?.fadeOut(fade);
    };
  }, [actions, animationName, crossfade]);

  useImperativeHandle(ref, () => ({
    celebrate: () => {
      celebrateUntil.current = performance.now() + 900;
    },
  }));

  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const t = performance.now();
    const active = t < celebrateUntil.current;
    const target = active ? 1.12 : 1;
    const k = 1 - Math.exp(-delta * 10);
    const s = MathUtils.lerp(g.scale.x, target, k);
    g.scale.setScalar(s);
  });

  if (!isSkinnedMesh(bodySkin) || !hips) {
    return (
      <group ref={root} {...groupProps} dispose={null}>
        <group scale={MODEL_DISPLAY_SCALE}>
          <primitive object={clone} />
        </group>
      </group>
    );
  }

  return (
    <group ref={root} {...groupProps} dispose={null}>
      <group name="Scene" scale={MODEL_DISPLAY_SCALE}>
        <group name="Armature" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
          <primitive object={hips} />
          <skinnedMesh
            name={bodySkin.name}
            geometry={bodySkin.geometry}
            skeleton={bodySkin.skeleton}
            morphTargetDictionary={bodySkin.morphTargetDictionary}
            morphTargetInfluences={bodySkin.morphTargetInfluences}
          >
            <TealHologramMaterial />
          </skinnedMesh>
          {cape && (
            <skinnedMesh
              name="Cape"
              geometry={cape.geometry}
              skeleton={cape.skeleton}
              morphTargetDictionary={cape.morphTargetDictionary}
              morphTargetInfluences={cape.morphTargetInfluences}
            >
              <SolidRedMaterial />
            </skinnedMesh>
          )}
          {shield && (
            <skinnedMesh
              name="Shield"
              geometry={shield.geometry}
              skeleton={shield.skeleton}
              morphTargetDictionary={shield.morphTargetDictionary}
              morphTargetInfluences={shield.morphTargetInfluences}
            >
              <SolidRedMaterial />
            </skinnedMesh>
          )}
        </group>
      </group>
    </group>
  );
});

export default GordieModel;

useGLTF.preload(GORDIE_MODEL_DEFAULT_URL);
