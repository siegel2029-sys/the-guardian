import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Hourly reminder dispatcher: "momentum" (recent activity, no session yet today) vs 8pm local standard.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), INTERNAL_CRON_SECRET, EXPO_ACCESS_TOKEN (Expo Push API).
 * With `--no-verify-jwt`, auth requires `INTERNAL_CRON_SECRET` via header `x-cron-secret` **or** query `?secret=`.
 * Unexpected handler errors return HTTP 200 with JSON `{ ok: false, error, stack }`.
 *
 * Reads `patients.push_token`: Expo (`ExponentPushToken[...]`) via Expo Push API, or Web Push FCM
 * subscription URLs (`https://fcm.googleapis.com...`) via direct `fetch` POST with Hebrew notification JSON.
 *
 * **Testing:** POST JSON `{ "test_now": true }` sends one push to the first patient with an Expo or FCM URL token.
 * Time-of-day / quiet-hour checks are temporarily disabled in the main loop (see comments); restore before production if desired.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
};

const MOMENTUM_BODY =
  "You're already here! Want to complete your exercises now while you're at it?";
const STANDARD_BODY = "Time for your daily recovery. Let's get moving!";
/** One-off test push when JSON body has `"test_now": true`. */
const TEST_NOW_BODY = "[TEST] Physio-Shield reminder-cron ping — you can ignore this.";

type PatientRow = {
  id: string;
  push_token: string | null;
  last_activity_timestamp: string | null;
  reminder_timezone: string | null;
  last_momentum_reminder_local_date: string | null;
  last_standard_reminder_local_date: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isExpoPushToken(token: string): boolean {
  const t = token.trim();
  return t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken");
}

/** Web Push subscription endpoint (Chrome → FCM relay); `push_token` may hold this URL on web clients. */
function isFcmWebPushEndpoint(token: string): boolean {
  return token.trim().toLowerCase().startsWith("https://fcm.googleapis.com");
}

function hasDeliverableReminderToken(token: string): boolean {
  const t = token.trim();
  return t.length > 0 && (isExpoPushToken(t) || isFcmWebPushEndpoint(t));
}

function localWallParts(isoUtc: string, tz: string): { ymd: string; hour: number } | null {
  try {
    const d = new Date(isoUtc);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(d);
    const hour = Number.parseInt(hourStr, 10);
    if (!ymd || Number.isNaN(hour)) return null;
    return { ymd, hour };
  } catch {
    return null;
  }
}

function payloadHasWork(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const c = o.completedIds ?? o.completed_ids;
  if (Array.isArray(c) && c.length > 0) return true;
  const fr = o.finishReports ?? o.finish_reports;
  if (Array.isArray(fr) && fr.length > 0) return true;
  const xp = o.sessionXp ?? o.session_xp;
  if (typeof xp === "number" && xp > 0) return true;
  if (typeof xp === "string" && Number.parseFloat(xp) > 0) return true;
  return false;
}

async function sendExpoPush(token: string, body: string): Promise<{ ok: boolean; detail?: string }> {
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim() ?? "";
  if (!expoAccessToken) {
    return { ok: false, detail: "EXPO_ACCESS_TOKEN secret missing or empty" };
  }

  const r = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      Authorization: `Bearer ${expoAccessToken}`,
    },
    body: JSON.stringify({
      to: token.trim(),
      title: "Physio-Shield",
      body,
      sound: "default",
      priority: "high",
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    return { ok: false, detail: text.slice(0, 500) };
  }
  try {
    const j = JSON.parse(text) as { data?: { status?: string } };
    const st = j.data?.status;
    if (st && st !== "ok") {
      return { ok: false, detail: text.slice(0, 500) };
    }
  } catch {
    /* ignore */
  }
  return { ok: true };
}

const FCM_WEB_PUSH_JSON_BODY = JSON.stringify({
  title: "Physio-Shield",
  body: "גורדי כאן! זמן לתרגל",
});

/**
 * Direct POST to the browser Web Push endpoint (FCM). Production Web Push normally uses encrypted RFC 8291 payloads;
 * this follows the requested simple JSON shape for testing.
 */
async function sendFcmWebPushDirect(endpoint: string): Promise<{ ok: boolean; detail?: string }> {
  const url = endpoint.trim();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: FCM_WEB_PUSH_JSON_BODY,
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, detail: text.slice(0, 500) };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function sendPatientReminder(
  token: string,
  expoBody: string,
): Promise<{ ok: boolean; detail?: string }> {
  if (isFcmWebPushEndpoint(token)) {
    return sendFcmWebPushDirect(token);
  }
  return sendExpoPush(token, expoBody);
}

/** POST/PATCH/PUT JSON body flags (empty object if none). Consumes the request body once. */
async function parseCronJsonBody(req: Request): Promise<{ test_now: boolean }> {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return { test_now: false };
  }
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return { test_now: false };
  }
  try {
    const raw = await req.text();
    if (!raw.trim()) return { test_now: false };
    const j = JSON.parse(raw) as Record<string, unknown>;
    return { test_now: j.test_now === true };
  } catch {
    return { test_now: false };
  }
}

Deno.serve(async (req) => {
  console.log("Incoming headers:", Object.fromEntries(req.headers.entries()));

  const SECRET = Deno.env.get("INTERNAL_CRON_SECRET");
  const authHeader = req.headers.get("x-cron-secret");
  const url = new URL(req.url);
  const urlSecret = url.searchParams.get("secret");

  if (!SECRET || (authHeader !== SECRET && urlSecret !== SECRET)) {
    console.error("Auth failed");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    console.log(
      "Env Check - URL:",
      !!Deno.env.get("SUPABASE_URL"),
      "Key:",
      !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      "Expo:",
      !!Deno.env.get("EXPO_ACCESS_TOKEN"),
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: "missing_supabase_env" }, 503);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { test_now } = await parseCronJsonBody(req);

    if (test_now) {
      const { data: testPatients, error: testListErr } = await supabase
        .from("patients")
        .select("id, push_token")
        .not("auth_user_id", "is", null);

      if (testListErr) {
        return jsonResponse({ ok: false, test_now: true, error: testListErr.message }, 503);
      }

      let testPatientId: string | null = null;
      let testToken: string | null = null;
      for (const row of testPatients ?? []) {
        const pr = row as { id: string; push_token: string | null };
        const t = (pr.push_token ?? "").trim();
        if (hasDeliverableReminderToken(t)) {
          testPatientId = pr.id;
          testToken = t;
          break;
        }
      }

      if (!testToken || !testPatientId) {
        return jsonResponse({
          ok: true,
          test_now: true,
          sent: false,
          reason: "no_patient_with_expo_or_fcm_push_token",
        });
      }

      const r = isFcmWebPushEndpoint(testToken)
        ? await sendFcmWebPushDirect(testToken)
        : await sendExpoPush(testToken, TEST_NOW_BODY);
      return jsonResponse({
        ok: true,
        test_now: true,
        sent: r.ok,
        patientId: testPatientId,
        channel: isFcmWebPushEndpoint(testToken) ? "fcm_web_push_url" : "expo",
        ...(r.ok ? {} : { deliveryError: r.detail }),
      });
    }

    const nowIso = new Date().toISOString();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const { data: patients, error: listErr } = await supabase
      .from("patients")
      .select(
        // DB column is patients.push_token (not expo_push_token).
        "id, push_token, last_activity_timestamp, reminder_timezone, last_momentum_reminder_local_date, last_standard_reminder_local_date",
      )
      .not("auth_user_id", "is", null);

    if (listErr) {
      return jsonResponse({ ok: false, error: listErr.message }, 503);
    }

    let momentumSent = 0;
    let standardSent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of patients ?? []) {
      const p = row as PatientRow;
      const token = (p.push_token ?? "").trim();
      if (!hasDeliverableReminderToken(token)) {
        skipped += 1;
        continue;
      }

      const tz = (p.reminder_timezone ?? "UTC").trim() || "UTC";
      const wall = localWallParts(nowIso, tz);
      if (!wall) {
        skipped += 1;
        continue;
      }
      const { ymd: localYmd /* , hour: localHour */ } = wall;

      const { data: sessions, error: shErr } = await supabase
        .from("session_history")
        .select("session_date, payload")
        .eq("patient_id", p.id)
        .eq("session_date", localYmd);

      if (shErr) {
        errors.push(`${p.id}: session_history ${shErr.message}`);
        continue;
      }

      const hasWorkToday = (sessions ?? []).some((s: { payload: unknown }) =>
        payloadHasWork(s.payload)
      );

      let sentSomething = false;

      if (
        !hasWorkToday &&
        p.last_activity_timestamp &&
        nowMs - new Date(p.last_activity_timestamp).getTime() <= threeHoursMs &&
        /* TESTING: quiet hours disabled — restore: localHour >= 8 && localHour <= 20 */
        p.last_momentum_reminder_local_date !== localYmd
      ) {
        const r = await sendPatientReminder(token, MOMENTUM_BODY);
        if (r.ok) {
          await supabase
            .from("patients")
            .update({ last_momentum_reminder_local_date: localYmd })
            .eq("id", p.id);
          momentumSent += 1;
          sentSomething = true;
        } else {
          errors.push(`${p.id}: momentum ${r.detail ?? "push failed"}`);
        }
      }

      if (
        !hasWorkToday &&
        !sentSomething &&
        /* TESTING: standard reminder hour disabled — restore: localHour === 20 */
        p.last_standard_reminder_local_date !== localYmd
      ) {
        const r = await sendPatientReminder(token, STANDARD_BODY);
        if (r.ok) {
          await supabase
            .from("patients")
            .update({ last_standard_reminder_local_date: localYmd })
            .eq("id", p.id);
          standardSent += 1;
        } else {
          errors.push(`${p.id}: standard ${r.detail ?? "push failed"}`);
        }
      }
    }

    return jsonResponse({
      ok: true,
      at: nowIso,
      momentumSent,
      standardSent,
      skippedPatientsWithoutDeliverableToken: skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message, stack: error.stack }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
