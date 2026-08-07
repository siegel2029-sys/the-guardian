import { timingSafeEqualString } from "../_shared/timingSafeEqual.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  evaluateProgramReview,
  isDueForProgramReview,
  PROGRAM_REVIEW_WINDOW_DAYS,
  resolveProgramStartYmd,
  type ProgramReviewCatalogCandidate,
  type ProgramReviewExerciseInput,
  type ProgramReviewPainSample,
} from "../_shared/programReviewEngine.ts";
import { corsHeadersFor, isOriginForbidden } from "../_shared/cors.ts";

/**
 * Daily 3-day clinical program review dispatcher.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_CRON_SECRET
 * Auth: header `x-cron-secret` only (query-string secrets rejected).
 * Never auto-applies plan changes — inserts proposals for therapist approval.
 * Declined proposals never block the next cycle (only `pending` piles up via unique index).
 *
 * Logs use opaque patient id prefixes only (never display names — PHI).
 */

function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  const cors = req
    ? corsHeadersFor(req, "authorization, x-cron-secret, content-type")
    : {
      "Access-Control-Allow-Origin": "http://localhost:5173",
      "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
    };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function patientLogRef(id: string): string {
  return id.slice(0, 8);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Clinical day in Asia/Jerusalem (04:00 rollover approximated via local date at cron hour). */
function clinicalTodayYmd(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = parseInt(parts.hour ?? "12", 10);
  let y = parseInt(parts.year, 10);
  let m = parseInt(parts.month, 10);
  let d = parseInt(parts.day, 10);
  if (hour < 4) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function rollingWindow(endYmd: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDaysYmd(endYmd, -i));
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function sessionHasWork(payload: unknown): boolean {
  const p = asRecord(payload);
  if (!p) return false;
  const completed = Array.isArray(p.completedIds) ? p.completedIds : [];
  const reports = Array.isArray(p.finishReports) ? p.finishReports : [];
  const xp = typeof p.sessionXp === "number" ? p.sessionXp : 0;
  return completed.length > 0 || reports.length > 0 || xp > 0;
}

function extractPainSamples(sessionDate: string, payload: unknown): ProgramReviewPainSample[] {
  const p = asRecord(payload);
  if (!p || !Array.isArray(p.finishReports)) return [];
  const out: ProgramReviewPainSample[] = [];
  for (const raw of p.finishReports) {
    const r = asRecord(raw);
    if (!r) continue;
    const exerciseId = typeof r.exerciseId === "string" ? r.exerciseId : "";
    const pain = typeof r.painLevel === "number" ? r.painLevel : null;
    if (!exerciseId || pain == null) continue;
    out.push({ exerciseId, painLevel: pain, sessionDate });
  }
  return out;
}

function mapPlanExercises(raw: unknown): ProgramReviewExerciseInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ProgramReviewExerciseInput[] = [];
  for (const item of raw) {
    const e = asRecord(item);
    if (!e || typeof e.id !== "string") continue;
    const sets =
      typeof e.patientSets === "number"
        ? e.patientSets
        : typeof e.sets === "number"
        ? e.sets
        : 1;
    const reps =
      typeof e.patientReps === "number"
        ? e.patientReps
        : typeof e.reps === "number"
        ? e.reps
        : 0;
    out.push({
      id: e.id,
      name: typeof e.name === "string" ? e.name : e.id,
      sets,
      reps,
      holdSeconds: typeof e.holdSeconds === "number" ? e.holdSeconds : null,
      difficulty: typeof e.difficulty === "number" ? e.difficulty : 2,
      targetArea: typeof e.targetArea === "string"
        ? e.targetArea
        : typeof e.target_area === "string"
        ? e.target_area
        : undefined,
      muscleGroup: typeof e.muscleGroup === "string"
        ? e.muscleGroup
        : typeof e.muscle_group === "string"
        ? e.muscle_group
        : undefined,
      clinicalRegressionHint:
        typeof e.clinicalRegressionHint === "string"
          ? e.clinicalRegressionHint
          : typeof e.clinical_regression_hint === "string"
          ? e.clinical_regression_hint
          : null,
      clinicalProgressionHint:
        typeof e.clinicalProgressionHint === "string"
          ? e.clinicalProgressionHint
          : typeof e.clinical_progression_hint === "string"
          ? e.clinical_progression_hint
          : null,
    });
  }
  return out;
}

function mergeProposedOntoPlan(
  currentPlan: unknown[],
  proposedSlice: Array<Record<string, unknown>>,
): unknown[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of proposedSlice) {
    if (typeof p.id === "string") byId.set(p.id, p);
  }
  const replaced = new Set<string>();
  for (const p of proposedSlice) {
    if (typeof p.replacedExerciseId === "string") replaced.add(p.replacedExerciseId);
  }

  const result: unknown[] = [];
  for (const raw of currentPlan) {
    const e = asRecord(raw);
    if (!e || typeof e.id !== "string") {
      result.push(raw);
      continue;
    }
    if (replaced.has(e.id)) {
      const swap = proposedSlice.find((p) => p.replacedExerciseId === e.id);
      if (swap) {
        result.push({
          ...e,
          ...swap,
          id: swap.id,
          name: swap.name ?? e.name,
          patientSets: swap.patientSets ?? swap.sets ?? e.patientSets,
          patientReps: swap.patientReps ?? swap.reps ?? e.patientReps,
          sets: swap.sets ?? e.sets,
          reps: swap.reps ?? e.reps,
        });
      }
      continue;
    }
    const prop = byId.get(e.id);
    if (prop) {
      result.push({
        ...e,
        patientSets: prop.patientSets ?? prop.sets ?? e.patientSets,
        patientReps: prop.patientReps ?? prop.reps ?? e.patientReps,
        sets: prop.sets ?? e.sets,
        reps: prop.reps ?? e.reps,
      });
    } else {
      result.push(raw);
    }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeadersFor(req, "authorization, x-cron-secret, content-type"),
    });
  }
  // Cron + ops tools: POST only (no GET secret probe surface).
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, req);
  }
  if (isOriginForbidden(req)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, req);
  }

  try {
    const url = new URL(req.url);
    if (url.searchParams.has("secret") || url.searchParams.has("cron_secret")) {
      return jsonResponse({ error: "query_secret_rejected" }, 400, req);
    }

    const expected = (Deno.env.get("INTERNAL_CRON_SECRET") ?? "").trim();
    const provided = (req.headers.get("x-cron-secret") ?? "").trim();
    if (!expected || !(await timingSafeEqualString(provided, expected))) {
      return jsonResponse({ error: "unauthorized" }, 401, req);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "misconfigured" }, 500, req);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const clinicalToday = clinicalTodayYmd();
    const windowDays = rollingWindow(clinicalToday, PROGRAM_REVIEW_WINDOW_DAYS);
    const windowStart = windowDays[0]!;
    const windowEnd = windowDays[windowDays.length - 1]!;

    await supabase.from("program_review_engine_status").upsert({
      id: 1,
      phase: "scanning",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { data: catalogRows, error: catalogErr } = await supabase
      .from("exercise_catalog")
      .select(
        "id, name, sets, reps, hold_seconds, difficulty, target_area, muscle_group, clinical_regression_hint, clinical_progression_hint, is_active",
      )
      .eq("is_active", true);
    if (catalogErr) {
      console.warn(`[clinical-review-cron] catalog fetch failed: ${catalogErr.message}`);
    }
    const catalog: ProgramReviewCatalogCandidate[] = (catalogRows ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sets: (r.sets as number) ?? 1,
      reps: (r.reps as number | null) ?? null,
      holdSeconds: (r.hold_seconds as number | null) ?? null,
      difficulty: (r.difficulty as number) ?? 2,
      targetArea: (r.target_area as string) ?? "",
      muscleGroup: (r.muscle_group as string) ?? "",
      clinicalRegressionHint: (r.clinical_regression_hint as string | null) ?? null,
      clinicalProgressionHint: (r.clinical_progression_hint as string | null) ?? null,
    }));

    await supabase.from("program_review_engine_status").upsert({
      id: 1,
      phase: "analyzing",
      updated_at: new Date().toISOString(),
      last_summary: {
        clinicalToday,
        windowStart,
        windowEnd,
        catalogSize: catalog.length,
      },
    });

    const { data: patients, error: patientsErr } = await supabase
      .from("patients")
      .select("id, therapist_id, account_frozen, status, payload, subscription_tier")
      .eq("subscription_tier", "generic")
      .not("therapist_id", "is", null);
    if (patientsErr) {
      console.error(`[clinical-review-cron] patients fetch failed: ${patientsErr.message}`);
      await supabase.from("program_review_engine_status").upsert({
        id: 1,
        phase: "idle",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_summary: { error: "patients_fetch_failed" },
      });
      return jsonResponse({ error: "patients_fetch_failed" }, 500, req);
    }

    let reviewed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    type PatientRow = {
      id: string;
      therapist_id: string | null;
      account_frozen: boolean | null;
      status: string | null;
      payload: unknown;
      subscription_tier?: string | null;
    };

    const eligiblePatients: PatientRow[] = [];
    for (const patient of (patients ?? []) as PatientRow[]) {
      // Defense-in-depth: only Generic (AI-led) patients get automated proposals.
      const tier = String(patient.subscription_tier ?? "").toLowerCase();
      if (tier !== "generic") {
        skipped++;
        continue;
      }
      if (patient.account_frozen === true) {
        skipped++;
        continue;
      }
      const status = typeof patient.status === "string" ? patient.status : "";
      if (status === "frozen" || status === "paused") {
        skipped++;
        continue;
      }
      if (!patient.therapist_id) {
        skipped++;
        continue;
      }
      eligiblePatients.push(patient);
    }

    const eligibleIds = eligiblePatients.map((p) => p.id);

    /** Batch-load proposal timing / pending flags (avoids 3 queries × N patients). */
    const pendingByPatient = new Set<string>();
    const lastEndByPatient = new Map<string, string>();
    const lastDeclinedByPatient = new Map<string, string>();

    if (eligibleIds.length > 0) {
      const { data: proposalRows, error: propErr } = await supabase
        .from("program_review_proposals")
        .select("patient_id, status, review_window_end, resolved_at, created_at")
        .in("patient_id", eligibleIds)
        .order("created_at", { ascending: false });
      if (propErr) {
        console.error(`[clinical-review-cron] proposals batch failed: ${propErr.message}`);
        errors += eligibleIds.length;
      } else {
        for (const row of proposalRows ?? []) {
          const pid = String(row.patient_id);
          if (row.status === "pending") pendingByPatient.add(pid);
          if (!lastEndByPatient.has(pid) && typeof row.review_window_end === "string") {
            lastEndByPatient.set(pid, row.review_window_end.slice(0, 10));
          }
          if (
            row.status === "declined" &&
            !lastDeclinedByPatient.has(pid) &&
            typeof row.resolved_at === "string"
          ) {
            lastDeclinedByPatient.set(pid, row.resolved_at.slice(0, 10));
          }
        }
      }
    }

    /** Batch session_history for the review window. */
    const sessionsByPatient = new Map<
      string,
      Array<{ session_date: string; payload: unknown }>
    >();
    if (eligibleIds.length > 0) {
      const { data: sessionRows, error: sessErr } = await supabase
        .from("session_history")
        .select("patient_id, session_date, payload")
        .in("patient_id", eligibleIds)
        .gte("session_date", windowStart)
        .lte("session_date", windowEnd);
      if (sessErr) {
        console.error(`[clinical-review-cron] sessions batch failed: ${sessErr.message}`);
        errors += eligibleIds.length;
      } else {
        for (const s of sessionRows ?? []) {
          const pid = String(s.patient_id);
          const list = sessionsByPatient.get(pid) ?? [];
          list.push({
            session_date: String(s.session_date),
            payload: s.payload,
          });
          sessionsByPatient.set(pid, list);
        }
      }
    }

    /** Batch active exercise plans. */
    const planByPatient = new Map<string, unknown>();
    if (eligibleIds.length > 0) {
      const { data: planRows, error: planErr } = await supabase
        .from("exercise_plans")
        .select("patient_id, exercises")
        .in("patient_id", eligibleIds)
        .eq("is_active", true);
      if (planErr) {
        console.error(`[clinical-review-cron] plans batch failed: ${planErr.message}`);
        errors += eligibleIds.length;
      } else {
        for (const row of planRows ?? []) {
          planByPatient.set(String(row.patient_id), row.exercises);
        }
      }
    }

    for (const patient of eligiblePatients) {
      try {
        const patientId = patient.id;
        const therapistId = patient.therapist_id as string;
        const programStartYmd = resolveProgramStartYmd(patient.payload);

        const hasPending = pendingByPatient.has(patientId);
        const lastEnd = lastEndByPatient.get(patientId) ?? null;
        const lastDeclinedYmd = lastDeclinedByPatient.get(patientId) ?? null;

        const sessions = sessionsByPatient.get(patientId) ?? [];
        let daysWithWork = 0;
        let planned = 0;
        let completed = 0;
        const painSamples: ProgramReviewPainSample[] = [];
        for (const s of sessions) {
          const ymd = String(s.session_date).slice(0, 10);
          if (sessionHasWork(s.payload)) daysWithWork++;
          const p = asRecord(s.payload);
          const doneIds = Array.isArray(p?.completedIds) ? p!.completedIds : [];
          completed += doneIds.length;
          planned += Math.max(doneIds.length, 1);
          painSamples.push(...extractPainSamples(ymd, s.payload));
        }
        const adherenceRate = planned > 0 ? completed / Math.max(planned, 1) : null;

        if (
          !isDueForProgramReview({
            clinicalToday,
            programStartYmd,
            lastReviewWindowEnd: lastEnd,
            lastDeclinedYmd,
            hasPendingProposal: hasPending,
            daysWithLogsInWindow: daysWithWork,
          })
        ) {
          skipped++;
          continue;
        }

        let exercisesRaw = planByPatient.get(patientId);
        if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
          const payload = asRecord(patient.payload);
          const cache = payload?._exercisePlanCache;
          if (Array.isArray(cache)) exercisesRaw = cache;
        }
        const exercises = mapPlanExercises(exercisesRaw);
        if (exercises.length === 0) {
          skipped++;
          continue;
        }

        reviewed++;
        const result = evaluateProgramReview({
          exercises,
          painSamples,
          daysWithWork,
          adherenceRate,
          catalog,
        });

        const currentPlanArr = Array.isArray(exercisesRaw) ? exercisesRaw : [];
        const proposedFull = mergeProposedOntoPlan(
          currentPlanArr as unknown[],
          result.proposedExercises,
        );

        const status =
          result.decision === "maintain" ? "auto_recorded" : "pending";

        const { error: insertErr } = await supabase.from("program_review_proposals").insert({
          patient_id: patientId,
          therapist_id: therapistId,
          review_window_start: windowStart,
          review_window_end: windowEnd,
          decision: result.decision,
          rationale: result.rationaleHebrew,
          proposed_exercises: proposedFull,
          proposed_changes: result.proposedChanges,
          metrics: result.metrics,
          status,
          resolved_at: status === "auto_recorded" ? new Date().toISOString() : null,
        });

        if (insertErr) {
          // Unique pending race — safe to skip; never lock the loop.
          console.warn(
            `[clinical-review-cron] insert skipped for ${patientLogRef(patientId)}: ${insertErr.message}`,
          );
          skipped++;
          continue;
        }
        inserted++;
        console.log(
          `[clinical-review-cron] ${patientLogRef(patientId)} decision=${result.decision} status=${status}`,
        );
      } catch (e) {
        errors++;
        console.warn(
          `[clinical-review-cron] patient loop error: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    const summary = {
      clinicalToday,
      windowStart,
      windowEnd,
      reviewed,
      inserted,
      skipped,
      errors,
      patientCount: (patients ?? []).length,
      catalogSize: catalog.length,
    };

    await supabase.from("program_review_engine_status").upsert({
      id: 1,
      phase: "idle",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_summary: summary,
    });

    return jsonResponse({ ok: true, ...summary }, 200, req);
  } catch (e) {
    console.error(
      `[clinical-review-cron] handler error: ${e instanceof Error ? e.message : "unknown"}`,
    );
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && serviceKey) {
        const sb = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await sb.from("program_review_engine_status").upsert({
          id: 1,
          phase: "idle",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_summary: { error: "handler_failed" },
        });
      }
    } catch {
      // ignore status reset failure
    }
    return jsonResponse({ error: "internal_error" }, 500, req);
  }
});
