/**
 * Procedural muscle geometry using Gaussian vertex displacement.
 *
 * Each geometry starts as a high-poly cylinder/sphere and then applies
 * localised Gaussian "bumps" that push surface vertices outward to simulate
 * muscle bellies, tendons, and bone landmarks.
 *
 * The bump kernel:
 *   displacement = strength × exp(−||XZ − center||² / σ²) × cos-window(Y)
 *
 * Applied in the RADIAL direction so bumps always protrude from the body surface.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ── Core displacement kernel ─────────────────────────────────────────────────

function gaussBump(
  pos: THREE.BufferAttribute,
  cx: number,      // XZ bump centre – X
  cz: number,      // XZ bump centre – Z (positive = FRONT of body)
  yCenter: number, // Y centre of influence (local space)
  yRadius: number, // Y half-extent (cosine window reaches 0 at ± yRadius)
  strength: number,// peak radial displacement
  sigma: number    // XZ Gaussian standard deviation
): void {
  const s2 = sigma * sigma;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const r = Math.hypot(x, z);
    if (r < 1e-6) continue; // skip axis-centre cap vertices

    // Y cosine window
    const yFrac = (y - yCenter) / yRadius;
    if (Math.abs(yFrac) >= 1.0) continue;
    const yW = 0.5 + 0.5 * Math.cos(yFrac * Math.PI);

    // XZ Gaussian weight
    const dx = x - cx;
    const dz = z - cz;
    const xzW = Math.exp(-(dx * dx + dz * dz) / s2);

    // Displace radially outward from Y axis
    const d = strength * xzW * yW;
    pos.setX(i, x + (x / r) * d);
    pos.setZ(i, z + (z / r) * d);
  }
}

// ── Upper Torso – chest (pecs), traps, lats, rhomboids ───────────────────────
export function createUpperTorso(): THREE.BufferGeometry {
  // 40 radial, 24 height segments → dense enough for smooth bumps
  const geo = new THREE.CylinderGeometry(0.24, 0.28, 0.64, 40, 24, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Pectoralis major – two teardrop shapes on front (+Z)
  gaussBump(pos,  0.09,  0.24,  0.04, 0.22, 0.044, 0.092); // right pec
  gaussBump(pos, -0.09,  0.24,  0.04, 0.22, 0.044, 0.092); // left  pec

  // Anterior deltoid origin (upper-front "shoulder shelf")
  gaussBump(pos,  0.22,  0.16,  0.25, 0.08, 0.022, 0.070);
  gaussBump(pos, -0.22,  0.16,  0.25, 0.08, 0.022, 0.070);

  // Trapezius – large diamond on the back (-Z)
  gaussBump(pos,  0.00, -0.26,  0.22, 0.12, 0.040, 0.18); // upper traps
  gaussBump(pos,  0.00, -0.24,  0.03, 0.20, 0.030, 0.15); // lower traps

  // Rhomboids (inner, mid-back, flanking spine)
  gaussBump(pos,  0.06, -0.24,  0.10, 0.14, 0.020, 0.058);
  gaussBump(pos, -0.06, -0.24,  0.10, 0.14, 0.020, 0.058);

  // Latissimus dorsi – wide flares on the sides
  gaussBump(pos,  0.27,  0.00, -0.04, 0.26, 0.032, 0.11);
  gaussBump(pos, -0.27,  0.00, -0.04, 0.26, 0.032, 0.11);

  geo.computeVertexNormals();
  return geo;
}

// ── Lower Torso – rectus abdominis (6-pack), obliques, erector spinae ────────
export function createLowerTorso(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.20, 0.24, 0.48, 40, 24, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Rectus abdominis – three pairs of segmented bumps on front
  const abX = 0.064;
  const abZ = 0.20;
  const abRows = [0.17, 0.02, -0.13]; // y centres (local)
  for (const yc of abRows) {
    gaussBump(pos,  abX, abZ, yc, 0.07, 0.020, 0.052);
    gaussBump(pos, -abX, abZ, yc, 0.07, 0.020, 0.052);
  }
  // Linea alba (slight depression on midline between packs) – subtle
  // We don't need to explicitly add it; the gap between bumps creates it.

  // External obliques – diagonal ridges on sides
  gaussBump(pos,  0.21,  0.04,  0.04, 0.20, 0.026, 0.092);
  gaussBump(pos, -0.21,  0.04,  0.04, 0.20, 0.026, 0.092);

  // Erector spinae – two para-spinal ridges on back
  gaussBump(pos,  0.055, -0.20,  0.06, 0.22, 0.019, 0.046);
  gaussBump(pos, -0.055, -0.20,  0.06, 0.22, 0.019, 0.046);

  geo.computeVertexNormals();
  return geo;
}

// ── Shoulder (deltoid – anterior, lateral, posterior heads) ──────────────────
export function createShoulder(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.155, 30, 22);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Anterior head (front)
  gaussBump(pos, 0.00,  0.155,  0.04, 0.092, 0.022, 0.062);
  // Lateral head (outer)
  gaussBump(pos, 0.155, 0.000, -0.02, 0.098, 0.018, 0.062);
  // Posterior head (back)
  gaussBump(pos, 0.00, -0.155,  0.04, 0.090, 0.018, 0.062);

  geo.computeVertexNormals();
  return geo;
}

// ── Upper Arm – biceps brachii, brachialis, triceps (3 heads) ────────────────
export function createUpperArm(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.074, 0.088, 0.40, 32, 20, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Biceps brachii – oval peak on front
  gaussBump(pos,  0.000,  0.076,  0.07, 0.18, 0.028, 0.068);
  // Brachialis – broader, lower, just lateral to bicep
  gaussBump(pos,  0.048,  0.074, -0.05, 0.13, 0.016, 0.052);
  gaussBump(pos, -0.048,  0.074, -0.05, 0.13, 0.016, 0.052);

  // Triceps – horseshoe on back (three heads)
  gaussBump(pos,  0.000, -0.078,  0.07, 0.20, 0.022, 0.072); // long head
  gaussBump(pos,  0.040, -0.074,  0.09, 0.14, 0.014, 0.044); // lateral head
  gaussBump(pos, -0.040, -0.074,  0.09, 0.14, 0.014, 0.044); // medial head

  geo.computeVertexNormals();
  return geo;
}

// ── Thigh – quadriceps group, hamstrings ────────────────────────────────────
// isRight: anatomical right leg (positioned at world x < 0, viewer's left)
export function createThigh(isRight: boolean): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.112, 0.130, 0.54, 36, 22, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // lateral/medial sides differ between legs
  const lat = isRight ? -1 : 1; // outer X direction in local space

  // Rectus femoris – central front, most visible
  gaussBump(pos,  0.000,  0.116,  0.10, 0.25, 0.028, 0.070);
  // Vastus lateralis – outer front
  gaussBump(pos,  lat * 0.092,  0.108,  0.08, 0.22, 0.024, 0.068);
  // Vastus medialis – teardrop above knee, inner
  gaussBump(pos, -lat * 0.082,  0.110, -0.14, 0.10, 0.020, 0.060);

  // Hamstrings – biceps femoris (outer back) + semitendinosus (inner back)
  gaussBump(pos,  lat * 0.055, -0.114,  0.07, 0.22, 0.022, 0.068);
  gaussBump(pos, -lat * 0.055, -0.114,  0.07, 0.22, 0.022, 0.068);

  geo.computeVertexNormals();
  return geo;
}

// ── Calf – gastrocnemius (two heads) + soleus + tibialis anterior ─────────────
export function createCalf(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.072, 0.092, 0.46, 32, 20, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Gastrocnemius – two prominent heads on back
  gaussBump(pos,  0.042, -0.076,  0.12, 0.16, 0.022, 0.044);
  gaussBump(pos, -0.042, -0.076,  0.12, 0.16, 0.022, 0.044);
  // Soleus – broad underlying muscle, lower
  gaussBump(pos,  0.000, -0.076, -0.04, 0.12, 0.016, 0.068);
  // Tibialis anterior – shin ridge on front
  gaussBump(pos,  0.000,  0.092,  0.09, 0.20, 0.012, 0.040);

  geo.computeVertexNormals();
  return geo;
}

// ── Knee – patella landmark on front ────────────────────────────────────────
export function createKnee(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.124, 28, 22);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Patella (kneecap) – small oval protrusion front-centre
  gaussBump(pos, 0.00,  0.124,  0.02, 0.08, 0.028, 0.052);

  geo.computeVertexNormals();
  return geo;
}

// ── Hip/Gluteus – gluteus maximus, medius ────────────────────────────────────
export function createGlute(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.168, 28, 22);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Gluteus maximus – dominant back mass
  gaussBump(pos,  0.000, -0.168, -0.02, 0.14, 0.038, 0.14);
  // Gluteus medius – upper-lateral
  gaussBump(pos,  0.168,  0.000,  0.07, 0.10, 0.022, 0.080);
  gaussBump(pos, -0.168,  0.000,  0.07, 0.10, 0.022, 0.080);

  geo.computeVertexNormals();
  return geo;
}

// ── Forearm – brachioradialis + extensor/flexor groups ──────────────────────
export function createForearm(): THREE.BufferGeometry {
  // Distal radius slightly narrower than the hand root so the wrist reads as one piece
  // (no separate joint sphere in the rig — hand attaches here).
  const geo = new THREE.CylinderGeometry(0.060, 0.052, 0.36, 28, 16, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Brachioradialis – front-outer ridge (tapers toward wrist)
  gaussBump(pos,  0.045,  0.062,  0.08, 0.14, 0.016, 0.048);
  gaussBump(pos, -0.045,  0.062,  0.08, 0.14, 0.016, 0.048);
  // Extensor group – back flare (wider at top); keep distal third subtler so wrist stays clean
  gaussBump(pos,  0.000, -0.068,  0.10, 0.14, 0.012, 0.052);

  geo.computeVertexNormals();
  return geo;
}

// ── Open hand (legacy name — prefer createNormalHandGeometry) ────────────────
/** @deprecated Use {@link createNormalHandGeometry} for articulated palm + phalanges. */
export function createOpenHandGeometry(mirror: boolean): THREE.BufferGeometry {
  return createNormalHandGeometry(mirror);
}

/**
 * כף יד — פרופורציה ~מרחק סנטר–אמצע מצח; כף פונה פנימה (−X לפני mirror), אצבעות למטה (−Y),
 * פריסה עדינה, כיפוף רגוע; אגודל זוויתי מרובע האצבעות. ~35% קטן מהגרסה הגדולה הקודמת.
 */
export function createNormalHandGeometry(mirror: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const capSeg = 6;
  const cylSeg = 12;
  const sc = 1.12;

  const overlap = 0.0011 * sc;

  const wristTaper = new THREE.CylinderGeometry(0.024 * sc, 0.026 * sc, 0.034 * sc, 14, 3, false);
  wristTaper.translate(0.004 * sc, -0.017 * sc, 0);
  parts.push(wristTaper);

  const palmBody = new THREE.BoxGeometry(0.014 * sc, 0.048 * sc, 0.044 * sc);
  palmBody.translate(-0.01 * sc, -0.044 * sc, 0.002 * sc);
  parts.push(palmBody);

  const knucklePlate = new THREE.BoxGeometry(0.088 * sc, 0.012 * sc, 0.036 * sc);
  knucklePlate.translate(-0.006 * sc, -0.056 * sc, 0.008 * sc);
  parts.push(knucklePlate);

  /** אצבעות −Y; `curl` סביב X — כיפוף רגוע לכיוון כף */
  const fingerDown = (
    x: number,
    z: number,
    yKnuckle: number,
    splayY: number,
    r0: number,
    l1: number,
    l2: number,
    l3: number
  ) => {
    let y = yKnuckle;
    const seg = (len: number, rad: number, curl: number, sy: number) => {
      const cy = y - len / 2 - rad;
      const g = new THREE.CapsuleGeometry(rad, len, capSeg, cylSeg);
      g.rotateY(sy);
      g.rotateX(curl);
      g.translate(x, cy, z);
      parts.push(g);
      y -= len + 2 * rad - overlap;
    };
    seg(l1, r0, 0.09, splayY);
    seg(l2, r0 * 0.9, 0.16, splayY * 0.92);
    seg(l3, r0 * 0.78, 0.22, splayY * 0.85);
  };

  const yKn = -0.058 * sc;
  const zOff = [0.003, 0.0015, 0, -0.0015, -0.0025].map((v) => v * sc);

  fingerDown(-0.028 * sc, zOff[0], yKn, 0.038, 0.0088 * sc, 0.048 * sc, 0.038 * sc, 0.03 * sc);
  fingerDown(-0.014 * sc, zOff[1], yKn, 0.018, 0.0092 * sc, 0.054 * sc, 0.042 * sc, 0.032 * sc);
  fingerDown(0, zOff[2], yKn, 0, 0.0096 * sc, 0.058 * sc, 0.046 * sc, 0.034 * sc);
  fingerDown(0.014 * sc, zOff[3], yKn, -0.02, 0.009 * sc, 0.05 * sc, 0.04 * sc, 0.03 * sc);

  const rT = 0.0096 * sc;
  const tx = 0.034 * sc;
  const tz = 0.024 * sc + zOff[4];
  let yTh = -0.053 * sc;
  const thumbSeg = (len: number, rad: number, curl: number, yaw: number) => {
    const cy = yTh - len / 2 - rad;
    const g = new THREE.CapsuleGeometry(rad, len, capSeg, cylSeg);
    g.rotateY(yaw);
    g.rotateX(curl);
    g.translate(tx, cy, tz);
    parts.push(g);
    yTh -= len + 2 * rad - overlap;
  };
  thumbSeg(0.032 * sc, rT * 1.02, 0.1, 0.52);
  thumbSeg(0.026 * sc, rT * 0.9, 0.16, 0.36);
  thumbSeg(0.02 * sc, rT * 0.78, 0.2, 0.24);

  const merged = mergeGeometries(parts, false);

  if (mirror) merged.scale(-1, 1, 1);

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  const b = merged.boundingBox;
  if (b) {
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    merged.translate(-cx, -b.max.y, -cz);
  }
  return merged;
}

/**
 * כף רגל מפורטת — עקב (calcaneus), קשת, רצועת מטאטארסלים, חמש אצבעות עם רווחים וציפורן מרומזת בקצה.
 * ציר: +Z קדימה, +Y למעלה (חיבור לשוק ב־y=0), אגודל־רגל ב־−X לפני mirror.
 */
export function createDetailedFootGeometry(mirror: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  /** 0.52×3 ≈ 1.56; +~1.06 כדי לספוג את scale הקבוצה שהוסר מ־AnatomyModel */
  const sc = 1.65;
  const capSeg = 6;
  const cylSeg = 12;

  const heel = new THREE.SphereGeometry(0.032 * sc, 22, 18);
  heel.scale(0.68, 0.52, 1.08);
  heel.translate(0, -0.029 * sc, -0.102 * sc);
  parts.push(heel);

  const ankleMortise = new THREE.SphereGeometry(0.054 * sc, 22, 18);
  ankleMortise.scale(0.9, 0.7, 0.9);
  ankleMortise.translate(0, 0.05 * sc, -0.03 * sc);
  parts.push(ankleMortise);

  const ankleBlend = new THREE.CylinderGeometry(0.048 * sc, 0.042 * sc, 0.064 * sc, 22, 5, false);
  ankleBlend.translate(0, 0.017 * sc, -0.039 * sc);
  parts.push(ankleBlend);

  const plantarBase = new THREE.BoxGeometry(0.056 * sc, 0.012 * sc, 0.118 * sc);
  plantarBase.translate(0, -0.0345 * sc, 0.018 * sc);
  parts.push(plantarBase);

  const archBlock = new THREE.BoxGeometry(0.03 * sc, 0.018 * sc, 0.092 * sc);
  archBlock.rotateZ(0.2);
  archBlock.rotateX(0.16);
  archBlock.translate(-0.017 * sc, -0.024 * sc, -0.008 * sc);
  parts.push(archBlock);

  const dorsum = new THREE.BoxGeometry(0.056 * sc, 0.014 * sc, 0.09 * sc);
  dorsum.rotateX(-0.06);
  dorsum.translate(0, -0.01 * sc, 0.038 * sc);
  parts.push(dorsum);

  const metX = [-0.044, -0.022, -0.001, 0.02, 0.039].map((v) => v * sc);
  const metZ = [0.056, 0.058, 0.06, 0.062, 0.064].map((v) => v * sc);
  const metR = [0.0128, 0.0118, 0.0112, 0.0106, 0.0098].map((v) => v * sc);
  for (let i = 0; i < 5; i++) {
    const head = new THREE.SphereGeometry(metR[i], 14, 12);
    head.scale(0.92, 0.48, 1.05);
    head.translate(metX[i], -0.031 * sc, metZ[i]);
    parts.push(head);
  }

  type ToeDef = { x: number; z0: number; l1: number; l2: number; r0: number; r1: number };
  const toeDefs: ToeDef[] = [
    { x: -0.044, z0: 0.084, l1: 0.024, l2: 0.02, r0: 0.0108, r1: 0.0088 },
    { x: -0.022, z0: 0.088, l1: 0.022, l2: 0.018, r0: 0.01, r1: 0.0082 },
    { x: -0.001, z0: 0.09, l1: 0.02, l2: 0.016, r0: 0.0094, r1: 0.0076 },
    { x: 0.02, z0: 0.091, l1: 0.017, l2: 0.013, r0: 0.0088, r1: 0.007 },
    { x: 0.039, z0: 0.092, l1: 0.014, l2: 0.011, r0: 0.0078, r1: 0.0062 },
  ].map((d) => ({
    ...d,
    x: d.x * sc,
    z0: d.z0 * sc,
    l1: d.l1 * sc,
    l2: d.l2 * sc,
    r0: d.r0 * sc,
    r1: d.r1 * sc,
  }));

  const toeY = -0.0305 * sc;
  const toeOverlap = 0.0012 * sc;
  for (const t of toeDefs) {
    const cZProx = t.z0 + t.l1 / 2 + t.r0;
    const prox = new THREE.CapsuleGeometry(t.r0, t.l1, capSeg, cylSeg);
    prox.rotateX(Math.PI / 2);
    prox.translate(t.x, toeY, cZProx);
    parts.push(prox);

    const zTopProx = t.z0 + t.l1 + 2 * t.r0 - toeOverlap;
    const cZDist = zTopProx + t.l2 / 2 + t.r1;
    const dist = new THREE.CapsuleGeometry(t.r1, t.l2, capSeg, cylSeg);
    dist.rotateX(Math.PI / 2);
    dist.translate(t.x * 0.995, toeY + 0.001 * sc, cZDist);
    parts.push(dist);

    const zTip = zTopProx + t.l2 + 2 * t.r1 - toeOverlap * 0.5;
    const nail = new THREE.SphereGeometry(t.r1 * 0.92, 12, 10);
    nail.scale(1.12, 0.32, 1.08);
    nail.translate(t.x * 0.99, toeY + 0.0025 * sc, zTip);
    parts.push(nail);
  }

  const merged = mergeGeometries(parts, false);
  if (mirror) merged.scale(-1, 1, 1);

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  const b = merged.boundingBox;
  if (b) {
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    merged.translate(-cx, -b.max.y, -cz);
  }
  return merged;
}

/** @deprecated Use createDetailedFootGeometry */
export const createAnatomicalFootGeometry = createDetailedFootGeometry;
