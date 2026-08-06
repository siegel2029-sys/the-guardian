/**
 * Shared CORS helpers for Edge Functions.
 * Fail-closed when ALLOWED_ORIGINS is set/empty in production, but always
 * allow local Vite (`localhost:5173` / `127.0.0.1:5173`) for development.
 */

export const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export function parseAllowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Effective allow-list: configured origins + localhost Vite ports. */
export function effectiveAllowedOrigins(): string[] {
  const configured = parseAllowedOrigins();
  const set = new Set<string>([...configured, ...LOCAL_DEV_ORIGINS]);
  return [...set];
}

export function corsHeadersFor(
  req: Request,
  extraAllowHeaders = "authorization, x-client-info, apikey, content-type",
): Record<string, string> {
  const allowed = effectiveAllowedOrigins();
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? LOCAL_DEV_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": extraAllowHeaders,
    Vary: "Origin",
  };
}

/** Reject non-allowed Origin (empty Origin is allowed for server-to-server / cron). */
export function isOriginForbidden(req: Request): boolean {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return false;
  return !effectiveAllowedOrigins().includes(origin);
}
