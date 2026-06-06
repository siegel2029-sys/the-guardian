/**
 * Returns the canonical VAPID public key the server signs Web Push with.
 *
 * The frontend MUST subscribe (`pushManager.subscribe({ applicationServerKey })`) with these exact
 * bytes — otherwise the push gateway rejects delivery with HTTP 403
 * ("the VAPID credentials in the authorization header do not correspond to the credentials used to
 * create the subscriptions"). Fetching the key from here removes the dependency on a possibly-stale
 * build-time `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`.
 *
 * Public, read-only, no secrets exposed (the public key is, by design, public). Deployed with
 * `verify_jwt = false` so the credential-less CORS preflight (OPTIONS) is not rejected by the
 * Supabase gateway before this handler can attach CORS headers.
 *
 * Secret: `WEB_PUSH_VAPID_PUBLIC_KEY` (must pair with `WEB_PUSH_VAPID_PRIVATE_KEY` used to send).
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Last-resort public key if the env secret is genuinely missing. NOTE: this only works if
 * WEB_PUSH_VAPID_PRIVATE_KEY pairs with it. Prefer setting WEB_PUSH_VAPID_PUBLIC_KEY.
 */
const HARDCODED_FALLBACK_PUBLIC_KEY =
  "BIRiFTcrsL5UwU6kkrQ3ThpZZJbGWmteXiILW0Zh3XXkgPWN1QGzs0tnCn0vy3OVVjIoaKuFB_LL-5j6DpBbr98";

function normalizeVapidKeyString(raw: string | undefined | null): string {
  return (raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\u2028\u2029]+/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getConfiguredVapidPublicKey(): string {
  const envPublic = normalizeVapidKeyString(Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY"));
  return envPublic.length > 40 ? envPublic : HARDCODED_FALLBACK_PUBLIC_KEY;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const publicKey = getConfiguredVapidPublicKey();
  const ok = publicKey.length > 40;

  if (!ok) {
    console.error(
      "[web-push-public-key] WEB_PUSH_VAPID_PUBLIC_KEY is missing/short — frontend cannot subscribe correctly.",
    );
  } else {
    console.log(
      `[web-push-public-key] Served VAPID public key (length=${publicKey.length}, prefix=${publicKey.slice(0, 8)}).`,
    );
  }

  return new Response(
    JSON.stringify({ ok, publicKey }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Key rarely rotates; let clients cache briefly to avoid a request on every app open.
        "Cache-Control": "public, max-age=300",
      },
    },
  );
});
