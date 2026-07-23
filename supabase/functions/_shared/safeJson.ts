/**
 * Safe JSON helpers for Edge Functions — prefer over `JSON.parse(...) as T`.
 */

/** Parse a JSON string into a plain object (not array / null / primitive). */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Narrow an already-parsed value to a plain object. */
export function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
