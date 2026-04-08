import * as THREE from 'three';

/**
 * יוצר מפת נורמל פרוצדורלית (סיבי שריר) + מפת מחוספסות עדינה — ללא נכסים חיצוניים.
 */
export function createMuscleFiberTextures(size = 256): {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const h: Float32Array = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const striations =
        Math.sin(nx * Math.PI * 70) * 0.28 +
        Math.sin(ny * Math.PI * 45 + nx * Math.PI * 28) * 0.22 +
        Math.sin((nx + ny) * Math.PI * 55) * 0.12;
      const grain =
        Math.sin(nx * 523.7 + ny * 311.3) * 0.08 + Math.sin(nx * 199 + ny * 401) * 0.06;
      h[y * size + x] = striations + grain;
    }
  }

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nctx = normalCanvas.getContext('2d')!;
  const nImg = nctx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;
  const rImg = rctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        nImg.data[p] = 128;
        nImg.data[p + 1] = 128;
        nImg.data[p + 2] = 255;
        nImg.data[p + 3] = 255;
        rImg.data[p] = rImg.data[p + 1] = rImg.data[p + 2] = 210;
        rImg.data[p + 3] = 255;
        continue;
      }
      const gx = h[idx + 1] - h[idx - 1];
      const gy = h[idx + size] - h[idx - size];
      let nx = -gx * 1.8;
      let nyy = -gy * 1.8;
      let nz = 1;
      const len = Math.sqrt(nx * nx + nyy * nyy + nz * nz) || 1;
      nx /= len;
      nyy /= len;
      nz /= len;
      nImg.data[p] = (nx * 0.5 + 0.5) * 255;
      nImg.data[p + 1] = (nyy * 0.5 + 0.5) * 255;
      nImg.data[p + 2] = (nz * 0.5 + 0.5) * 255;
      nImg.data[p + 3] = 255;

      const rough = THREE.MathUtils.clamp(0.38 + h[idx] * 0.35, 0.12, 0.92);
      const rv = rough * 255;
      rImg.data[p] = rv;
      rImg.data[p + 1] = rv;
      rImg.data[p + 2] = rv;
      rImg.data[p + 3] = 255;
    }
  }

  nctx.putImageData(nImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(5, 5);
  normalMap.anisotropy = 8;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(5, 5);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}
