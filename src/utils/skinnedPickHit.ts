import * as THREE from 'three';
import type { GranularPickKey } from '../body/bodyPickMapping';
import { mixamoBoneNameToPickKey } from '../body/bodyPickMapping';

/**
 * From a raycast hit on a SkinnedMesh, infer granular body part via dominant skin weights on the hit face.
 */
export function getPickKeyFromSkinnedHit(
  mesh: THREE.SkinnedMesh,
  intersection: THREE.Intersection
): GranularPickKey | null {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const skinIndex = geom.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
  const skinWeight = geom.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
  if (!skinIndex || !skinWeight || !intersection.face) return null;

  const verts = [intersection.face.a, intersection.face.b, intersection.face.c];
  const bones = mesh.skeleton?.bones;
  if (!bones?.length) return null;

  const contrib = new Map<number, number>();

  for (const vi of verts) {
    const indices = [
      Math.round(skinIndex.getX(vi)),
      Math.round(skinIndex.getY(vi)),
      Math.round(skinIndex.getZ(vi)),
      Math.round(skinIndex.getW(vi)),
    ];
    const weights = [
      skinWeight.getX(vi),
      skinWeight.getY(vi),
      skinWeight.getZ(vi),
      skinWeight.getW(vi),
    ];
    for (let k = 0; k < 4; k++) {
      const idx = indices[k];
      const w = weights[k];
      if (w > 0.01 && idx >= 0 && idx < bones.length) {
        contrib.set(idx, (contrib.get(idx) ?? 0) + w);
      }
    }
  }

  let bestIdx = -1;
  let bestW = 0;
  contrib.forEach((w, idx) => {
    if (w > bestW) {
      bestW = w;
      bestIdx = idx;
    }
  });
  if (bestIdx < 0) return null;

  const boneName = bones[bestIdx]?.name ?? '';
  return mixamoBoneNameToPickKey(boneName);
}

/** Debug: mesh + dominant influence bone from raycast hit (for console logging). */
export function getSkinnedHitDebug(
  mesh: THREE.SkinnedMesh,
  intersection: THREE.Intersection
): {
  meshName: string;
  dominantBoneIndex: number;
  dominantBoneName: string;
  pickKey: GranularPickKey | null;
} {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const skinIndex = geom.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
  const skinWeight = geom.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
  const bones = mesh.skeleton?.bones;
  if (!skinIndex || !skinWeight || !intersection.face || !bones?.length) {
    return {
      meshName: mesh.name,
      dominantBoneIndex: -1,
      dominantBoneName: '(no skin data)',
      pickKey: null,
    };
  }
  const verts = [intersection.face.a, intersection.face.b, intersection.face.c];
  const contrib = new Map<number, number>();
  for (const vi of verts) {
    const indices = [
      Math.round(skinIndex.getX(vi)),
      Math.round(skinIndex.getY(vi)),
      Math.round(skinIndex.getZ(vi)),
      Math.round(skinIndex.getW(vi)),
    ];
    const weights = [
      skinWeight.getX(vi),
      skinWeight.getY(vi),
      skinWeight.getZ(vi),
      skinWeight.getW(vi),
    ];
    for (let k = 0; k < 4; k++) {
      const idx = indices[k];
      const w = weights[k];
      if (w > 0.01 && idx >= 0 && idx < bones.length) {
        contrib.set(idx, (contrib.get(idx) ?? 0) + w);
      }
    }
  }
  let bestIdx = -1;
  let bestW = 0;
  contrib.forEach((w, idx) => {
    if (w > bestW) {
      bestW = w;
      bestIdx = idx;
    }
  });
  const boneName = bestIdx >= 0 ? bones[bestIdx]?.name ?? '' : '';
  return {
    meshName: mesh.name,
    dominantBoneIndex: bestIdx,
    dominantBoneName: boneName || '(none)',
    pickKey: mixamoBoneNameToPickKey(boneName),
  };
}

/** vanguard_visor → treat as cranium / upper head */
export function meshNameToDefaultPickKey(meshName: string): GranularPickKey | null {
  if (meshName.includes('visor')) return 'cranium';
  return null;
}
