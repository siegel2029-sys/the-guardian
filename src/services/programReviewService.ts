import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { sanitizeDbErrorMessage } from '../lib/dbErrorSanitizer';
import { serviceFail, serviceOk, type ServiceResult } from '../lib/serviceResult';
import { fetchExerciseCatalog } from './exerciseCatalogService';
import {
  evaluateProgramReview,
  PROGRAM_REVIEW_WINDOW_DAYS,
  type ProgramReviewCatalogCandidate,
  type ProgramReviewDecision,
  type ProgramReviewExerciseInput,
  type ProgramReviewPainSample,
} from '../ai/programReviewEngine';
import { addClinicalDays, getClinicalDate } from '../utils/clinicalCalendar';

export type ProgramReviewProposalStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'auto_recorded';

export type ProgramReviewProposedChange = {
  exerciseId: string;
  exerciseName: string;
  action: string;
  fromSets: number;
  toSets: number;
  fromReps: number;
  toReps: number;
  swapToExerciseId?: string;
  swapToExerciseName?: string;
  noteHebrew: string;
  changeKey?: string;
};

export type ProgramReviewMetrics = {
  avgPain: number | null;
  maxPain: number | null;
  adherenceRate: number | null;
  logDays: number;
  highPainExerciseIds?: string[];
};

export type ProgramReviewProposalRow = {
  id: string;
  patient_id: string;
  therapist_id: string;
  created_at: string;
  review_window_start: string;
  review_window_end: string;
  decision: ProgramReviewDecision;
  rationale: string;
  proposed_exercises: unknown;
  proposed_changes: ProgramReviewProposedChange[];
  metrics: ProgramReviewMetrics;
  status: ProgramReviewProposalStatus;
  resolved_at: string | null;
  resolved_by: string | null;
};

function clientOrFail(): ServiceResult<SupabaseClient> {
  if (!supabase) {
    return serviceFail('מערכת הענן אינה מוגדרת.');
  }
  return serviceOk(supabase);
}

function mapRow(raw: Record<string, unknown>): ProgramReviewProposalRow {
  const metricsRaw =
    raw.metrics && typeof raw.metrics === 'object' && !Array.isArray(raw.metrics)
      ? (raw.metrics as Record<string, unknown>)
      : {};
  const changes = Array.isArray(raw.proposed_changes)
    ? (raw.proposed_changes as ProgramReviewProposedChange[])
    : [];
  return {
    id: String(raw.id),
    patient_id: String(raw.patient_id),
    therapist_id: String(raw.therapist_id),
    created_at: String(raw.created_at),
    review_window_start: String(raw.review_window_start).slice(0, 10),
    review_window_end: String(raw.review_window_end).slice(0, 10),
    decision: raw.decision as ProgramReviewDecision,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    proposed_exercises: raw.proposed_exercises,
    proposed_changes: changes,
    metrics: {
      avgPain: typeof metricsRaw.avgPain === 'number' ? metricsRaw.avgPain : null,
      maxPain: typeof metricsRaw.maxPain === 'number' ? metricsRaw.maxPain : null,
      adherenceRate:
        typeof metricsRaw.adherenceRate === 'number' ? metricsRaw.adherenceRate : null,
      logDays: typeof metricsRaw.logDays === 'number' ? metricsRaw.logDays : 0,
      highPainExerciseIds: Array.isArray(metricsRaw.highPainExerciseIds)
        ? (metricsRaw.highPainExerciseIds as string[])
        : [],
    },
    status: raw.status as ProgramReviewProposalStatus,
    resolved_at: raw.resolved_at != null ? String(raw.resolved_at) : null,
    resolved_by: raw.resolved_by != null ? String(raw.resolved_by) : null,
  };
}

/** Therapist: open (pending) program adjustment proposals for the signed-in therapist. */
export async function fetchPendingProgramReviewProposals(
  client?: SupabaseClient | null
): Promise<ServiceResult<ProgramReviewProposalRow[]>> {
  const c = client ?? supabase;
  if (!c) return serviceFail('מערכת הענן אינה מוגדרת.');

  const { data, error } = await c
    .from('program_review_proposals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'לא ניתן לטעון הצעות התאמת תוכנית.')
    );
  }
  return serviceOk((data ?? []).map((r) => mapRow(r as Record<string, unknown>)));
}

/** In-memory TTL for patient-chat / assistant reads (avoids per-message DB spam). */
const LATEST_PROGRAM_REVIEW_TTL_MS = 90_000;

type LatestProgramReviewCacheEntry = {
  expiresAt: number;
  result: ServiceResult<ProgramReviewProposalRow | null>;
};

const latestProgramReviewCache = new Map<string, LatestProgramReviewCacheEntry>();

/** Drop cached latest-review rows (call after approve / decline / force review). */
export function invalidateLatestProgramReviewCache(patientId?: string): void {
  if (patientId?.trim()) {
    latestProgramReviewCache.delete(patientId.trim());
    return;
  }
  latestProgramReviewCache.clear();
}

/** Latest review for a patient (any status) — for rehab-assistant awareness. */
export async function fetchLatestProgramReviewForPatient(
  patientId: string,
  client?: SupabaseClient | null
): Promise<ServiceResult<ProgramReviewProposalRow | null>> {
  const c = client ?? supabase;
  if (!c) return serviceFail('מערכת הענן אינה מוגדרת.');
  const key = patientId.trim();
  if (!key) return serviceFail('מזהה מטופל חסר.');

  const now = Date.now();
  const cached = latestProgramReviewCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const { data, error } = await c
    .from('program_review_proposals')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'לא ניתן לטעון סטטוס ביקורת תוכנית.')
    );
  }
  const result = data
    ? serviceOk(mapRow(data as Record<string, unknown>))
    : serviceOk(null);
  latestProgramReviewCache.set(key, {
    expiresAt: now + LATEST_PROGRAM_REVIEW_TTL_MS,
    result,
  });
  return result;
}

/**
 * Therapist approves via atomic SECURITY DEFINER RPC (plan + audit + status).
 * Never called automatically by the cron.
 */
export async function approveProgramReviewProposal(
  proposalId: string,
  opts?: { client?: SupabaseClient | null }
): Promise<ServiceResult<{ patientId: string }>> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטפל.');

  const { data, error } = await client.rpc('approve_program_review_proposal', {
    p_proposal_id: proposalId,
  });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'אישור ההצעה נכשל.')
    );
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true && typeof payload.patientId === 'string') {
    invalidateLatestProgramReviewCache(payload.patientId);
    return serviceOk({ patientId: payload.patientId });
  }
  const reason = typeof payload?.reason === 'string' ? payload.reason : 'approve_failed';
  const he =
    reason === 'not_pending' || reason === 'not_found'
      ? 'ההצעה אינה ממתינה לאישור או לא נמצאה.'
      : reason === 'forbidden'
        ? 'אין הרשאה לאשר הצעה זו.'
        : reason === 'invalid_plan'
          ? 'להצעה אין תוכנית תרגילים תקינה ליישום.'
          : 'אישור ההצעה נכשל.';
  return serviceFail(he);
}

/** Therapist declines via atomic SECURITY DEFINER RPC. */
export async function declineProgramReviewProposal(
  proposalId: string,
  opts?: { client?: SupabaseClient | null }
): Promise<ServiceResult<{ patientId: string }>> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטפל.');

  const { data, error } = await client.rpc('decline_program_review_proposal', {
    p_proposal_id: proposalId,
  });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'דחיית ההצעה נכשלה.')
    );
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true && typeof payload.patientId === 'string') {
    invalidateLatestProgramReviewCache(payload.patientId);
    return serviceOk({ patientId: payload.patientId });
  }
  const reason = typeof payload?.reason === 'string' ? payload.reason : 'decline_failed';
  const he =
    reason === 'not_pending' || reason === 'not_found'
      ? 'ההצעה אינה ממתינה לאישור או לא נמצאה.'
      : reason === 'forbidden'
        ? 'אין הרשאה לדחות הצעה זו.'
        : 'דחיית ההצעה נכשלה.';
  return serviceFail(he);
}

function mapPatientProposalRpcFailure(reason: string, fallback: string): string {
  if (reason === 'not_pending' || reason === 'not_found') {
    return 'ההצעה אינה ממתינה לאישור או לא נמצאה.';
  }
  if (reason === 'forbidden') return 'אין הרשאה לפעולה זו.';
  if (reason === 'tier_not_generic') {
    return 'אישור שינויי תוכנית בפורטל זמין למסלול Generic בלבד.';
  }
  if (reason === 'account_locked') return 'החשבון מוקפא — לא ניתן לעדכן את התוכנית.';
  if (reason === 'invalid_plan') return 'להצעה אין תוכנית תרגילים תקינה ליישום.';
  if (reason === 'no_accepted_keys') return 'יש לאשר לפחות שינוי אחד לפני עדכון התוכנית.';
  if (reason === 'unknown_change_key') return 'חלק מהשינויים שנבחרו אינם תקפים להצעה זו.';
  if (reason === 'exercise_missing') return 'תרגיל מההצעה לא נמצא בתוכנית הנוכחית.';
  return fallback;
}

/** Generic patient: pending program-review proposal for self-accept UI (RLS: own patient). */
export async function fetchPendingProgramReviewForPatient(
  patientId: string,
  client?: SupabaseClient | null
): Promise<ServiceResult<ProgramReviewProposalRow | null>> {
  const c = client ?? supabase;
  if (!c) return serviceFail('מערכת הענן אינה מוגדרת.');
  const key = patientId.trim();
  if (!key) return serviceFail('מזהה מטופל חסר.');

  const { data, error } = await c
    .from('program_review_proposals')
    .select('*')
    .eq('patient_id', key)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'לא ניתן לטעון הצעת התאמת תוכנית.')
    );
  }
  return data ? serviceOk(mapRow(data as Record<string, unknown>)) : serviceOk(null);
}

/**
 * Generic patient accepts via SECURITY DEFINER RPC (plan + clinical_audit_logs footprint).
 * Never silent — caller must confirm in UI first.
 * @deprecated Prefer {@link patientApplyProgramReviewItems} for granular accept.
 */
export async function patientAcceptProgramReviewProposal(
  proposalId: string,
  opts?: { client?: SupabaseClient | null }
): Promise<ServiceResult<{ patientId: string }>> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטופל.');

  const { data, error } = await client.rpc('patient_accept_program_review_proposal', {
    p_proposal_id: proposalId,
  });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'אישור השינוי נכשל.')
    );
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true && typeof payload.patientId === 'string') {
    invalidateLatestProgramReviewCache(payload.patientId);
    return serviceOk({ patientId: payload.patientId });
  }
  const reason = typeof payload?.reason === 'string' ? payload.reason : 'accept_failed';
  return serviceFail(mapPatientProposalRpcFailure(reason, 'אישור השינוי נכשל.'));
}

/**
 * Generic patient: apply only accepted change keys (server merges onto live plan).
 */
export async function patientApplyProgramReviewItems(
  proposalId: string,
  acceptedChangeKeys: string[],
  opts?: { client?: SupabaseClient | null }
): Promise<ServiceResult<{ patientId: string; acceptedCount: number; declinedCount: number }>> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטופל.');

  const keys = acceptedChangeKeys.map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    return serviceFail('יש לאשר לפחות שינוי אחד לפני עדכון התוכנית.');
  }

  const { data, error } = await client.rpc('patient_apply_program_review_items', {
    p_proposal_id: proposalId,
    p_accepted_change_keys: keys,
  });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'אישור השינויים נכשל.')
    );
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true && typeof payload.patientId === 'string') {
    invalidateLatestProgramReviewCache(payload.patientId);
    return serviceOk({
      patientId: payload.patientId,
      acceptedCount:
        typeof payload.acceptedCount === 'number' ? payload.acceptedCount : keys.length,
      declinedCount: typeof payload.declinedCount === 'number' ? payload.declinedCount : 0,
    });
  }
  const reason = typeof payload?.reason === 'string' ? payload.reason : 'accept_failed';
  return serviceFail(mapPatientProposalRpcFailure(reason, 'אישור השינויים נכשל.'));
}

/** Generic patient declines pending AI proposal (audit footprint + cooldown path). */
export async function patientDeclineProgramReviewProposal(
  proposalId: string,
  opts?: { client?: SupabaseClient | null }
): Promise<ServiceResult<{ patientId: string }>> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטופל.');

  const { data, error } = await client.rpc('patient_decline_program_review_proposal', {
    p_proposal_id: proposalId,
  });

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'דחיית השינוי נכשלה.')
    );
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true && typeof payload.patientId === 'string') {
    invalidateLatestProgramReviewCache(payload.patientId);
    return serviceOk({ patientId: payload.patientId });
  }
  const reason = typeof payload?.reason === 'string' ? payload.reason : 'decline_failed';
  return serviceFail(mapPatientProposalRpcFailure(reason, 'דחיית השינוי נכשלה.'));
}

export type ProgramReviewEnginePhase = 'idle' | 'scanning' | 'analyzing';

export type ProgramReviewEngineStatus = {
  phase: ProgramReviewEnginePhase;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  lastSummary: Record<string, unknown>;
};

/**
 * Live background-engine phase (therapist badges + patient passive indicator).
 * Row contains no PHI — RLS allows therapist profiles and linked portal patients.
 */
export async function fetchProgramReviewEngineStatus(
  client?: SupabaseClient | null
): Promise<ServiceResult<ProgramReviewEngineStatus>> {
  const c = client ?? supabase;
  if (!c) return serviceFail('מערכת הענן אינה מוגדרת.');

  const { data, error } = await c
    .from('program_review_engine_status')
    .select('phase, started_at, finished_at, updated_at, last_summary')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return serviceFail(
      sanitizeDbErrorMessage(error.message, 'לא ניתן לטעון סטטוס מנוע הביקורת.')
    );
  }

  const phase =
    data?.phase === 'scanning' || data?.phase === 'analyzing' || data?.phase === 'idle'
      ? data.phase
      : 'idle';

  return serviceOk({
    phase,
    startedAt: data?.started_at != null ? String(data.started_at) : null,
    finishedAt: data?.finished_at != null ? String(data.finished_at) : null,
    updatedAt: data?.updated_at != null ? String(data.updated_at) : null,
    lastSummary:
      data?.last_summary && typeof data.last_summary === 'object' && !Array.isArray(data.last_summary)
        ? (data.last_summary as Record<string, unknown>)
        : {},
  });
}

async function setEnginePhase(
  client: SupabaseClient,
  phase: ProgramReviewEnginePhase,
  summary?: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    phase,
    updated_at: now,
  };
  if (phase === 'scanning') patch.started_at = now;
  if (phase === 'idle') patch.finished_at = now;
  if (summary) patch.last_summary = summary;
  await client.from('program_review_engine_status').update(patch).eq('id', 1);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function sessionHasWork(payload: unknown): boolean {
  const p = asRecord(payload);
  if (!p) return false;
  const completed = Array.isArray(p.completedIds) ? p.completedIds : [];
  const reports = Array.isArray(p.finishReports) ? p.finishReports : [];
  const xp = typeof p.sessionXp === 'number' ? p.sessionXp : 0;
  return completed.length > 0 || reports.length > 0 || xp > 0;
}

function mapPlanExercises(raw: unknown): ProgramReviewExerciseInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ProgramReviewExerciseInput[] = [];
  for (const item of raw) {
    const e = asRecord(item);
    if (!e || typeof e.id !== 'string') continue;
    const sets =
      typeof e.patientSets === 'number'
        ? e.patientSets
        : typeof e.sets === 'number'
          ? e.sets
          : 1;
    const reps =
      typeof e.patientReps === 'number'
        ? e.patientReps
        : typeof e.reps === 'number'
          ? e.reps
          : 0;
    out.push({
      id: e.id,
      name: typeof e.name === 'string' ? e.name : e.id,
      sets,
      reps,
      holdSeconds: typeof e.holdSeconds === 'number' ? e.holdSeconds : null,
      difficulty: typeof e.difficulty === 'number' ? e.difficulty : 2,
      targetArea:
        typeof e.targetArea === 'string'
          ? e.targetArea
          : typeof e.target_area === 'string'
            ? e.target_area
            : undefined,
      muscleGroup:
        typeof e.muscleGroup === 'string'
          ? e.muscleGroup
          : typeof e.muscle_group === 'string'
            ? e.muscle_group
            : undefined,
      clinicalRegressionHint:
        typeof e.clinicalRegressionHint === 'string'
          ? e.clinicalRegressionHint
          : null,
      clinicalProgressionHint:
        typeof e.clinicalProgressionHint === 'string'
          ? e.clinicalProgressionHint
          : null,
    });
  }
  return out;
}

function mergeProposedOntoPlan(
  currentPlan: unknown[],
  proposedSlice: Array<Record<string, unknown>>
): unknown[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of proposedSlice) {
    if (typeof p.id === 'string') byId.set(p.id, p);
  }
  const replaced = new Set<string>();
  for (const p of proposedSlice) {
    if (typeof p.replacedExerciseId === 'string') replaced.add(p.replacedExerciseId);
  }
  const result: unknown[] = [];
  for (const raw of currentPlan) {
    const e = asRecord(raw);
    if (!e || typeof e.id !== 'string') {
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

/**
 * Therapist debug: run catalog-driven review now for one patient, bypassing
 * grace / 3-day due / rejection cooldown. Never auto-applies the plan.
 */
export async function forceRunProgramReviewForPatient(
  patientId: string,
  opts?: { client?: SupabaseClient | null }
): Promise<
  ServiceResult<{
    decision: ProgramReviewDecision;
    status: ProgramReviewProposalStatus;
    proposalId: string;
    catalogDrivenSwaps: number;
  }>
> {
  const gate = clientOrFail();
  if (!gate.ok) return gate;
  const client = opts?.client ?? gate.data;
  const pid = patientId.trim();
  if (!pid) return serviceFail('מזהה מטופל חסר.');

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) return serviceFail('נדרשת התחברות מטפל.');

  try {
    await setEnginePhase(client, 'scanning', { forceDebug: true });

    const { data: patient, error: patientErr } = await client
      .from('patients')
      .select('id, therapist_id, account_frozen, status, payload, subscription_tier')
      .eq('id', pid)
      .maybeSingle();
    if (patientErr) {
      return serviceFail(
        sanitizeDbErrorMessage(patientErr.message, 'לא ניתן לטעון את המטופל.')
      );
    }
    if (!patient) return serviceFail('המטופל לא נמצא.');
    if (patient.therapist_id !== user.id) {
      return serviceFail('אין הרשאה להריץ ביקורת על מטופל זה.');
    }
    if (String(patient.subscription_tier ?? '').toLowerCase() !== 'generic') {
      return serviceFail(
        'ביקורת תוכנית אוטומטית זמינה למטופלי Generic בלבד. למטופלי Premium השתמשו בתובנות AI של המטפל.'
      );
    }

    const { data: existingPendingEarly } = await client
      .from('program_review_proposals')
      .select('id')
      .eq('patient_id', pid)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingPendingEarly?.id) {
      await setEnginePhase(client, 'idle', { forceDebug: true, skipped: 'pending_exists' });
      return serviceFail(
        'כבר קיימת הצעה ממתינה לאישור עבור מטופל זה. אשרו או דחו אותה לפני הרצת בדיקה חדשה.'
      );
    }

    const clinicalToday = getClinicalDate();
    const windowEnd = clinicalToday;
    const windowStart = addClinicalDays(clinicalToday, -(PROGRAM_REVIEW_WINDOW_DAYS - 1));
    // Wider lookback for debug so catalog rules have signal even mid-cycle.
    const lookbackStart = addClinicalDays(clinicalToday, -14);

    await setEnginePhase(client, 'analyzing', {
      forceDebug: true,
      clinicalToday,
      windowStart,
      windowEnd,
    });

    const catalogRows = await fetchExerciseCatalog();
    const catalog: ProgramReviewCatalogCandidate[] = catalogRows
      .filter((r) => r.is_active)
      .map((r) => ({
        id: r.id,
        name: r.name,
        sets: r.sets,
        reps: r.reps,
        holdSeconds: r.hold_seconds,
        difficulty: r.difficulty,
        targetArea: r.target_area,
        muscleGroup: r.muscle_group,
        clinicalRegressionHint: r.clinical_regression_hint,
        clinicalProgressionHint: r.clinical_progression_hint,
      }));

    const { data: sessions, error: sessErr } = await client
      .from('session_history')
      .select('session_date, payload')
      .eq('patient_id', pid)
      .gte('session_date', lookbackStart)
      .lte('session_date', windowEnd);
    if (sessErr) {
      await setEnginePhase(client, 'idle', { forceDebug: true, error: 'sessions' });
      return serviceFail(
        sanitizeDbErrorMessage(sessErr.message, 'לא ניתן לטעון יומני אימון.')
      );
    }

    let daysWithWork = 0;
    let planned = 0;
    let completed = 0;
    const painSamples: ProgramReviewPainSample[] = [];
    const workDays = new Set<string>();
    for (const s of sessions ?? []) {
      const ymd = String(s.session_date).slice(0, 10);
      if (sessionHasWork(s.payload)) workDays.add(ymd);
      const p = asRecord(s.payload);
      const doneIds = Array.isArray(p?.completedIds) ? p!.completedIds : [];
      completed += doneIds.length;
      planned += Math.max(doneIds.length, 1);
      if (Array.isArray(p?.finishReports)) {
        for (const raw of p!.finishReports) {
          const r = asRecord(raw);
          if (!r) continue;
          const exerciseId = typeof r.exerciseId === 'string' ? r.exerciseId : '';
          const pain = typeof r.painLevel === 'number' ? r.painLevel : null;
          if (!exerciseId || pain == null) continue;
          painSamples.push({ exerciseId, painLevel: pain, sessionDate: ymd });
        }
      }
    }
    daysWithWork = workDays.size;
    const adherenceRate = planned > 0 ? completed / Math.max(planned, 1) : null;

    const { data: planRow, error: planErr } = await client
      .from('exercise_plans')
      .select('id, exercises')
      .eq('patient_id', pid)
      .eq('is_active', true)
      .maybeSingle();
    if (planErr) {
      await setEnginePhase(client, 'idle', { forceDebug: true, error: 'plan' });
      return serviceFail(
        sanitizeDbErrorMessage(planErr.message, 'לא ניתן לטעון תוכנית פעילה.')
      );
    }

    let exercisesRaw = planRow?.exercises;
    if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
      const payload = asRecord(patient.payload);
      const cache = payload?._exercisePlanCache;
      if (Array.isArray(cache)) exercisesRaw = cache;
    }
    const exercises = mapPlanExercises(exercisesRaw);
    if (exercises.length === 0) {
      await setEnginePhase(client, 'idle', { forceDebug: true, error: 'no_exercises' });
      return serviceFail('אין תרגילים בתוכנית הפעילה להרצת ביקורת.');
    }

    // Force: treat as fully logged window so progression/reduce rules can fire from lookback data.
    const result = evaluateProgramReview({
      exercises,
      painSamples,
      daysWithWork: Math.max(daysWithWork, PROGRAM_REVIEW_WINDOW_DAYS),
      adherenceRate: adherenceRate ?? 0.85,
      catalog,
    });

    const proposedFull = mergeProposedOntoPlan(
      Array.isArray(exercisesRaw) ? (exercisesRaw as unknown[]) : [],
      result.proposedExercises
    );
    const status: ProgramReviewProposalStatus =
      result.decision === 'maintain' ? 'auto_recorded' : 'pending';
    const rationale = `[בדיקה ידנית] ${result.rationaleHebrew}`;
    const metrics = { ...result.metrics, forceDebug: true };

    const { data: existingPending } = await client
      .from('program_review_proposals')
      .select('id')
      .eq('patient_id', pid)
      .eq('status', 'pending')
      .maybeSingle();

    let proposalId: string;
    if (existingPending?.id && status === 'pending') {
      const { error: updErr } = await client
        .from('program_review_proposals')
        .update({
          review_window_start: windowStart,
          review_window_end: windowEnd,
          decision: result.decision,
          rationale,
          proposed_exercises: proposedFull,
          proposed_changes: result.proposedChanges,
          metrics,
        })
        .eq('id', existingPending.id);
      if (updErr) {
        await setEnginePhase(client, 'idle', { forceDebug: true, error: 'update' });
        return serviceFail(
          sanitizeDbErrorMessage(updErr.message, 'עדכון הצעת הבדיקה נכשל.')
        );
      }
      proposalId = String(existingPending.id);
    } else {
      // Never auto-decline a pending proposal to make room for auto_recorded.
      if (existingPending?.id) {
        await setEnginePhase(client, 'idle', { forceDebug: true, skipped: 'pending_exists' });
        return serviceFail(
          'כבר קיימת הצעה ממתינה לאישור עבור מטופל זה. אשרו או דחו אותה לפני הרצת בדיקה חדשה.'
        );
      }
      const { data: inserted, error: insertErr } = await client
        .from('program_review_proposals')
        .insert({
          patient_id: pid,
          therapist_id: user.id,
          review_window_start: windowStart,
          review_window_end: windowEnd,
          decision: result.decision,
          rationale,
          proposed_exercises: proposedFull,
          proposed_changes: result.proposedChanges,
          metrics,
          status,
          resolved_at: status === 'auto_recorded' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (insertErr || !inserted?.id) {
        await setEnginePhase(client, 'idle', { forceDebug: true, error: 'insert' });
        return serviceFail(
          sanitizeDbErrorMessage(insertErr?.message, 'שמירת הצעת הבדיקה נכשלה.')
        );
      }
      proposalId = String(inserted.id);
    }

    await setEnginePhase(client, 'idle', {
      forceDebug: true,
      clinicalToday,
      decision: result.decision,
      status,
      catalogDrivenSwaps: result.metrics.catalogDrivenSwaps,
    });

    invalidateLatestProgramReviewCache(pid);
    return serviceOk({
      decision: result.decision,
      status,
      proposalId,
      catalogDrivenSwaps: result.metrics.catalogDrivenSwaps,
    });
  } catch (e) {
    try {
      await setEnginePhase(client, 'idle', { forceDebug: true, error: 'exception' });
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : 'שגיאה לא צפויה';
    return serviceFail(sanitizeDbErrorMessage(msg, 'הרצת ביקורת הבדיקה נכשלה.'));
  }
}

/** Hebrew summary for Gemini patient snapshot (no PHI). */
export function formatProgramReviewForPatientAi(
  row: ProgramReviewProposalRow | null,
  opts?: { inGracePeriod?: boolean; inRejectionCooldown?: boolean }
): string {
  const timingNote =
    'בשבוע הראשון בתוכנית אין הצעות התאמה אוטומטיות ממנוע החוקים הקליני. אחרי כן נבדקים דיווחים כל 3 ימים. ' +
    'אם המטפל דוחה הצעה — המערכת ממתינה מחזור מלא (לפחות 3 ימים) לפני בדיקה חוזרת. ' +
    'שינויי תוכנית נכנסים רק אחרי אישור מפורש של המטפל.';

  if (opts?.inGracePeriod) {
    return (
      'ביקורת תוכנית: כרגע בשבוע הראשון של התוכנית (תקופת הסתגלות) — ' +
      'אין הצעות התאמה אוטומטיות. ' +
      timingNote
    );
  }

  if (!row) {
    return `ביקורת תוכנית תלת־יומית: עדיין לא בוצעה ביקורת רקע. ${timingNote}`;
  }
  const statusHe =
    row.status === 'pending'
      ? 'ממתינה לאישור המטפל (טרם עודכנה התוכנית הפעילה)'
      : row.status === 'approved'
        ? 'אושרה ע״י המטפל ועודכנה בתוכנית'
        : row.status === 'declined'
          ? opts?.inRejectionCooldown
            ? 'נדחתה ע״י המטפל — בקירור של לפחות 3 ימים לפני מחזור ביקורת חדש'
            : 'נדחתה ע״י המטפל — התוכנית נשארה ללא שינוי'
          : 'נרשמה כשמירה על התוכנית (ללא שינוי נדרש)';
  const decisionHe =
    row.decision === 'reduce'
      ? 'הפחתה / החלפת תרגיל מקטלוג'
      : row.decision === 'progress'
        ? 'התקדמות / תרגיל מתקדם מקטלוג'
        : 'שמירה על התוכנית';
  return [
    `ביקורת תוכנית תלת־יומית אחרונה: חלון ${row.review_window_start} עד ${row.review_window_end}.`,
    `החלטה מוצעת: ${decisionHe}. סטטוס: ${statusHe}.`,
    row.metrics.avgPain != null ? `ממוצע כאב בחלון: ${row.metrics.avgPain}/10.` : '',
    timingNote,
  ]
    .filter(Boolean)
    .join(' ');
}
