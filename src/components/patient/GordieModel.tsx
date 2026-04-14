import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useGraph } from '@react-three/fiber';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { AnimationAction, Group, Object3D, SkinnedMesh, Skeleton } from 'three';
import { LoopRepeat, MathUtils, Quaternion, Vector3 } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { ComponentProps } from 'react';

/** Served from `public/models/`; respects Vite `base` for subpath deploys. */
export const GUARDIE_MODEL_DEFAULT_URL = `${import.meta.env.BASE_URL}models/guardi_rigged.glb.glb`;

/**
 * GLB armature uses scale 0.01 (Mixamo/Blender units → meters). Without this, the mesh is
 * ~2% of a unit tall while the camera sits several units away — effectively invisible.
 * Higher values fill the viewport for portrait-style hero framing (see GuardieCanvas camera).
 */
const MODEL_DISPLAY_SCALE = 82;

export type GuardieModelHandle = {
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
  /** Multiplies the built-in unit fix scale (e.g. 5 for a large bottom-corner companion). */
  displayScaleFactor?: number;
  /**
   * When the GLB has no facial clips, nudge the armature for a slumped / downcast read (pairs with “sad” mood).
   */
  poseVariant?: 'default' | 'sad';
  /** Cartoon eyes (merged mesh cannot get per-UV eye tint without a new asset). */
  stylizedEyes?: boolean;
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

function StylizedEyesFollowHead({ skeleton }: { skeleton: Skeleton }) {
  const head = useMemo(
    () =>
      skeleton.bones.find(
        (b) =>
          /^mixamorigHead$/i.test(b.name) ||
          (/^head$/i.test(b.name) && !/neck/i.test(b.name)),
      ),
    [skeleton],
  );
  const g = useRef<Group>(null);
  const wp = useMemo(() => new Vector3(), []);
  const wq = useMemo(() => new Quaternion(), []);
  const ws = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const group = g.current;
    if (!group || !head) return;
    head.updateWorldMatrix(true, true);
    head.matrixWorld.decompose(wp, wq, ws);
    const parent = group.parent;
    if (parent) parent.worldToLocal(wp);
    group.position.copy(wp);
    group.quaternion.copy(wq);
  });

  if (!head) return null;

  return (
    <group ref={g}>
      <group position={[0.036, 0.055, 0.102]}>
        <mesh scale={0.021}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.35}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-1}
          />
        </mesh>
        <mesh position={[0, 0, 0.017]} scale={0.01}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color="#0a0a0a"
            roughness={0.45}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>
      <group position={[-0.036, 0.055, 0.102]}>
        <mesh scale={0.021}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.35}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-1}
          />
        </mesh>
        <mesh position={[0, 0, 0.017]} scale={0.01}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color="#0a0a0a"
            roughness={0.45}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>
    </group>
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

function CapeRedMaterial() {
  return (
    <meshStandardMaterial
      color="#dc2626"
      roughness={0.4}
      metalness={0.1}
    />
  );
}

/**
 * Rigged Guardie (3D mentor rig) from GLB: `mixamorigHips` drives the skeleton; body / cape / shield are separate
 * skinned meshes when the asset provides them. Current `guardi_rigged.glb.glb` ships a single merged
 * `model` mesh — re-export from Blender with meshes named Body, Cape, and Shield to get split materials.
 */
const GuardieModel = forwardRef<GuardieModelHandle, Props>(function GuardieModel(
  {
    url = GUARDIE_MODEL_DEFAULT_URL,
    animationName,
    crossfade = 0.4,
    displayScaleFactor = 1,
    poseVariant = 'default',
    stylizedEyes = false,
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
  const mergedModel = pickSkinned(nodes, 'model', 'modelmesh');
  const cape = pickSkinned(nodes, 'Cape');
  const shield = pickSkinned(nodes, 'Shield', 'Logo', 'ChestLogo', 'Chest_Shield');

  const bodySkin = explicitBody ?? mergedModel;

  const sceneScale = MODEL_DISPLAY_SCALE * displayScaleFactor;
  const armatureRotation: [number, number, number] =
    poseVariant === 'sad'
      ? [Math.PI / 2 + 0.11, 0.03, -0.09]
      : [Math.PI / 2, 0, 0];

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
      <group {...groupProps} dispose={null}>
        <group ref={root}>
          <group scale={sceneScale} rotation={poseVariant === 'sad' ? [0.12, -0.06, 0] : [0, 0, 0]}>
            <primitive object={clone} />
          </group>
        </group>
      </group>
    );
  }

  return (
    <group {...groupProps} dispose={null}>
      <group ref={root}>
        <group name="Scene" scale={sceneScale}>
        <group name="Armature" rotation={armatureRotation} scale={0.01}>
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
              <CapeRedMaterial />
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
              <CapeRedMaterial />
            </skinnedMesh>
          )}
        </group>
        {stylizedEyes && <StylizedEyesFollowHead skeleton={bodySkin.skeleton} />}
        </group>
      </group>
    </group>
  );
});

export default GuardieModel;

useGLTF.preload(GUARDIE_MODEL_DEFAULT_URL);
