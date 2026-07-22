import { createClient } from "npm:@supabase/supabase-js@2";
import {
  coerceJsonRecord,
  hasDeliverableReminderToken,
  isWebPushEndpoint,
  markPatientPushTokenStale,
  sendPatientReminder,
} from "../_shared/patientPushDelivery.ts";
import {
  mergePatientPayloadFields,
  patientPayloadBlocksAutomatedReminders,
  patientReminderMetaFromRow,
  REMINDER_BLOCKED_PATIENT_STATUSES,
  type PatientReminderMeta,
} from "../_shared/patientPayloadMeta.ts";

/**
 * Hourly reminder dispatcher: "momentum" (recent activity, no session yet today) vs 8pm local standard.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), INTERNAL_CRON_SECRET, EXPO_ACCESS_TOKEN (Expo Push API).
 * **Web Push (HTTPS subscription URLs — FCM, Apple Safari, Firefox, etc.):** set `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`
 * (same pair as the web client — public key must match `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`). Optional `WEB_PUSH_VAPID_SUBJECT`
 * (contact JWT claim), default `mailto:noreply@physioshield.app`. Keys live in `patients.payload.webPushSubscription`.
 *
 * With `--no-verify-jwt`, auth requires `INTERNAL_CRON_SECRET` via header `x-cron-secret` only
 * (query-string secrets are rejected — they leak into proxy/access logs).
 * Global auth/env failures abort before the patient loop; per-patient errors are isolated and never crash
 * the batch. The handler returns HTTP 200 with an execution summary after the loop (global setup failures
 * still return 4xx/5xx). Unexpected outer handler errors return HTTP 500 with a generic JSON error.
 *
 * Reads `payload.pushToken`: Expo via Expo API; HTTPS Web Push subscription URLs (FCM, Apple `web.push.apple.com`, Mozilla, etc.) via `web-push` (VAPID + encrypted body).
 *
 * **Testing:** `test_now=true` (URL or JSON body) runs the main loop with **full bypass**: local hour, quiet hours,
 * 3-hour activity window, and daily lock columns are ignored; sends `TEST_NOW_BODY` per eligible patient (still skips if
 * `session_history` shows work today). Targeted `patient_id` returns immediately with one test send.
 * Optional `{ "verbose_reminders": true }` adds extra diagnostic lines on the production path.
 */

/** Standard reminder fires only at this local hour (24h), using each patient's `payload.reminderTimezone`. */
const STANDARD_REMINDER_LOCAL_HOUR = 20;
/** Momentum nudges allowed from this hour (inclusive) until `MOMENTUM_WINDOW_END_HOUR` (exclusive). */
const MOMENTUM_WINDOW_START_HOUR = 8;
/** Latest local hour (exclusive) for momentum nudges; operational quiet hours begin at 22:00. */
const MOMENTUM_WINDOW_END_HOUR = 22;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
};

const MOMENTUM_BODY =
  "You're already here! Want to complete your exercises now while you're at it?";
const STANDARD_BODY =
  "הגיע הזמן לאימון היום, הדרך לשיקום מתחילה מצעד קטן";
/** One-off test push when JSON body has `"test_now": true`. */
const TEST_NOW_BODY = "[TEST] Physio-Shield reminder-cron ping — you can ignore this.";

type PatientRow = PatientReminderMeta;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function patientDisplayName(p: PatientRow): string {
  return p.displayName;
}

async function persistReminderLockInPayload(
  supabase: ReturnType<typeof createClient>,
  patient: PatientRow,
  fields: Record<string, unknown>,
): Promise<void> {
  const merged = mergePatientPayloadFields(patient.payload, fields);
  if (!merged) {
    console.warn(`[reminder-cron] Skipped payload lock update — unreadable payload for ${patient.id}`);
    return;
  }
  const { error } = await supabase
    .from("patients")
    .update({ payload: merged })
    .eq("id", patient.id);
  if (error) {
    console.warn(`[reminder-cron] payload lock update failed for ${patient.id}: ${error.message}`);
  }
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
/**
 * A web-push gateway can return `sent_ok` while the device silently drops the notification because the
 * OS/browser has throttled or evicted a long-idle service worker. We can't see that from the gateway,
 * but we surface it as a diagnostic so a "successful but silent" delivery is explainable in the logs.
 */
const STALE_ACTIVITY_WARN_HOURS = 72;

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
  totalScanned: number;
  sentSuccess: number;
  sentFailed: number;
  failedDetails: Array<{ id: string; name?: string; error: string }>;
}> {
  const { supabase, patients, nowIso, nowMs, reminderTestBypass, verboseReminders } = params;

  let momentumSent = 0;
  let standardSent = 0;
  let skipped = 0;
  let testBypassSent = 0;
  const errors: string[] = [];

  let totalScanned = patients.length;
  let sentSuccess = 0;
  let sentFailed = 0;
  const failedDetails: Array<{ id: string; name?: string; error: string }> = [];

  const deliverableCount = patients.filter((p) =>
    hasDeliverableReminderToken(p.pushToken.trim())
  ).length;
  console.log(
    `[reminder-cron] Tokens resolved: ${deliverableCount} deliverable / ${patients.length} patients scanned.`,
  );

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
    const label = patientDisplayName(p);

    try {
      const token = p.pushToken.trim();

      if (!hasDeliverableReminderToken(token)) {
        skipped += 1;
        if (verboseReminders) {
          console.log(`[reminder-cron] Skipping patient ${label} (${p.id}): no_deliverable_push_token`);
        }
        continue;
      }

      const tz = p.reminderTimezone.trim() || "UTC";
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

      const msSinceActivity = p.lastLoginAt
        ? nowMs - new Date(p.lastLoginAt).getTime()
        : Number.POSITIVE_INFINITY;
      const hoursSinceActivity =
        p.lastLoginAt != null && Number.isFinite(msSinceActivity)
          ? msSinceActivity / 3_600_000
          : null;
      const within3h =
        p.lastLoginAt != null &&
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
        throw new Error(`session_history ${shErr.message}`);
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
        `[reminder-cron]   Daily lock: momentum_date=${p.lastMomentumReminderLocalDate ?? "null"}, standard_date=${p.lastStandardReminderLocalDate ?? "null"}. Local day is ${localYmd}.`,
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
          sentSuccess += 1;
        } else {
          throw new Error(`test_bypass ${r.detail ?? "push failed"}`);
        }
        continue;
      }

      let momentumDelivered = false;
      let sentSomething = false;
      let standardDelivered = false;

      const inMomentumDayWindow =
        localHour >= MOMENTUM_WINDOW_START_HOUR &&
        localHour < MOMENTUM_WINDOW_END_HOUR;

      console.log(
        `[reminder-cron]   Momentum quiet-hours: local hour ${localHour} must be in [${MOMENTUM_WINDOW_START_HOUR}, ${MOMENTUM_WINDOW_END_HOUR}) → ${inMomentumDayWindow ? "eligible window" : "outside window (no momentum nudge)"}.`,
      );
      console.log(
        `[reminder-cron]   Standard schedule: sends only when local hour === ${STANDARD_REMINDER_LOCAL_HOUR} (currently ${localHour}).`,
      );

      const momentumBlockedReasons: string[] = [];
      if (hasWorkToday) momentumBlockedReasons.push("has_work_today");
      if (!p.lastLoginAt) momentumBlockedReasons.push("missing_last_login_at");
      if (p.lastLoginAt && !within3h) {
        momentumBlockedReasons.push(
          `last_login_older_than_3h (${Math.round(msSinceActivity / 60000)} min ago)`,
        );
      }
      if (p.lastMomentumReminderLocalDate === localYmd) {
        momentumBlockedReasons.push(`already_sent_momentum_today (${localYmd})`);
      }
      if (!inMomentumDayWindow) {
        momentumBlockedReasons.push(
          `outside_momentum_quiet_window (hour ${localHour}; need ${MOMENTUM_WINDOW_START_HOUR}≤H<${MOMENTUM_WINDOW_END_HOUR})`,
        );
      }

      const momentumEligible =
        !hasWorkToday &&
        Boolean(p.lastLoginAt) &&
        within3h &&
        p.lastMomentumReminderLocalDate !== localYmd &&
        inMomentumDayWindow;

      if (verboseReminders && !hasWorkToday && !momentumEligible) {
        console.log(
          `[reminder-cron]   Momentum not sent; blocking factors: ${momentumBlockedReasons.join("; ") || "none listed"}`,
        );
      }

      if (
        !hasWorkToday &&
        p.lastLoginAt &&
        nowMs - new Date(p.lastLoginAt).getTime() <= THREE_HOURS_MS &&
        p.lastMomentumReminderLocalDate !== localYmd &&
        inMomentumDayWindow
      ) {
        console.log(
          `[reminder-cron]   Branch: attempting momentum reminder (within 3h + quiet-hours window + daily lock OK).`,
        );
        const r = await sendPatientReminder(token, MOMENTUM_BODY, p.payload);
        console.log(
          `[reminder-cron]   Gateway response (momentum) for ${label}: ${r.ok ? "sent_ok" : r.detail ?? "failed"}${
            r.statusCode ? ` [HTTP ${r.statusCode}]` : ""
          }${r.stale ? " [STALE → clearing token]" : ""}`,
        );
        if (r.ok) {
          await persistReminderLockInPayload(supabase, p, {
            lastMomentumReminderLocalDate: localYmd,
          });
          momentumSent += 1;
          momentumDelivered = true;
          sentSomething = true;
          sentSuccess += 1;
        } else {
          if (r.stale) {
            await markPatientPushTokenStale(supabase, p.id, `momentum: ${r.detail ?? "stale"}`);
          }
          throw new Error(`momentum ${r.detail ?? "push failed"}`);
        }
      } else if (!hasWorkToday) {
        console.log(
          `[reminder-cron]   Branch: momentum skipped — falling through to standard eligibility check.`,
        );
      }

      const standardBlockedReasons: string[] = [];
      if (hasWorkToday) standardBlockedReasons.push("has_work_today");
      if (sentSomething) standardBlockedReasons.push("momentum_already_sent_this_pass");
      if (p.lastStandardReminderLocalDate === localYmd) {
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
        p.lastStandardReminderLocalDate !== localYmd;

      if (verboseReminders && !standardEligible && !sentSomething && !hasWorkToday) {
        console.log(
          `[reminder-cron]   Standard not sent; blocking factors: ${standardBlockedReasons.join("; ") || "unknown"}`,
        );
      }

      if (
        !hasWorkToday &&
        !sentSomething &&
        localHour === STANDARD_REMINDER_LOCAL_HOUR &&
        p.lastStandardReminderLocalDate !== localYmd
      ) {
        console.log(
          `[reminder-cron]   Branch: attempting standard reminder (local hour ${STANDARD_REMINDER_LOCAL_HOUR}).`,
        );
        const r = await sendPatientReminder(token, STANDARD_BODY, p.payload);
        console.log(
          `[reminder-cron]   Gateway response (standard) for ${label}: ${r.ok ? "sent_ok" : r.detail ?? "failed"}${
            r.statusCode ? ` [HTTP ${r.statusCode}]` : ""
          }${r.stale ? " [STALE → clearing token]" : ""}`,
        );
        if (r.ok) {
          await persistReminderLockInPayload(supabase, p, {
            lastStandardReminderLocalDate: localYmd,
          });
          standardSent += 1;
          standardDelivered = true;
          sentSuccess += 1;
          if (hoursSinceActivity !== null && hoursSinceActivity >= STALE_ACTIVITY_WARN_HOURS) {
            console.warn(
              `[reminder-cron]   Note: standard push reported sent_ok for ${label} (${p.id}) but last activity was ${hoursSinceActivity.toFixed(0)}h ago (>= ${STALE_ACTIVITY_WARN_HOURS}h) — device service worker may be OS-throttled/stale. It will self-heal when the patient next opens the app (auto re-subscribe).`,
            );
          }
        } else {
          if (r.stale) {
            await markPatientPushTokenStale(supabase, p.id, `standard: ${r.detail ?? "stale"}`);
          }
          throw new Error(`standard ${r.detail ?? "push failed"}`);
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
    } catch (patientError: unknown) {
      sentFailed += 1;
      const errorMessage =
        patientError instanceof Error
          ? patientError.message || String(patientError)
          : String(patientError);
      failedDetails.push({
        id: p.id,
        name: label || "Unknown",
        error: errorMessage,
      });
      errors.push(`${p.id}: ${errorMessage}`);
      console.error(`[reminder-cron] ⚠️ Failed for patient ${p.id}:`, patientError);
      continue;
    }
  }

  console.info("==================================================");
  console.info(`[reminder-cron] 📊 CRON EXECUTION SUMMARY REPORT`);
  console.info(`Total Patients Scanned : ${totalScanned}`);
  console.info(`✅ Successfully Sent   : ${sentSuccess}`);
  console.info(`❌ Failed to Send      : ${sentFailed}`);
  if (failedDetails.length > 0) {
    console.info("--- Failure Details ---");
    failedDetails.forEach((fail) => {
      console.info(`• Patient ID: ${fail.id} (${fail.name}) -> Error: ${fail.error}`);
    });
  }
  console.info("==================================================");

  return {
    momentumSent,
    standardSent,
    skipped,
    errors,
    testBypassSent,
    totalScanned,
    sentSuccess,
    sentFailed,
    failedDetails,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Secrets are accepted via the x-cron-secret header only; query-string secrets
  // leak into proxy and load-balancer access logs. Both sides are trimmed before the
  // strict equality check (same hardened pattern as notify-new-message) so stray
  // whitespace from a pasted secret can never cause a silent mismatch.
  const secret = (Deno.env.get("INTERNAL_CRON_SECRET") ?? "").trim();
  const authHeader = req.headers.get("x-cron-secret")?.trim() ?? "";
  const isValid = secret.length > 0 && authHeader === secret;
  if (!isValid) {
    console.error("[reminder-cron] Unauthorized — missing or invalid cron secret (x-cron-secret vs INTERNAL_CRON_SECRET)");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);

  try {

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
      const { data: targeted, error: targetedErr } = await supabase
        .from("patients")
        .select("id, payload, auth_user_id")
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

      if (patientPayloadBlocksAutomatedReminders(targeted.payload)) {
        console.log(
          `[reminder-cron test_now] Skipping patient ${test_patient_id}: blocked_status_or_frozen`,
        );
        return jsonResponse({
          ok: true,
          test_now: true,
          sent: false,
          reason: "blocked_status_or_frozen",
          patientId: test_patient_id,
        });
      }

      const tp = patientReminderMetaFromRow({
        id: String(targeted.id),
        payload: targeted.payload,
      });
      const label = patientDisplayName(tp);
      console.log(`[reminder-cron test_now] Checking patient: ${label} (${tp.id})`);
      if (!targeted.auth_user_id) {
        console.warn(
          `[reminder-cron test_now] Patient ${tp.id} has null auth_user_id — still sending test push (targeted mode).`,
        );
      }

      const tt = tp.pushToken.trim();
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

    // Status / freeze live in JSONB payload (no top-level status column).
    // Exclude frozen / inactive / suspended / paused, and therapist accountFrozen flag.
    const blockedStatusList = `(${REMINDER_BLOCKED_PATIENT_STATUSES.join(",")})`;
    const { data: patients, error: listErr } = await supabase
      .from("patients")
      .select("id, payload")
      .not("auth_user_id", "is", null)
      .or(
        `payload->>status.is.null,payload->>status.not.in.${blockedStatusList}`,
      )
      // Null-safe: absent freeze flag must still be eligible; only explicit true is blocked.
      .or("payload->>accountFrozen.is.null,payload->>accountFrozen.neq.true")
      .or("payload->>account_frozen.is.null,payload->>account_frozen.neq.true");

    if (listErr) {
      return jsonResponse({ ok: false, error: listErr.message }, 503);
    }

    // Defense in depth: re-check payload in case JSON boolean/string quirks bypass PostgREST filters.
    const normalizedPatients = (patients ?? [])
      .filter((row) => !patientPayloadBlocksAutomatedReminders(row.payload))
      .map((row) =>
        patientReminderMetaFromRow({ id: String(row.id), payload: row.payload })
      );

    const dispatch = await runReminderDispatch({
      supabase,
      patients: normalizedPatients,
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
      totalScanned: dispatch.totalScanned,
      sentSuccess: dispatch.sentSuccess,
      sentFailed: dispatch.sentFailed,
      failedDetails: dispatch.failedDetails,
      errors: dispatch.errors.slice(0, 20),
    });
  } catch (error: unknown) {
    // Global/setup failures only — per-patient errors are isolated inside runReminderDispatch.
    // Never return stack traces or internal error details to callers.
    console.error(
      "[reminder-cron] Unhandled error:",
      error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
    );
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
