/**
 * Mobile / constrained-GPU profile for the Body Map WebGL stack.
 * Coarse pointers + narrow viewports (phones) are the primary signal;
 * low hardwareConcurrency / deviceMemory tighten the profile further.
 */
export type BodyMapGpuProfile = {
  /** Prefer lower mesh density, smaller textures, no HDR IBL */
  lowDetail: boolean;
  /** Cap for `renderer.setPixelRatio` / R3F `dpr` */
  maxPixelRatio: number;
  /** Shadow map edge length (square) */
  shadowMapSize: number;
  /** Procedural muscle fiber map edge length */
  muscleTextureSize: number;
  /** ContactShadows render target size */
  contactShadowResolution: number;
  /** Skip studio HDR environment (large GPU memory) */
  skipHdrEnvironment: boolean;
  /** Disable MSAA — large cost on high-DPR mobile */
  antialias: boolean;
};

function readDeviceMemoryGb(): number | undefined {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && Number.isFinite(mem) ? mem : undefined;
}

function readSaveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

/** True when Body Map should run the constrained GPU path (mobile Safari/Chrome). */
export function preferBodyMapMobileGpu(): boolean {
  if (typeof window === 'undefined') return false;
  if (readSaveData()) return true;

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const hw = navigator.hardwareConcurrency ?? 8;
  const mem = readDeviceMemoryGb();

  if (coarse && narrow) return true;
  if (coarse && (hw <= 4 || (mem != null && mem <= 4))) return true;
  return false;
}

/**
 * Pixel-ratio cap: always ≤ 2 (retina phones otherwise allocate 3–4× backing stores).
 * Mobile profile caps further at 1.5 to cut framebuffer memory.
 */
export function bodyMapMaxPixelRatio(lowDetail: boolean): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, lowDetail ? 1.5 : 2);
}

export function getBodyMapGpuProfile(lowDetailOverride?: boolean): BodyMapGpuProfile {
  const lowDetail = lowDetailOverride ?? preferBodyMapMobileGpu();
  return {
    lowDetail,
    maxPixelRatio: bodyMapMaxPixelRatio(lowDetail),
    shadowMapSize: lowDetail ? 512 : 1024,
    muscleTextureSize: lowDetail ? 64 : 256,
    contactShadowResolution: lowDetail ? 256 : 768,
    skipHdrEnvironment: lowDetail,
    antialias: !lowDetail,
  };
}

/** Hook-friendly: subscribe to coarse-pointer / viewport changes. */
export function subscribeBodyMapMobileGpu(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const coarse = window.matchMedia('(pointer: coarse)');
  const narrow = window.matchMedia('(max-width: 900px)');
  coarse.addEventListener('change', onChange);
  narrow.addEventListener('change', onChange);
  return () => {
    coarse.removeEventListener('change', onChange);
    narrow.removeEventListener('change', onChange);
  };
}
