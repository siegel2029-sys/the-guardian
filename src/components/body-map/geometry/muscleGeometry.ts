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
 * כף יד במנוחה — פרופורציה קטנה (בערך גובה מ־סנטר לאמצע מצח ביחס לראש האווטאר).
 * נבנה בקואורדינטות «קדימה +Z» מהשורש; אחרי סיבוב: המשך האמה ~−Y, שורש כף ב־y=0 (קצה פרוקסימלי).
 * ימין: scale −X על המשולב.
 */
export function createNormalHandGeometry(mirror: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const capSeg = 4;
  const cylSeg = 8;
  /** Global scale — smaller than legacy 0.54 so hands match face proportions */
  const sc = 0.37;

  const palmW = 0.064 * sc;
  const palmY = 0.012 * sc;
  const palmZ = 0.048 * sc;
  const palm = new THREE.BoxGeometry(palmW, palmY, palmZ);
  palm.rotateX(-0.045);
  palm.translate(0, -0.004 * sc, palmZ * 0.52 + 0.006 * sc);
  parts.push(palm);

  const phalanx = (
    x: number,
    z0: number,
    length: number,
    radius: number,
    rotY: number,
    curlX: number
  ) => {
    const g = new THREE.CapsuleGeometry(radius, length, capSeg, cylSeg);
    g.rotateX(-Math.PI / 2 + curlX);
    g.rotateY(rotY);
    g.translate(x, 0.001 * sc, z0 + length * 0.5);
    parts.push(g);
    return z0 + length + radius * 1.05;
  };

  const finger = (
    x: number,
    zStart: number,
    rotY: number,
    r: number,
    l1: number,
    l2: number,
    l3: number,
    curl: number
  ) => {
    let z = zStart;
    z = phalanx(x, z, l1 * sc, r * sc, rotY, curl * 0.45);
    z = phalanx(x, z, l2 * sc, r * 0.9 * sc, rotY * 0.94, curl * 0.78);
    phalanx(x, z, l3 * sc, r * 0.82 * sc, rotY * 0.88, curl * 0.98);
  };

  const zb = 0.058 * sc;
  const curl = 0.12;
  const rIdx = 0.0074 * sc;
  const rMid = 0.0079 * sc;
  const rRing = 0.0075 * sc;
  const rPink = 0.0068 * sc;

  finger(0.021 * sc, zb, -0.095, rIdx, 0.03, 0.024, 0.018, curl);
  finger(0.007 * sc, zb + 0.005 * sc, -0.032, rMid, 0.034, 0.027, 0.02, curl);
  finger(-0.007 * sc, zb + 0.004 * sc, 0.03, rRing, 0.032, 0.025, 0.019, curl);
  finger(-0.021 * sc, zb - 0.001 * sc, 0.09, rPink, 0.026, 0.02, 0.015, curl);

  const rT = 0.0076 * sc;
  const thumbMeta = new THREE.CapsuleGeometry(rT, 0.024 * sc, capSeg, cylSeg);
  thumbMeta.rotateZ(0.82);
  thumbMeta.rotateX(-0.38);
  thumbMeta.translate(0.034 * sc, -0.006 * sc, 0.014 * sc);
  parts.push(thumbMeta);

  let tz = 0.052 * sc;
  tz = phalanx(0.044 * sc, tz, 0.02 * sc, rT * 1.02, 0.28, 0.09);
  phalanx(0.044 * sc, tz, 0.016 * sc, rT * 0.88, 0.22, 0.11);

  const merged = mergeGeometries(parts, false);

  merged.rotateY(Math.PI / 2);
  merged.rotateX(-0.26);
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

/** Opaque bridge between shin and foot — fills the ankle visual gap. */
export function createAnkleBridgeGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.067, 0.054, 0.22, 22, 1, false);
  g.rotateX(Math.PI / 2 + 0.1);
  g.translate(0.006, -0.792, 0.028);
  g.computeVertexNormals();
  return g;
}
