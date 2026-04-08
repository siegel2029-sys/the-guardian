import * as THREE from 'three';

export const PICK_BONE_UNIFORM_SIZE = 24;

type PickUniforms = {
  uPickSelf: THREE.IUniform<number[]>;
  uPickSelfN: THREE.IUniform<number>;
  uPickClin: THREE.IUniform<number[]>;
  uPickClinN: THREE.IUniform<number>;
  uPickHover: THREE.IUniform<number>;
};

export function createCeramicHighlightMaterial(base: {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
}): THREE.MeshPhysicalMaterial {
  const N = PICK_BONE_UNIFORM_SIZE;
  const pickU: PickUniforms = {
    uPickSelf: { value: Array.from({ length: N }, () => -1) },
    uPickSelfN: { value: 0 },
    uPickClin: { value: Array.from({ length: N }, () => -1) },
    uPickClinN: { value: 0 },
    uPickHover: { value: -1 },
  };

  const m = new THREE.MeshPhysicalMaterial({
    color: base.color,
    roughness: base.roughness,
    metalness: base.metalness,
    clearcoat: base.clearcoat,
    clearcoatRoughness: base.clearcoatRoughness,
    envMapIntensity: base.envMapIntensity,
  });
  (m as THREE.MeshPhysicalMaterial & { skinning: boolean }).skinning = true;

  m.userData.pickU = pickU;

  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pickU);

    shader.vertexShader =
      `
uniform int uPickSelf[${N}];
uniform int uPickSelfN;
uniform int uPickClin[${N}];
uniform int uPickClinN;
uniform int uPickHover;
varying float vGlowSelf;
varying float vGlowClin;
varying float vGlowHover;
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      /* glsl */ `#include <skinning_vertex>
float pickFromGlobalSelf(vec4 si, vec4 sw) {
  float g = 0.0;
  for (int i = 0; i < ${N}; i++) {
    if (i >= uPickSelfN) break;
    int bi = uPickSelf[i];
    if (bi < 0) continue;
    if (int(si.x + 0.5) == bi) g = max(g, sw.x);
    if (int(si.y + 0.5) == bi) g = max(g, sw.y);
    if (int(si.z + 0.5) == bi) g = max(g, sw.z);
    if (int(si.w + 0.5) == bi) g = max(g, sw.w);
  }
  return g;
}
float pickFromGlobalClin(vec4 si, vec4 sw) {
  float g = 0.0;
  for (int i = 0; i < ${N}; i++) {
    if (i >= uPickClinN) break;
    int bi = uPickClin[i];
    if (bi < 0) continue;
    if (int(si.x + 0.5) == bi) g = max(g, sw.x);
    if (int(si.y + 0.5) == bi) g = max(g, sw.y);
    if (int(si.z + 0.5) == bi) g = max(g, sw.z);
    if (int(si.w + 0.5) == bi) g = max(g, sw.w);
  }
  return g;
}
float pickOne(vec4 si, vec4 sw, int bi) {
  if (bi < 0) return 0.0;
  float g = 0.0;
  if (int(si.x + 0.5) == bi) g = max(g, sw.x);
  if (int(si.y + 0.5) == bi) g = max(g, sw.y);
  if (int(si.z + 0.5) == bi) g = max(g, sw.z);
  if (int(si.w + 0.5) == bi) g = max(g, sw.w);
  return g;
}
vGlowSelf = pickFromGlobalSelf(skinIndex, skinWeight);
vGlowClin = pickFromGlobalClin(skinIndex, skinWeight);
vGlowHover = pickOne(skinIndex, skinWeight, uPickHover);
`
    );

    shader.fragmentShader =
      `
varying float vGlowSelf;
varying float vGlowClin;
varying float vGlowHover;
` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      /* glsl */ `vec3 pickEmis = vec3(0.0);
if (vGlowClin > 0.07) {
  pickEmis += vec3(0.95, 0.25, 0.2) * vGlowClin * 0.62;
} else if (vGlowSelf > 0.07) {
  pickEmis += vec3(0.1, 0.82, 0.42) * vGlowSelf * 0.58;
} else if (vGlowHover > 0.07) {
  pickEmis += vec3(0.15, 0.92, 0.5) * vGlowHover * 0.52;
}
totalEmissiveRadiance += pickEmis;
#include <output_fragment>`
    );
  };

  return m;
}

export function setPickHighlightBones(
  mat: THREE.MeshPhysicalMaterial,
  selfBoneIndices: number[],
  clinicalBoneIndices: number[],
  hoverBoneIndex: number
) {
  const pickU = mat.userData.pickU as PickUniforms | undefined;
  if (!pickU) return;
  const N = PICK_BONE_UNIFORM_SIZE;
  const us = pickU.uPickSelf.value;
  const uc = pickU.uPickClin.value;
  us.fill(-1);
  uc.fill(-1);
  const ns = Math.min(selfBoneIndices.length, N);
  const nc = Math.min(clinicalBoneIndices.length, N);
  for (let i = 0; i < ns; i++) us[i] = selfBoneIndices[i]!;
  for (let i = 0; i < nc; i++) uc[i] = clinicalBoneIndices[i]!;
  pickU.uPickSelfN.value = ns;
  pickU.uPickClinN.value = nc;
  pickU.uPickHover.value = hoverBoneIndex;
}
