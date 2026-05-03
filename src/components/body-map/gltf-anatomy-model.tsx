import {
  useRef,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  Component,
  type ReactNode,
} from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyArea } from '../../types';
import type { GranularPickKey } from '../../body/bodyPickMapping';
import {
  pickKeyToBodyArea,
  isGranularPickKey,
  GRANULAR_PICK_LABELS,
  mixamoBoneNameToPickKey,
} from '../../body/bodyPickMapping';
import {
  getPickKeyFromSkinnedHit,
  getSkinnedHitDebug,
  meshNameToDefaultPickKey,
} from '../../utils/skinnedPickHit';
import {
  createCeramicHighlightMaterial,
  setPickHighlightBones,
} from './skinningHighlightMaterial';
import { GLTF_ANATOMY_URLS } from './gltf-anatomy-sources';
import FallbackHumanoidPick from './FallbackHumanoidPick';
import { avatarMeshCounterRotation } from './avatarPostureCorrection';

export interface GltfAnatomyModelProps {
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  painByArea: Partial<Record<BodyArea, number>>;
  level: number;
  selectedArea?: BodyArea | null;
  onAreaClick?: (area: BodyArea) => void;
  clinicalArea?: BodyArea;
  selectedPickKeys?: GranularPickKey[];
  onPickKey?: (key: GranularPickKey) => void;
  fullBodyInteractive?: boolean;
}

const CERAMIC = {
  color: '#c5dbe8',
  roughness: 0.82,
  metalness: 0.04,
  clearcoat: 0.22,
  clearcoatRoughness: 0.38,
  envMapIntensity: 0.85,
};

function isPickableSkinnedMesh(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  if (!(obj instanceof THREE.SkinnedMesh)) return false;
  const g = obj.geometry as THREE.BufferGeometry;
  if (!g.getAttribute('skinIndex')) return false;
  if (obj.name === 'vanguard_Mesh' || obj.name === 'vanguard_visor') return true;
  return (obj.skeleton?.bones?.length ?? 0) >= 12;
}

function buildKeyToBoneIndices(mesh: THREE.SkinnedMesh): Map<GranularPickKey, number[]> {
  const m = new Map<GranularPickKey, number[]>();
  mesh.skeleton.bones.forEach((bone, i) => {
    const k = mixamoBoneNameToPickKey(bone.name);
    if (!k) return;
    const arr = m.get(k) ?? [];
    arr.push(i);
    m.set(k, arr);
  });
  return m;
}

function collectBoneIndicesForKeys(
  keyMap: Map<GranularPickKey, number[]>,
  keys: GranularPickKey[],
  max: number
): number[] {
  const out: number[] = [];
  for (const key of keys) {
    const arr = keyMap.get(key);
    if (!arr) continue;
    for (const idx of arr) {
      if (out.length >= max) return out;
      if (!out.includes(idx)) out.push(idx);
    }
  }
  return out;
}

function collectClinicalBoneIndices(
  keyMap: Map<GranularPickKey, number[]>,
  clinicalBodyArea: BodyArea | undefined,
  max: number
): number[] {
  if (!clinicalBodyArea) return [];
  const keys: GranularPickKey[] = [];
  keyMap.forEach((_idxs, key) => {
    if (pickKeyToBodyArea(key) === clinicalBodyArea) keys.push(key);
  });
  return collectBoneIndicesForKeys(keyMap, keys, max);
}

class GltfUrlErrorBoundary extends Component<
  { children: ReactNode; onFailedUrl: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    if (import.meta.env.DEV) {
      console.warn('[GltfAnatomyModel] GLTF failed:', err?.message ?? err);
    }
    queueMicrotask(() => this.props.onFailedUrl());
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

for (const u of GLTF_ANATOMY_URLS) {
  useGLTF.preload(u);
}

interface CoreProps extends GltfAnatomyModelProps {
  modelUrl: string;
}

function GltfAnatomyModelCore({
  activeAreas,
  primaryArea: _primaryArea,
  painByArea: _painByArea,
  level: _level,
  selectedArea: _selectedArea,
  onAreaClick,
  clinicalArea,
  selectedPickKeys = [],
  onPickKey,
  fullBodyInteractive = false,
  modelUrl,
}: CoreProps) {
  void _selectedArea;
  void _primaryArea;
  void _painByArea;
  void _level;

  const { scene } = useGLTF(modelUrl);
  const { camera, gl } = useThree();
  const rootRef = useRef<THREE.Group>(null);
  const clinicalLightRef = useRef<THREE.PointLight>(null);
  const skinnedRefs = useRef<{ mesh: THREE.SkinnedMesh; mat: THREE.MeshPhysicalMaterial }[]>([]);
  const pickableMeshesRef = useRef<THREE.SkinnedMesh[]>([]);
  const keyToBonesRef = useRef<Map<GranularPickKey, number[]>>(new Map());

  const [hoverKey, setHoverKey] = useState<GranularPickKey | null>(null);

  const clinicalZone = clinicalArea;

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    skinnedRefs.current = [];
    pickableMeshesRef.current = [];
    keyToBonesRef.current = new Map();

    let primaryForKeys: THREE.SkinnedMesh | null = null;

    c.traverse((obj) => {
      if (!isPickableSkinnedMesh(obj)) return;

      const mat = createCeramicHighlightMaterial(CERAMIC);
      obj.material = mat;
      obj.castShadow = true;
      obj.receiveShadow = true;
      skinnedRefs.current.push({ mesh: obj, mat });
      pickableMeshesRef.current.push(obj);

      if (obj.name === 'vanguard_Mesh') primaryForKeys = obj;
      else if (!primaryForKeys) primaryForKeys = obj;
    });

    if (primaryForKeys) {
      keyToBonesRef.current = buildKeyToBoneIndices(primaryForKeys);
    }

    return c;
  }, [scene]);

  useLayoutEffect(() => {
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetH = 1.68;
    const s = targetH / Math.max(size.y, 0.001);
    cloned.scale.setScalar(s);
    cloned.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(cloned);
    cloned.position.set(0, 0, 0);
    cloned.position.y = -box2.min.y;
    cloned.position.x = -(box2.min.x + box2.max.x) / 2;
    cloned.position.z = -(box2.min.z + box2.max.z) / 2;
    cloned.rotation.y = Math.PI;
  }, [cloned]);

  const resolvePickKey = useCallback(
    (mesh: THREE.SkinnedMesh, hit: THREE.Intersection): GranularPickKey | null => {
      const fromSkin = getPickKeyFromSkinnedHit(mesh, hit);
      if (fromSkin) return fromSkin;
      return meshNameToDefaultPickKey(mesh.name);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const o = e.object;
      if (!(o instanceof THREE.SkinnedMesh) || !pickableMeshesRef.current.includes(o)) {
        setHoverKey(null);
        return;
      }
      const hit = e.intersections.find((h) => h.object === o);
      if (!hit) {
        setHoverKey(null);
        return;
      }
      setHoverKey(resolvePickKey(o, hit));
    },
    [resolvePickKey]
  );

  const handlePointerOut = useCallback(() => {
    setHoverKey(null);
    document.body.style.cursor = '';
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const o = e.object;
      if (!(o instanceof THREE.SkinnedMesh) || !pickableMeshesRef.current.includes(o)) {
        return;
      }
      const hit = e.intersections.find((h) => h.object === o);
      if (!hit) return;

      const dbg = getSkinnedHitDebug(o, hit);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(e.pointer, camera);
      const directHits = rc.intersectObjects(pickableMeshesRef.current, false);

      if (import.meta.env.DEV) {
        console.log('[Guardian BodyMap] pick', {
          gltfMeshName: dbg.meshName,
          dominantBone: dbg.dominantBoneName,
          boneIndex: dbg.dominantBoneIndex,
          mappedPart: dbg.pickKey ? GRANULAR_PICK_LABELS[dbg.pickKey] : null,
          pickKey: dbg.pickKey,
          raycasterHits: directHits.map((h) => ({
            mesh: (h.object as THREE.Mesh).name,
            distance: h.distance.toFixed(3),
          })),
        });
      } else {
        console.log(
          '[Guardian BodyMap] pick',
          `mesh=${dbg.meshName}`,
          `bone=${dbg.dominantBoneName}`,
          `key=${dbg.pickKey ?? '—'}`
        );
      }

      let key = resolvePickKey(o, hit);
      if (!key) return;
      if (o.name === 'vanguard_visor' && !getPickKeyFromSkinnedHit(o, hit)) {
        key = 'cranium';
      }
      if (onPickKey) {
        onPickKey(key);
        return;
      }
      const area = pickKeyToBodyArea(key);
      const isClinicalHit = clinicalZone != null && area === clinicalZone;
      const inPlan = activeAreas.includes(area);
      if (fullBodyInteractive || inPlan || isClinicalHit) {
        onAreaClick?.(area);
      }
    },
    [resolvePickKey, onPickKey, onAreaClick, clinicalZone, activeAreas, fullBodyInteractive, camera]
  );

  useFrame(() => {
    const keyMap = keyToBonesRef.current;
    const selfKeys = selectedPickKeys.filter(isGranularPickKey);
    const selfIdx = collectBoneIndicesForKeys(keyMap, selfKeys, 24);
    const clinIdx = collectClinicalBoneIndices(keyMap, clinicalZone, 24);
    let hoverIdx = -1;
    if (hoverKey) {
      hoverIdx = keyMap.get(hoverKey)?.[0] ?? -1;
    }

    for (const { mat } of skinnedRefs.current) {
      setPickHighlightBones(mat, selfIdx, clinIdx, hoverIdx);
    }
  });

  useFrame(({ clock }) => {
    if (!clinicalLightRef.current || !clinicalZone) return;
    clinicalLightRef.current.intensity = 0.85 + Math.sin(clock.elapsedTime * 2.4) * 0.35;
  });

  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const prev = canvas.style.display;
    canvas.style.display = 'block';
    return () => {
      canvas.style.display = prev;
    };
  }, [gl]);

  const glowPos: [number, number, number] = [0, 1.0, 0.12];

  return (
    <group ref={rootRef}>
      <group rotation={avatarMeshCounterRotation}>
        <primitive
          object={cloned}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
          }}
        />
      </group>

      {clinicalZone && (
        <pointLight
          ref={clinicalLightRef}
          position={[glowPos[0], glowPos[1], glowPos[2] + 0.15]}
          color="#fecaca"
          intensity={1.1}
          distance={1.2}
          decay={2}
        />
      )}
    </group>
  );
}

export default function GltfAnatomyModel(props: GltfAnatomyModelProps) {
  const [urlIndex, setUrlIndex] = useState(0);
  const [loadDead, setLoadDead] = useState(false);
  const last = GLTF_ANATOMY_URLS.length - 1;
  const modelUrl = GLTF_ANATOMY_URLS[Math.min(urlIndex, last)];

  if (loadDead) {
    return <FallbackHumanoidPick {...props} />;
  }

  return (
    <GltfUrlErrorBoundary
      key={modelUrl}
      onFailedUrl={() => {
        if (urlIndex < last) {
          setUrlIndex((i) => i + 1);
        } else {
          setLoadDead(true);
        }
      }}
    >
      <GltfAnatomyModelCore {...props} modelUrl={modelUrl} />
    </GltfUrlErrorBoundary>
  );
}
