/**
 * PHI-safe logging helpers (Iron Rule 1).
 * Production builds: never emit patient identifiers or clinical free text.
 * Dev builds: allow operational detail without dumping full payloads.
 */

export function isDevLoggingEnabled(): boolean {
  return import.meta.env.DEV === true;
}

/** Log only in development — never ship patient/clinical detail to prod consoles. */
export function devLog(message: string, detail?: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) return;
  if (detail) console.log(message, detail);
  else console.log(message);
}

export function devWarn(message: string, detail?: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) return;
  if (detail) console.warn(message, detail);
  else console.warn(message);
}

export function devError(message: string, detail?: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) return;
  if (detail) console.error(message, detail);
  else console.error(message);
}

/** Redact a patient/row id for logs (keeps length signal only). */
export function redactId(id: string | null | undefined): string {
  const t = (id ?? '').trim();
  if (!t) return '(none)';
  if (t.length <= 8) return `…${t.length}c`;
  return `${t.slice(0, 4)}…${t.slice(-2)}`;
}
