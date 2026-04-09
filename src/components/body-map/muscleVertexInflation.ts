import * as THREE from 'three';

const INJECT_TAG = 'transformed += normalize(normal) * muscleInflation';

/**
 * דוחף קדקודים לאורך normal בצליל — MeshStandard / MeshPhysical.
 * בטוח לקריאה חוזרת (קומפילציה חוזרת של Three.js).
 */
export function installMuscleVertexInflation(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  uniformHolder: { value: number }
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.muscleInflation = uniformHolder;
    if (!shader.vertexShader.includes('uniform float muscleInflation')) {
      shader.vertexShader = `uniform float muscleInflation;\n${shader.vertexShader}`;
    }
    if (!shader.vertexShader.includes(INJECT_TAG)) {
      const token = '#include <begin_vertex>';
      if (shader.vertexShader.includes(token)) {
        shader.vertexShader = shader.vertexShader.replace(
          token,
          `${token}\n  ${INJECT_TAG};`
        );
      }
    }
  };
  material.needsUpdate = true;
}

export function clearMuscleVertexInflationPatch(material: THREE.Material | null): void {
  if (!material) return;
  material.onBeforeCompile = () => {};
  material.needsUpdate = true;
}
