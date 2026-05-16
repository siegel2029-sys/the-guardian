import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Hourly reminder dispatcher: "momentum" (recent activity, no session yet today) vs 8pm local standard.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), INTERNAL_CRON_SECRET, EXPO_ACCESS_TOKEN (Expo Push API).
 * With `--no-verify-jwt`, auth requires `INTERNAL_CRON_SECRET` via header `x-cron-secret` **or** query `?secret=`.
 * Unexpected handler errors return HTTP 200 with JSON `{ ok: false, error, stack }`.
 *
 * Reads `patients.push_token` (Expo: `ExponentPushToken[...]`). Sends via Expo Push API with `Authorization: Bearer`.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
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
        localHour >= 8 &&
        localHour <= 20 &&
        p.last_momentum_reminder_local_date !== localYmd
      ) {
        const r = await sendExpoPush(token, MOMENTUM_BODY);
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
        localHour === 20 &&
        p.last_standard_reminder_local_date !== localYmd
      ) {
        const r = await sendExpoPush(token, STANDARD_BODY);
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
      skippedPatientsWithoutExpoToken: skipped,
      errors: errors.slice(0, 20),
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message, stack: error.stack }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
