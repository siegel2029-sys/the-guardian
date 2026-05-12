import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Hourly reminder dispatcher: "momentum" (recent activity, no session yet today) vs 8pm local standard.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto in Supabase), CRON_SECRET (set manually).
 * Schedule an HTTP POST to this function every hour with header `x-physioshield-cron: <CRON_SECRET>`
 * (Dashboard → Edge Functions → Schedules, or external cron).
 *
 * Sends via Expo Push API. Client tokens must be `ExponentPushToken[...]` for delivery; the Vite
 * web app persists browser placeholders unless a native bridge sets `globalThis.__EXPO_PUSH_TOKEN__`.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-physioshield-cron, content-type",
};

const MOMENTUM_BODY =
  "You're already here! Want to complete your exercises now while you're at it?";
const STANDARD_BODY = "Time for your daily recovery. Let's get moving!";

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
  const r = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const hdr = req.headers.get("x-physioshield-cron") ?? "";
  if (!cronSecret || hdr !== cronSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "missing_supabase_env" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const threeHoursMs = 3 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const { data: patients, error: listErr } = await admin
    .from("patients")
    .select(
      "id, push_token, last_activity_timestamp, reminder_timezone, last_momentum_reminder_local_date, last_standard_reminder_local_date",
    )
    .not("auth_user_id", "is", null);

  if (listErr) {
    return jsonResponse({ error: listErr.message }, 500);
  }

  let momentumSent = 0;
  let standardSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of patients ?? []) {
    const p = row as PatientRow;
    const token = (p.push_token ?? "").trim();
    if (!token || !isExpoPushToken(token)) {
      skipped += 1;
      continue;
    }

    const tz = (p.reminder_timezone ?? "UTC").trim() || "UTC";
    const wall = localWallParts(nowIso, tz);
    if (!wall) {
      skipped += 1;
      continue;
    }
    const { ymd: localYmd, hour: localHour } = wall;

    const { data: sessions, error: shErr } = await admin
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
      localHour >= 8 &&
      localHour <= 20 &&
      p.last_momentum_reminder_local_date !== localYmd
    ) {
      const r = await sendExpoPush(token, MOMENTUM_BODY);
      if (r.ok) {
        await admin
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
      localHour === 20 &&
      p.last_standard_reminder_local_date !== localYmd
    ) {
      const r = await sendExpoPush(token, STANDARD_BODY);
      if (r.ok) {
        await admin
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
    skippedPatientsWithoutExpoToken: skipped,
    errors: errors.slice(0, 20),
  });
});
