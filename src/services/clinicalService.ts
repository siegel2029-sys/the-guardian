/**
 * clinicalService.ts — Physio-Shield
 * Bulletproof data persistence layer for Supabase/PostgreSQL.
 *
 * Fixes addressed:
 *  [1] Hardened snake_case SQL mapping — no camelCase leaking to DB
 *  [2] Flat columns + payload mirror — every dedicated column is top-level AND in payload
 *  [3] No "no-change" short-circuit — if save is called, upsert runs, period
 *  [4] Orphan patient linkage — auth_user_id injected dynamically if missing
 *  [5] Session history integrity — correct patient_id / therapist_id on every write
 *  [6] console.table debug snapshot before every Supabase call
 */
 
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
 
// ─── Supabase client ────────────────────────────────────────────────────────
 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
 
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
 
// ─── Types ───────────────────────────────────────────────────────────────────
 
export interface PatientUI {
  /** UUID — present for existing patients, undefined for new ones */
  id?: string;
  /** UUID of the Supabase auth user who owns this record */
  auth_user_id?: string | null;
 
  // Demographics
  first_name?: string;
  last_name?: string;
  birth_date?: string;          // ISO date string  "YYYY-MM-DD"
  occupation?: string;
  demographics_free_text?: string;
  phone?: string;
  email?: string;
 
  // Clinical
  active_area?: string;         // אזור פעיל (primary pain region)
  pain_level?: number;          // 0–10
  diagnosis?: string;
 
  // Any additional free-form data your UI builds up
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
 
export interface ExercisePlanUI {
  id?: string;
  patient_id: string;
  therapist_id?: string;
  title?: string;
  description?: string;
  frequency?: string;
  duration_weeks?: number;
  exercises?: ExerciseItem[];
  notes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
 
export interface ExerciseItem {
  name: string;
  sets?: number;
  reps?: number;
  duration_seconds?: number;
  instructions?: string;
}
 
export interface TreatmentReportUI {
  id?: string;
  patient_id: string;
  therapist_id?: string;
  session_date?: string;        // ISO date string
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  pain_level?: number;
  notes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
/**
 * Returns the currently authenticated Supabase user.
 * Throws if no session exists — prevents silent no-ops.
 */
async function requireCurrentUser(): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error(
      `[clinicalService] No authenticated session: ${error?.message ?? "user is null"}`
    );
  }
  return data.user;
}
 
/**
 * Sanitise a value before sending to Supabase.
 * - Converts empty string → null  (avoids NOT NULL constraint violations)
 * - Keeps 0 and false as-is (valid values)
 */
function sanitise<T>(value: T | undefined | null): T | null {
  if (value === undefined || value === "") return null;
  return value ?? null;
}
 
// ─── upsertPatientRecords ────────────────────────────────────────────────────
 
/**
 * Upsert one or more patient records to `patients` table.
 *
 * Rules:
 *  • Every UI field with a dedicated column is sent as a top-level snake_case key.
 *  • The same fields are mirrored inside `payload` (JSONB) for redundancy.
 *  • If auth_user_id is missing/null, it is injected from the live session.
 *  • No content-comparison short-circuit: we always write.
 *  • A console.table snapshot is logged before the Supabase call.
 */
export async function upsertPatientRecords(
  patients: PatientUI[]
): Promise<void> {
  if (!patients.length) {
    console.warn("[upsertPatientRecords] Called with empty array — skipping.");
    return;
  }
 
  const currentUser = await requireCurrentUser();
 
  const rows = patients.map((patient) => {
    // ── [4] Orphan linkage: inject therapist's auth uid if missing ──────────
    const resolvedAuthUserId =
      patient.auth_user_id ?? currentUser.id;
 
    // ── [1] Explicit snake_case column mapping ───────────────────────────────
    //    Every field that has a real column in `patients` must appear here.
    //    Do NOT spread the whole patient object — that risks sending unknown keys.
    const flatColumns = {
      // Identity / ownership
      therapist_id:           sanitise(patient.therapist_id ?? resolvedAuthUserId),
      auth_user_id:           sanitise(resolvedAuthUserId),
 
      // Demographics — dedicated columns
      first_name:             sanitise(patient.first_name),
      last_name:              sanitise(patient.last_name),
      birth_date:             sanitise(patient.birth_date),
      occupation:             sanitise(patient.occupation),
      demographics_free_text: sanitise(patient.demographics_free_text),
      phone:                  sanitise(patient.phone),
      email:                  sanitise(patient.email),
 
      // Clinical — dedicated columns
      active_area:            sanitise(patient.active_area),
      pain_level:             sanitise(patient.pain_level),
      diagnosis:              sanitise(patient.diagnosis),
 
      // Timestamp
      updated_at:             new Date().toISOString(),
    };
 
    // ── [2] payload mirror: flat columns + anything extra from UI ────────────
    //    This is your safety net — even if a column is added later, the
    //    data survives in JSONB today.
    const payloadMirror = {
      ...flatColumns,
      // Capture any extra UI state that doesn't have a column yet
      ...Object.fromEntries(
        Object.entries(patient).filter(
          ([k]) =>
            ![
              "id",
              "auth_user_id",
              "therapist_id",
              "first_name",
              "last_name",
              "birth_date",
              "occupation",
              "demographics_free_text",
              "phone",
              "email",
              "active_area",
              "pain_level",
              "diagnosis",
              "updated_at",
            ].includes(k)
        )
      ),
    };
 
    const row: Record<string, unknown> = {
      ...flatColumns,
      payload: payloadMirror,
    };
 
    // Include `id` only when updating an existing record.
    // Omitting it lets Supabase auto-generate a UUID on insert.
    if (patient.id) {
      row.id = patient.id;
    }
 
    return row;
  });
 
  // ── [6] Debug snapshot ────────────────────────────────────────────────────
  console.group("[upsertPatientRecords] Payload snapshot");
  console.table(
    rows.map((r) => ({
      id:                     r.id ?? "(new)",
      auth_user_id:           r.auth_user_id,
      therapist_id:           r.therapist_id,
      first_name:             r.first_name,
      active_area:            r.active_area,
      demographics_free_text: r.demographics_free_text,
      occupation:             r.occupation,
      birth_date:             r.birth_date,
      pain_level:             r.pain_level,
      updated_at:             r.updated_at,
    }))
  );
  console.log("Full rows (including payload):", rows);
  console.groupEnd();
 
  // ── [3] Force persistence — no change-detection, always upsert ───────────
  const { error } = await supabase
    .from("patients")
    .upsert(rows, {
      onConflict: "id",          // conflict key — adjust if your PK is different
      ignoreDuplicates: false,   // always overwrite on conflict
    });
 
  if (error) {
    console.error("[upsertPatientRecords] Supabase error:", error);
    throw new Error(`upsertPatientRecords failed: ${error.message}`);
  }
 
  console.info(`[upsertPatientRecords] ✅ ${rows.length} patient(s) saved.`);
}
 
// ─── upsertExercisePlans ─────────────────────────────────────────────────────
 
/**
 * Upsert exercise plans linked to a patient.
 *
 * Assumes `exercise_plans` table has at minimum:
 *   id, patient_id, therapist_id, title, description, frequency,
 *   duration_weeks, exercises (JSONB), notes, payload (JSONB), updated_at
 */
export async function upsertExercisePlans(
  plans: ExercisePlanUI[]
): Promise<void> {
  if (!plans.length) {
    console.warn("[upsertExercisePlans] Called with empty array — skipping.");
    return;
  }
 
  const currentUser = await requireCurrentUser();
 
  const rows = plans.map((plan) => {
    // ── [5] Session integrity: therapist_id must always resolve ──────────────
    const resolvedTherapistId = sanitise(plan.therapist_id ?? currentUser.id);
 
    if (!plan.patient_id) {
      throw new Error(
        `[upsertExercisePlans] Plan is missing patient_id: ${JSON.stringify(plan)}`
      );
    }
 
    const flatColumns = {
      patient_id:     plan.patient_id,
      therapist_id:   resolvedTherapistId,
      title:          sanitise(plan.title),
      description:    sanitise(plan.description),
      frequency:      sanitise(plan.frequency),
      duration_weeks: sanitise(plan.duration_weeks),
      exercises:      plan.exercises ?? [],   // JSONB array
      notes:          sanitise(plan.notes),
      updated_at:     new Date().toISOString(),
    };
 
    const row: Record<string, unknown> = {
      ...flatColumns,
      payload: { ...flatColumns },
    };
 
    if (plan.id) row.id = plan.id;
 
    return row;
  });
 
  // ── [6] Debug snapshot ────────────────────────────────────────────────────
  console.group("[upsertExercisePlans] Payload snapshot");
  console.table(
    rows.map((r) => ({
      id:           r.id ?? "(new)",
      patient_id:   r.patient_id,
      therapist_id: r.therapist_id,
      title:        r.title,
      frequency:    r.frequency,
      duration_weeks: r.duration_weeks,
      updated_at:   r.updated_at,
    }))
  );
  console.log("Full rows:", rows);
  console.groupEnd();
 
  // ── [3] Forced upsert ─────────────────────────────────────────────────────
  const { error } = await supabase
    .from("exercise_plans")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: false });
 
  if (error) {
    console.error("[upsertExercisePlans] Supabase error:", error);
    throw new Error(`upsertExercisePlans failed: ${error.message}`);
  }
 
  console.info(`[upsertExercisePlans] ✅ ${rows.length} plan(s) saved.`);
}
 
// ─── upsertTreatmentReport ───────────────────────────────────────────────────
 
/**
 * Upsert a single SOAP/treatment report.
 *
 * Assumes `treatment_reports` table has:
 *   id, patient_id, therapist_id, session_date, subjective, objective,
 *   assessment, plan, pain_level, notes, payload (JSONB), updated_at
 */
export async function upsertTreatmentReport(
  report: TreatmentReportUI
): Promise<void> {
  const currentUser = await requireCurrentUser();
 
  // ── [5] Session integrity ─────────────────────────────────────────────────
  if (!report.patient_id) {
    throw new Error("[upsertTreatmentReport] Missing patient_id.");
  }
 
  const resolvedTherapistId = sanitise(report.therapist_id ?? currentUser.id);
 
  const flatColumns = {
    patient_id:   report.patient_id,
    therapist_id: resolvedTherapistId,
    session_date: sanitise(report.session_date ?? new Date().toISOString().split("T")[0]),
    subjective:   sanitise(report.subjective),
    objective:    sanitise(report.objective),
    assessment:   sanitise(report.assessment),
    plan:         sanitise(report.plan),
    pain_level:   sanitise(report.pain_level),
    notes:        sanitise(report.notes),
    updated_at:   new Date().toISOString(),
  };
 
  const row: Record<string, unknown> = {
    ...flatColumns,
    payload: { ...flatColumns },
  };
 
  if (report.id) row.id = report.id;
 
  // ── [6] Debug snapshot ────────────────────────────────────────────────────
  console.group("[upsertTreatmentReport] Payload snapshot");
  console.table({
    id:           row.id ?? "(new)",
    patient_id:   row.patient_id,
    therapist_id: row.therapist_id,
    session_date: row.session_date,
    pain_level:   row.pain_level,
    updated_at:   row.updated_at,
  });
  console.log("Full row:", row);
  console.groupEnd();
 
  // ── [3] Forced upsert ─────────────────────────────────────────────────────
  const { error } = await supabase
    .from("treatment_reports")
    .upsert(row, { onConflict: "id", ignoreDuplicates: false });
 
  if (error) {
    console.error("[upsertTreatmentReport] Supabase error:", error);
    throw new Error(`upsertTreatmentReport failed: ${error.message}`);
  }
 
  console.info("[upsertTreatmentReport] ✅ Report saved.");
}
 
// ─── RLS helper — patch orphan patients ─────────────────────────────────────
 
/**
 * One-time migration helper.
 * Run this ONCE from a therapist session to claim all NULL auth_user_id patients
 * that belong to their therapist_id.
 *
 * ⚠️  Only works if RLS allows a therapist to update their own patients.
 *     If patients are fully orphaned (no therapist_id either), you need a
 *     Supabase service-role call from your backend/Edge Function.
 */
export async function claimOrphanPatients(): Promise<void> {
  const currentUser = await requireCurrentUser();
 
  const { data: orphans, error: fetchError } = await supabase
    .from("patients")
    .select("id, therapist_id, auth_user_id")
    .eq("therapist_id", currentUser.id)
    .is("auth_user_id", null);
 
  if (fetchError) {
    console.error("[claimOrphanPatients] Fetch error:", fetchError);
    return;
  }
 
  if (!orphans?.length) {
    console.info("[claimOrphanPatients] No orphan patients found.");
    return;
  }
 
  console.warn(
    `[claimOrphanPatients] Found ${orphans.length} orphan(s) — patching auth_user_id.`
  );
 
  const { error: updateError } = await supabase
    .from("patients")
    .update({ auth_user_id: currentUser.id, updated_at: new Date().toISOString() })
    .eq("therapist_id", currentUser.id)
    .is("auth_user_id", null);
 
  if (updateError) {
    console.error("[claimOrphanPatients] Update error:", updateError);
    throw new Error(`claimOrphanPatients failed: ${updateError.message}`);
  }
 
  console.info(`[claimOrphanPatients] ✅ Patched ${orphans.length} orphan(s).`);
}