/**
 * Constant-time string compare for shared secrets (cron / webhook headers).
 *
 * Supabase Edge Runtime's `crypto.subtle` does **not** expose `timingSafeEqual`
 * (calling it throws `TypeError: crypto.subtle.timingSafeEqual is not a function`).
 * We therefore compare UTF-8 bytes with an XOR accumulator in pure TypeScript.
 *
 * Returns false when either side is empty or lengths differ (after trim).
 * The early length check is intentional — secret compares typically reject
 * unequal lengths before the constant-time scan (length is not secret material
 * for our cron/webhook tokens, which are fixed-format shared secrets).
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  const enc = new TextEncoder();
  const leftBytes = enc.encode(left);
  const rightBytes = enc.encode(right);
  // UTF-8 byte length can diverge from JS string length for non-ASCII; reject
  // that case rather than comparing unequal buffers.
  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false;
  }

  return timingSafeEqualBytes(leftBytes, rightBytes);
}

/**
 * Constant-time equality for equal-length byte arrays.
 * Always scans every index so mismatch position does not leak via early exit.
 */
function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}
