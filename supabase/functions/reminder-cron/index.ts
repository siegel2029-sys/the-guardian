import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

/**
 * Hourly reminder dispatcher: "momentum" (recent activity, no session yet today) vs 8pm local standard.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), INTERNAL_CRON_SECRET, EXPO_ACCESS_TOKEN (Expo Push API).
 * **Web Push (HTTPS subscription URLs — FCM, Apple Safari, Firefox, etc.):** set `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`
 * (same pair as the web client — public key must match `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`). Optional `WEB_PUSH_VAPID_SUBJECT`
 * (contact JWT claim), default `mailto:noreply@physioshield.app`. Keys live in `patients.payload.webPushSubscription`.
 *
 * With `--no-verify-jwt`, auth requires `INTERNAL_CRON_SECRET` via header `x-cron-secret` **or** query `?secret=`.
 * Unexpected handler errors return HTTP 200 with JSON `{ ok: false, error, stack }`.
 *
 * Reads `patients.push_token`: Expo via Expo API; HTTPS Web Push subscription URLs (FCM, Apple `web.push.apple.com`, Mozilla, etc.) via `web-push` (VAPID + encrypted body).
 *
 * **Testing:** `test_now=true` (URL or JSON body) runs the main loop with **full bypass**: local hour, quiet hours,
 * 3-hour activity window, and daily lock columns are ignored; sends `TEST_NOW_BODY` per eligible patient (still skips if
 * `session_history` shows work today). Targeted `patient_id` returns immediately with one test send.
 * Optional `{ "verbose_reminders": true }` adds extra diagnostic lines on the production path.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Standard reminder fires only at this local hour (24h), using each patient's `reminder_timezone`. */
const STANDARD_REMINDER_LOCAL_HOUR = 20;
/** Momentum nudges allowed from this hour (inclusive) until `STANDARD_REMINDER_LOCAL_HOUR` (exclusive). */
const MOMENTUM_WINDOW_START_HOUR = 8;

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
  first_name?: string | null;
  push_token: string | null;
  /** Includes `webPushSubscription` (keys) for VAPID Web Push. */
  payload: unknown;
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

/** Any HTTPS subscription endpoint (Chrome/FCM, Safari/iOS `web.push.apple.com`, Firefox autopush, etc.). */
function isWebPushEndpoint(token: string): boolean {
  return token.trim().toLowerCase().startsWith("https://");
}

function hasDeliverableReminderToken(token: string): boolean {
  const t = token.trim();
  return t.length > 0 && (isExpoPushToken(t) || isWebPushEndpoint(t));
}

function patientDisplayName(p: { id: string; first_name?: string | null }): string {
  const n = typeof p.first_name === "string" ? p.first_name.trim() : "";
  return n.length > 0 ? n : p.id;
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

/**
 * Some DB exports / legacy writes store JSON columns as **text**.
 * Unwrap string → object once (or pass through if already a plain object).
 */
function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function trimStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return "";
}

function payloadHasWork(payload: unknown): boolean {
  const coerced = coerceJsonRecord(payload);
  if (!coerced) return false;
  const o = coerced;
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

/** Strip BOM/quotes/whitespace so dashboard-copied secrets match `web-push` expectations. */
function normalizeVapidKeyEnv(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, "");
}

/** Configure once per isolate; signs outbound Web Push with the VAPID private key. */
let webPushVapidConfigured = false;

function ensureWebPushVapid(): { ok: true } | { ok: false; detail: string } {
  if (webPushVapidConfigured) return { ok: true };

  const publicKey = normalizeVapidKeyEnv(Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "");
  const privateKey = normalizeVapidKeyEnv(Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "");
  const subject =
    Deno.env.get("WEB_PUSH_VAPID_SUBJECT")?.trim() || "mailto:noreply@physioshield.app";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      detail:
        "Missing WEB_PUSH_VAPID_PUBLIC_KEY or WEB_PUSH_VAPID_PRIVATE_KEY. Public must match VITE_WEB_PUSH_VAPID_PUBLIC_KEY. " +
        "Generate: npx web-push generate-vapid-keys",
    };
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  webPushVapidConfigured = true;
  return { ok: true };
}

function parseWebPushSubscriptionFromPayload(
  patientPayload: unknown,
  pushTokenEndpoint: string,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const tokenEndpoint = pushTokenEndpoint.trim();

  const root = coerceJsonRecord(patientPayload);
  if (!root) return null;

  const rawSub =
    root.webPushSubscription ??
    root.web_push_subscription ??
    root.WebPushSubscription;

  const sub = coerceJsonRecord(rawSub);
  if (!sub) return null;

  const rawKeys = sub.keys ?? sub.Keys;
  const keysObj = coerceJsonRecord(rawKeys);
  if (!keysObj) return null;

  const p256dh =
    trimStr(keysObj.p256dh) ||
    trimStr(keysObj.P256DH);
  const auth =
    trimStr(keysObj.auth) ||
    trimStr(keysObj.Auth);
  if (!p256dh || !auth) return null;

  const jsonEndpoint = trimStr(sub.endpoint);
  /** `push_token` is usually the subscription URL; fall back to payload if column is empty. */
  const endpoint = tokenEndpoint || jsonEndpoint;
  if (!endpoint) return null;

  if (jsonEndpoint && tokenEndpoint && jsonEndpoint !== tokenEndpoint) {
    console.warn(
      "reminder-cron: push_token URL differs from payload.webPushSubscription.endpoint; using push_token",
    );
  }

  return { endpoint, keys: { p256dh, auth } };
}

async function sendWebPushVapid(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string,
  body: string,
): Promise<{ ok: boolean; detail?: string }> {
  const vapid = ensureWebPushVapid();
  if (!vapid.ok) return vapid;

  try {
    await webPush.sendNotification(subscription, JSON.stringify({ title, body }), {
      TTL: 86_400,
      urgency: "high",
    });
    return { ok: true };
  } catch (e: unknown) {
    let detail = e instanceof Error ? e.message : String(e);
    if (e && typeof e === "object" && "body" in e) {
      const b = (e as { body?: string }).body;
      if (typeof b === "string" && b.length > 0) detail = b.slice(0, 500);
    }
    const statusCode = (e as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number") detail = `HTTP ${statusCode}: ${detail}`;
    return { ok: false, detail };
  }
}

async function sendPatientReminder(
  token: string,
  expoBody: string,
  patientPayload: unknown,
): Promise<{ ok: boolean; detail?: string }> {
  if (isWebPushEndpoint(token)) {
    const sub = parseWebPushSubscriptionFromPayload(patientPayload, token);
    if (!sub) {
      return {
        ok: false,
        detail:
          "[web_push_vapid] Web Push requires patients.payload (json/object or JSON string) with webPushSubscription.keys.p256dh and keys.auth. If payload is stored as text, it must parse to an object.",
      };
    }
    const r = await sendWebPushVapid(sub, "Physio-Shield", expoBody);
    if (!r.ok && r.detail && !r.detail.startsWith("[web_push_vapid]")) {
      return { ok: false, detail: `[web_push_vapid] ${r.detail}` };
    }
    return r;
  }
  const r = await sendExpoPush(token, expoBody);
  if (!r.ok && r.detail && !r.detail.startsWith("[expo_push]")) {
    return { ok: false, detail: `[expo_push] ${r.detail}` };
  }
  return r;
}

/** POST/PATCH/PUT JSON body flags (empty object if none). Consumes the request body once. */
async function parseCronJsonBody(req: Request): Promise<{
  test_now: boolean;
  test_patient_id: string | null;
  verbose_reminders: boolean;
}> {
  const empty = { test_now: false, test_patient_id: null, verbose_reminders: false };
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return empty;
  }
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return empty;
  }
  try {
    const raw = await req.text();
    if (!raw.trim()) return empty;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const pidRaw = j.patient_id ?? j.test_patient_id;
    const test_patient_id =
      typeof pidRaw === "string" && pidRaw.trim().length > 0 ? pidRaw.trim() : null;
    return {
      test_now: j.test_now === true,
      test_patient_id,
      verbose_reminders: j.verbose_reminders === true,
    };
  } catch {
    return empty;
  }
}

/** Merge JSON body flags with URL query (?test_now=true, ?patient_id=). */
function mergeCronFlagsFromUrl(
  body: Awaited<ReturnType<typeof parseCronJsonBody>>,
  url: URL,
): {
  test_now: boolean;
  test_patient_id: string | null;
  verbose_reminders: boolean;
} {
  const test_now =
    body.test_now || url.searchParams.get("test_now") === "true";
  const pidUrl =
    url.searchParams.get("patient_id")?.trim() ||
    url.searchParams.get("test_patient_id")?.trim() ||
    null;
  const test_patient_id = body.test_patient_id ?? pidUrl;
  return {
    test_now,
    test_patient_id,
    verbose_reminders: body.verbose_reminders,
  };
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

async function runReminderDispatch(params: {
  supabase: ReturnType<typeof createClient>;
  patients: PatientRow[];
  nowIso: string;
  nowMs: number;
  reminderTestBypass: boolean;
  verboseReminders: boolean;
}): Promise<{
  momentumSent: number;
  standardSent: number;
  skipped: number;
  errors: string[];
  testBypassSent: number;
}> {
  const { supabase, patients, nowIso, nowMs, reminderTestBypass, verboseReminders } = params;

  let momentumSent = 0;
  let standardSent = 0;
  let skipped = 0;
  let testBypassSent = 0;
  const errors: string[] = [];

  if (reminderTestBypass) {
    console.log(
      "[reminder-cron] test_now=true main loop: bypassing local hour, quiet hours, 3-hour activity window, and daily lock columns; sending TEST_NOW_BODY per eligible patient (still skips if session work exists today).",
    );
  }

  if (verboseReminders && !reminderTestBypass) {
    console.log("[reminder-cron] verbose_reminders=true — extra diagnostics enabled.");
  }

  for (const row of patients) {
    const p = row;
    const token = (p.push_token ?? "").trim();
    const label = patientDisplayName(p);

    if (!hasDeliverableReminderToken(token)) {
      skipped += 1;
      if (verboseReminders) {
        console.log(`[reminder-cron] Skipping patient ${label} (${p.id}): no_deliverable_push_token`);
      }
      continue;
    }

    const tz = (p.reminder_timezone ?? "UTC").trim() || "UTC";
    const wall = localWallParts(nowIso, tz);
    if (!wall) {
      skipped += 1;
      console.log(`[reminder-cron] Checking patient: ${label} (${p.id})`);
      console.log(`[reminder-cron]   Has work today? (skipped — invalid timezone)`);
      console.log(
        `[reminder-cron]   Reason for skipping: invalid_reminder_timezone_wall_clock (${tz})`,
      );
      continue;
    }
    const { ymd: localYmd, hour: localHour } = wall;

    const msSinceActivity = p.last_activity_timestamp
      ? nowMs - new Date(p.last_activity_timestamp).getTime()
      : Number.POSITIVE_INFINITY;
    const hoursSinceActivity =
      p.last_activity_timestamp != null && Number.isFinite(msSinceActivity)
        ? msSinceActivity / 3_600_000
        : null;
    const within3h =
      p.last_activity_timestamp != null &&
      Number.isFinite(msSinceActivity) &&
      msSinceActivity <= THREE_HOURS_MS &&
      msSinceActivity >= 0;

    console.log(`[reminder-cron] Checking patient: ${label} (${p.id})`);

    if (reminderTestBypass && isWebPushEndpoint(token)) {
      console.log(`[reminder-cron] Patient ${label} has a valid Web Push endpoint: ${token}`);
    }

    const { data: sessions, error: shErr } = await supabase
      .from("session_history")
      .select("session_date, payload")
      .eq("patient_id", p.id)
      .eq("session_date", localYmd);

    if (shErr) {
      errors.push(`${p.id}: session_history ${shErr.message}`);
      console.log(`[reminder-cron]   Has work today? unknown (session_history query failed)`);
      console.log(`[reminder-cron]   Reason for skipping sends: ${shErr.message}`);
      continue;
    }

    const hasWorkToday = (sessions ?? []).some((s: { payload: unknown }) =>
      payloadHasWork(s.payload)
    );

    console.log(`[reminder-cron]   Has work today? ${hasWorkToday}`);

    if (reminderTestBypass) {
      console.log(
        `[reminder-cron] Patient ${label}: Local hour is ${localHour}. test_now active — bypassing schedule & daily locks; session gate only.`,
      );
    } else {
      console.log(
        `[reminder-cron] Patient ${label}: Local hour is ${localHour}. Checking eligibility for Standard/Momentum...`,
      );
    }

    console.log(
      `[reminder-cron]   Momentum check: Last activity was ${
        hoursSinceActivity === null ? "unknown (no timestamp)" : `${hoursSinceActivity.toFixed(2)}`
      } hours ago. Is it within 3 hours? ${within3h}`,
    );
    console.log(
      `[reminder-cron]   Daily lock: momentum_date=${p.last_momentum_reminder_local_date ?? "null"}, standard_date=${p.last_standard_reminder_local_date ?? "null"}. Local day is ${localYmd}.`,
    );

    if (reminderTestBypass) {
      if (hasWorkToday) {
        console.log(
          `[reminder-cron]   Test bypass: skip send — patient already has qualifying session work today (${localYmd}).`,
        );
        continue;
      }
      console.log(
        `[reminder-cron]   Test bypass: sending TEST_NOW_BODY (ignoring schedule, 3h window, daily locks; not updating lock columns).`,
      );
      const r = await sendPatientReminder(token, TEST_NOW_BODY, p.payload);
      console.log(
        `[reminder-cron]   Test bypass send result: ${r.ok ? "sent_ok" : r.detail ?? "failed"}`,
      );
      if (r.ok) {
        testBypassSent += 1;
      } else {
        errors.push(`${p.id}: test_bypass ${r.detail ?? "push failed"}`);
      }
      continue;
    }

    let momentumDelivered = false;
    let sentSomething = false;
    let standardDelivered = false;

    const inMomentumDayWindow =
      localHour >= MOMENTUM_WINDOW_START_HOUR &&
      localHour < STANDARD_REMINDER_LOCAL_HOUR;

    console.log(
      `[reminder-cron]   Momentum quiet-hours: local hour ${localHour} must be in [${MOMENTUM_WINDOW_START_HOUR}, ${STANDARD_REMINDER_LOCAL_HOUR}) → ${inMomentumDayWindow ? "eligible window" : "outside window (no momentum nudge)"}.`,
    );
    console.log(
      `[reminder-cron]   Standard schedule: sends only when local hour === ${STANDARD_REMINDER_LOCAL_HOUR} (currently ${localHour}).`,
    );

    const momentumBlockedReasons: string[] = [];
    if (hasWorkToday) momentumBlockedReasons.push("has_work_today");
    if (!p.last_activity_timestamp) momentumBlockedReasons.push("missing_last_activity_timestamp");
    if (p.last_activity_timestamp && !within3h) {
      momentumBlockedReasons.push(
        `last_activity_older_than_3h (${Math.round(msSinceActivity / 60000)} min ago)`,
      );
    }
    if (p.last_momentum_reminder_local_date === localYmd) {
      momentumBlockedReasons.push(`already_sent_momentum_today (${localYmd})`);
    }
    if (!inMomentumDayWindow) {
      momentumBlockedReasons.push(
        `outside_momentum_quiet_window (hour ${localHour}; need ${MOMENTUM_WINDOW_START_HOUR}≤H<${STANDARD_REMINDER_LOCAL_HOUR})`,
      );
    }

    const momentumEligible =
      !hasWorkToday &&
      Boolean(p.last_activity_timestamp) &&
      within3h &&
      p.last_momentum_reminder_local_date !== localYmd &&
      inMomentumDayWindow;

    if (verboseReminders && !hasWorkToday && !momentumEligible) {
      console.log(
        `[reminder-cron]   Momentum not sent; blocking factors: ${momentumBlockedReasons.join("; ") || "none listed"}`,
      );
    }

    if (
      !hasWorkToday &&
      p.last_activity_timestamp &&
      nowMs - new Date(p.last_activity_timestamp).getTime() <= THREE_HOURS_MS &&
      p.last_momentum_reminder_local_date !== localYmd &&
      inMomentumDayWindow
    ) {
      console.log(
        `[reminder-cron]   Branch: attempting momentum reminder (within 3h + quiet-hours window + daily lock OK).`,
      );
      const r = await sendPatientReminder(token, MOMENTUM_BODY, p.payload);
      console.log(
        `[reminder-cron]   Momentum send result: ${r.ok ? "sent_ok" : r.detail ?? "failed"}`,
      );
      if (r.ok) {
        await supabase
          .from("patients")
          .update({ last_momentum_reminder_local_date: localYmd })
          .eq("id", p.id);
        momentumSent += 1;
        momentumDelivered = true;
        sentSomething = true;
      } else {
        errors.push(`${p.id}: momentum ${r.detail ?? "push failed"}`);
      }
    } else if (!hasWorkToday) {
      console.log(
        `[reminder-cron]   Branch: momentum skipped — falling through to standard eligibility check.`,
      );
    }

    const standardBlockedReasons: string[] = [];
    if (hasWorkToday) standardBlockedReasons.push("has_work_today");
    if (sentSomething) standardBlockedReasons.push("momentum_already_sent_this_pass");
    if (p.last_standard_reminder_local_date === localYmd) {
      standardBlockedReasons.push(`already_sent_standard_today (${localYmd})`);
    }
    if (localHour !== STANDARD_REMINDER_LOCAL_HOUR) {
      standardBlockedReasons.push(
        `standard_only_at_local_hour_${STANDARD_REMINDER_LOCAL_HOUR}_current_${localHour}`,
      );
    }

    const standardEligible =
      !hasWorkToday &&
      !sentSomething &&
      localHour === STANDARD_REMINDER_LOCAL_HOUR &&
      p.last_standard_reminder_local_date !== localYmd;

    if (verboseReminders && !standardEligible && !sentSomething && !hasWorkToday) {
      console.log(
        `[reminder-cron]   Standard not sent; blocking factors: ${standardBlockedReasons.join("; ") || "unknown"}`,
      );
    }

    if (
      !hasWorkToday &&
      !sentSomething &&
      localHour === STANDARD_REMINDER_LOCAL_HOUR &&
      p.last_standard_reminder_local_date !== localYmd
    ) {
      console.log(
        `[reminder-cron]   Branch: attempting standard reminder (local hour ${STANDARD_REMINDER_LOCAL_HOUR}).`,
      );
      const r = await sendPatientReminder(token, STANDARD_BODY, p.payload);
      console.log(
        `[reminder-cron]   Standard send result: ${r.ok ? "sent_ok" : r.detail ?? "failed"}`,
      );
      if (r.ok) {
        await supabase
          .from("patients")
          .update({ last_standard_reminder_local_date: localYmd })
          .eq("id", p.id);
        standardSent += 1;
        standardDelivered = true;
      } else {
        errors.push(`${p.id}: standard ${r.detail ?? "push failed"}`);
      }
    }

    if (
      verboseReminders &&
      !hasWorkToday &&
      !momentumDelivered &&
      !standardDelivered
    ) {
      console.log(
        `[reminder-cron]   Outcome: no push delivered this iteration (see momentum/standard logs above).`,
      );
    }
  }

  return { momentumSent, standardSent, skipped, errors, testBypassSent };
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
      "VAPID pub:",
      !!Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY"),
      "VAPID prv:",
      !!Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY"),
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

    const bodyFlags = await parseCronJsonBody(req);
    const { test_now, test_patient_id, verbose_reminders } = mergeCronFlagsFromUrl(bodyFlags, url);

    if (test_now && test_patient_id) {
      type TestPatientRow = {
        id: string;
        push_token: string | null;
        payload: unknown;
        first_name?: string | null;
        auth_user_id?: string | null;
      };

      const { data: targeted, error: targetedErr } = await supabase
        .from("patients")
        .select("id, push_token, payload, first_name, auth_user_id")
        .eq("id", test_patient_id)
        .maybeSingle();

      if (targetedErr) {
        return jsonResponse({ ok: false, test_now: true, error: targetedErr.message }, 503);
      }

      if (!targeted) {
        return jsonResponse({
          ok: true,
          test_now: true,
          sent: false,
          reason: "patient_not_found",
          patientId: test_patient_id,
        });
      }

      const tp = targeted as TestPatientRow;
      const label = patientDisplayName(tp);
      console.log(`[reminder-cron test_now] Checking patient: ${label} (${tp.id})`);
      if (!tp.auth_user_id) {
        console.warn(
          `[reminder-cron test_now] Patient ${tp.id} has null auth_user_id — still sending test push (targeted mode).`,
        );
      }

      const tt = (tp.push_token ?? "").trim();
      if (!hasDeliverableReminderToken(tt)) {
        console.log(
          `[reminder-cron test_now] Reason for skipping: no_deliverable_push_token (Expo or HTTPS Web Push URL required)`,
        );
        return jsonResponse({
          ok: true,
          test_now: true,
          sent: false,
          reason: "no_deliverable_push_token",
          patientId: tp.id,
          patientLabel: label,
        });
      }

      if (isWebPushEndpoint(tt)) {
        console.log(`[reminder-cron] Patient ${label} has a valid Web Push endpoint: ${tt}`);
      }

      console.log(`[reminder-cron test_now] Sending test push (targeted; ignores schedule, quiet hours, daily locks).`);
      const r = await sendPatientReminder(tt, TEST_NOW_BODY, tp.payload);
      return jsonResponse({
        ok: true,
        test_now: true,
        sent: r.ok,
        patientId: tp.id,
        patientLabel: label,
        channel: isWebPushEndpoint(tt) ? "web_push" : "expo",
        ...(r.ok ? {} : { deliveryError: r.detail }),
      });
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    /** When `test_now` without `patient_id`: main loop bypasses local hour, quiet hours, 3h window, and daily locks. */
    const reminderTestBypass = test_now;

    const { data: patients, error: listErr } = await supabase
      .from("patients")
      .select(
        "id, first_name, push_token, payload, last_activity_timestamp, reminder_timezone, last_momentum_reminder_local_date, last_standard_reminder_local_date",
      )
      .not("auth_user_id", "is", null);

    if (listErr) {
      return jsonResponse({ ok: false, error: listErr.message }, 503);
    }

    const dispatch = await runReminderDispatch({
      supabase,
      patients: patients ?? [],
      nowIso,
      nowMs,
      reminderTestBypass,
      verboseReminders: verbose_reminders,
    });

    return jsonResponse({
      ok: true,
      at: nowIso,
      test_now,
      test_main_loop_bypass: reminderTestBypass,
      testBypassSent: dispatch.testBypassSent,
      momentumSent: dispatch.momentumSent,
      standardSent: dispatch.standardSent,
      skippedPatientsWithoutDeliverableToken: dispatch.skipped,
      errors: dispatch.errors.slice(0, 20),
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message, stack: error.stack }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
