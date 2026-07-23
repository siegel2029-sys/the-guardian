/**
 * Constant-time string compare for shared secrets (cron / webhook headers).
 * Returns false when either side is empty or lengths differ.
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
  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}
