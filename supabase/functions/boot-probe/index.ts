/**
 * Production-locked diagnostic probe. Requires `x-cron-secret` matching
 * `INTERNAL_CRON_SECRET` (same header used by reminder-cron). Unauthenticated
 * callers receive 401 — never expose VAPID lengths or key-build errors publicly.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expected = (Deno.env.get("INTERNAL_CRON_SECRET") ?? "").trim();
  const provided = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const pub = (Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "").trim();
  const priv = (Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "").trim();

  return json({
    ok: true,
    vapidPublicConfigured: pub.length > 40,
    vapidPrivateConfigured: priv.length > 40,
    // Lengths only — never echo key material.
    pubLen: pub.length,
    privLen: priv.length,
  });
});
