import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type {
  AiSuggestion,
  ExercisePlan,
  KnowledgeFact,
  Patient,
  PatientExercise,
  SafetyAlert,
  Therapist,
} from '../types';
import {
  mergeExercisePlansWithPatientPayloadCache,
  normalizeCachedPatientExercises,
} from '../utils/exercisePlanCanonical';
import {
  isSupabaseAuthEnabled,
  normalizePortalUsername,
  portalUsernameToAuthEmail,
} from '../lib/patientPortalAuth';
import {
  ensureSupabaseSessionReady,
  logSupabaseCallError,
} from '../lib/supabaseSessionGuard';
import { sanitizeDbErrorMessage } from '../lib/dbErrorSanitizer';
import {
  tryParsePatientExerciseArray,
  tryParsePatientPayload,
} from '../lib/clinicalJsonbParse';
import { serviceFail, serviceOk, type ServiceResult } from '../lib/serviceResult';
import { devLog, devWarn, redactId } from '../lib/safeLog';
import {
  getAppKbHydratedFromCloud,
  hasAttemptedGlobalKbMigrationForTherapist,
  markGlobalKbMigrationAttemptedForTherapist,
} from '../lib/kbHydrationGate';
import { fetchAppKnowledgeBaseFromSupabase } from './gamificationService';
import { embedClinicalInsightsIntoPatients } from '../utils/clinicalInsightsPayload';
import {
  migratePatientsClinicalIntakeProfiles,
  type BatchClinicalIntakeProfileMigrationResult,
} from '../utils/clinicalIntakeProfileMigration';
import {
  aggregateKnowledgeFactsFromPatientPayloads,
  canonicalizeAccountControl,
  mergeAccountControlForUpsert,
  mergeKnowledgeFactsForUpsert,
  mergeKnowledgeFactsHydrateFromTherapistCloud,
  mergePainHistoryUnique,
  mergePatientPayloadForUpsert,
  mergeSessionCompletionByDateMaps,
  mergeSessionHistoryByDate,
  patientPayloadIsFrozen,
  type MergeKnowledgeFactsForUpsertOptions,
  type MergePatientPayloadOptions,
} from './patientPayloadMerge';

/** Re-export pure merge/canonicalize helpers (canonical home: `patientPayloadMerge.ts`). */
export {
  aggregateKnowledgeFactsFromPatientPayloads,
  canonicalizeAccountControl,
  mergeAccountControlForUpsert,
  mergeKnowledgeFactsForUpsert,
  mergeKnowledgeFactsHydrateFromTherapistCloud,
  mergePainHistoryUnique,
  mergePatientPayloadForUpsert,
  mergeSessionCompletionByDateMaps,
  mergeSessionHistoryByDate,
  patientPayloadIsFrozen,
  type MergeKnowledgeFactsForUpsertOptions,
  type MergePatientPayloadOptions,
};

/**
 * בסיס ידע גלובלי («הידעת?») — לא נמשך כאן בשאילתות קליניות.
 *
 * המאגר ב־Supabase: טבלה `app_knowledge_base` — לרוב שורה לכל מטפל עם `id` / `therapist_id` = `auth.uid()`, עמודת `items` (JSONB).
 * אין פילטר SQL ל־`is_approved` על כל איבר בתוך ה־JSON; הפילטר לפורטל המטופל מיושם ב־`fetchAppKnowledgeBaseFromSupabase`
 * (ב־`gamificationService.ts`) עם `{ approvedOnly: true }` — לאחר הנירמול ב־`knowledgeFactNormalize.ts`.
 */

/**
 * RLS requires `patients.therapist_id = auth.uid()::text`. Legacy data may use
 * `therapist-001` / `therapist-002`; map those to the signed-in user's real id.
 */
export function resolveTherapistIdForSupabaseRls(patientTherapistId: string, user: User): string | null {
  if (patientTherapistId === user.id) return user.id;
  if (patientTherapistId === 'therapist-001' || patientTherapistId === 'therapist-002') {
    return user.id;
  }
  return null;
}

/**
 * ממתין ל־`auth.uid()` יציב אחרי ריענון/כניסה לפני fetch/write של `app_knowledge_base`.
 */
export async function resolveStableAuthUserIdForKb(
  client: SupabaseClient,
  opts?: { maxWaitMs?: number; pollMs?: number }
): Promise<string | null> {
  if (!isSupabaseAuthEnabled()) return null;

  const maxWaitMs = opts?.maxWaitMs ?? 12_000;
  const pollMs = opts?.pollMs ?? 100;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    const uid = user?.id?.trim();
    if (uid) return uid;
    if (userErr && import.meta.env.DEV) {
      console.warn('[TIP_SYNC] resolveStableAuthUserIdForKb: getUser error (retrying)', userErr);
    }

    const {
      data: { session },
    } = await client.auth.getSession();
    const sid = session?.user?.id?.trim();
    if (sid) return sid;

    await new Promise((r) => setTimeout(r, pollMs));
  }

  console.warn('[TIP_SYNC] resolveStableAuthUserIdForKb: timeout — auth uid not ready');
  return null;
}

const THERAPISTS_BY_ID: Record<string, Therapist> = {};

/**
 * Default: only columns that exist on trimmed `patients` schemas (avoids PostgREST 400).
 * Set `VITE_PATIENTS_UPSERT_FULL_COLUMNS=true` if your DB includes mirrored demographics
 * (`contact_email`, `age`, `gender`, `birth_date`, …).
 */
const PATIENTS_UPSERT_FULL_DENORMALIZED =
  import.meta.env.VITE_PATIENTS_UPSERT_FULL_COLUMNS === 'true';

/** Strip keys whose value is `undefined` so PostgREST never receives literal undefined. */
function shallowStripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/**
 * טוען שורת מטפל; אם ריקה — ניסיון חד־פעמי למיגרציה משורת legacy `id='global'`,
 * כולל upsert לשורת המטפל (`bypassKbHydrationGate`).
 * ה-fetch עצמו מוגבל בזמן ב־{@link fetchAppKnowledgeBaseFromSupabase} (gamificationService).
 */
export async function fetchTherapistAppKbWithLegacyGlobalFallback(
  client: SupabaseClient,
  therapistAuthUserId: string | undefined,
  fetchOpts?: { approvedOnly?: boolean }
): Promise<{ items: KnowledgeFact[] | undefined; deletedSeedIds: string[] }> {
  const rowTherapist = await fetchAppKnowledgeBaseFromSupabase(client, {
    ...fetchOpts,
    ...(therapistAuthUserId ? { therapistAuthUserId } : {}),
  });
  const therapistItems = rowTherapist?.items ?? [];
  const deletedSeedIds = rowTherapist?.deletedSeedIds ?? [];

  if (therapistAuthUserId && therapistItems.length === 0) {
    if (!hasAttemptedGlobalKbMigrationForTherapist(therapistAuthUserId)) {
      markGlobalKbMigrationAttemptedForTherapist(therapistAuthUserId);
      const legacyRow = await fetchAppKnowledgeBaseFromSupabase(client, fetchOpts);
      const legacyItems = legacyRow?.items ?? [];
      if (legacyItems.length > 0) {
        console.warn('[TIP_SYNC] Legacy global app_knowledge_base — migrating to therapist row', {
          therapistAuthUserId,
          itemCount: legacyItems.length,
        });
        const mig = await upsertGlobalAppKnowledgeBaseWithTipSyncLog(
          client,
          legacyItems,
          new Date().toISOString(),
          { bypassKbHydrationGate: true }
        );
        if (!mig.ok && import.meta.env.DEV) {
          console.warn('[TIP_SYNC] KB migration upsert failed', mig.message);
        }
        return { items: legacyItems, deletedSeedIds: legacyRow?.deletedSeedIds ?? [] };
      }
    }
  }

  return {
    items: therapistItems.length > 0 ? therapistItems : undefined,
    deletedSeedIds,
  };
}

/**
 * כתיבה לטבלת `app_knowledge_base` — כולל `therapist_id` (ומפתח `id` תואם) כדי לעבור RLS.
 */
export async function upsertGlobalAppKnowledgeBaseWithTipSyncLog(
  client: SupabaseClient,
  knowledgeItems: KnowledgeFact[],
  now: string,
  opts?: {
    bypassKbHydrationGate?: boolean;
    /** מתמזג ל-`deleted_seed_ids` הקיים בשורה (dedupe) — לא דורס את המערך. */
    appendDeletedSeedIds?: string[];
  }
): Promise<AppKnowledgeBaseSaveOutcome> {
  if (
    isSupabaseAuthEnabled() &&
    !opts?.bypassKbHydrationGate &&
    !getAppKbHydratedFromCloud()
  ) {
    console.warn(
      '[TIP_SYNC] app_knowledge_base upsert skipped — KB not hydrated from cloud yet (startup gate)'
    );
    return {
      ok: true,
      data: null,
      therapistAuthUserId: null,
      skippedReason: 'kb-not-hydrated',
    };
  }

  let therapistAuthUserId: string | null = null;
  if (isSupabaseAuthEnabled()) {
    therapistAuthUserId = await resolveStableAuthUserIdForKb(client, { maxWaitMs: 10_000 });
    if (!therapistAuthUserId) {
      const {
        data: { user },
        error: userErr,
      } = await client.auth.getUser();
      if (!userErr && user?.id?.trim()) therapistAuthUserId = user.id.trim();
    }
  }

  const rowId = therapistAuthUserId ?? 'global';

  let existingDeleted: string[] = [];
  try {
    const { data: existingRow } = await client
      .from('app_knowledge_base')
      .select('deleted_seed_ids')
      .eq('id', rowId)
      .maybeSingle();
    const rawDel =
      existingRow &&
      typeof existingRow === 'object' &&
      'deleted_seed_ids' in existingRow
        ? (existingRow as { deleted_seed_ids?: unknown }).deleted_seed_ids
        : undefined;
    if (Array.isArray(rawDel)) {
      existingDeleted = rawDel.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
  } catch {
    /* ignore — upsert still proceeds */
  }

  const append = (opts?.appendDeletedSeedIds ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const mergedDeletedSeedIds = [...new Set([...existingDeleted, ...append])];

  const row: Record<string, unknown> = {
    items: knowledgeItems,
    deleted_seed_ids: mergedDeletedSeedIds,
    updated_at: now,
  };
  if (therapistAuthUserId) {
    row.id = therapistAuthUserId;
    row.therapist_id = therapistAuthUserId;
  } else {
    row.id = 'global';
  }

  if (import.meta.env.DEV) {
    console.log('[DEBUG_KB_PAYLOAD] Sending item count:', knowledgeItems.length);
  }

  const { data, error } = await client
    .from('app_knowledge_base')
    .upsert(row, { onConflict: 'id' })
    .select();

  if (error) {
    const code = 'code' in error ? String((error as { code?: string }).code) : '';
    const isMissingTable =
      code === 'PGRST205' ||
      /404|not find the table|schema cache/i.test(error.message ?? '');
    const hint = isMissingTable
      ? ' — יש להחיל מיגרציות (app_knowledge_base + therapist_id + deleted_seed_ids) על פרויקט Supabase המקושר.'
      : '';
    return {
      ok: false,
      message: `app_knowledge_base: ${error.message}${hint}`,
      httpStatus: postgrestHttpStatus(error),
      code,
      raw: error,
      therapistAuthUserId,
    };
  }

  if (import.meta.env.DEV) {
    console.log('[TIP_SYNC] app_knowledge_base upsert', {
      table: 'app_knowledge_base',
      therapistAuthUserId,
      itemCount: knowledgeItems.length,
      returnedRows: data,
    });
  }

  return { ok: true, data: data ?? null, therapistAuthUserId };
}

/**
 * Portal workout / session save: stamp payload activity fields and `patients.updated_at`
 * so therapist roster ordering and Realtime UPDATE events stay in sync.
 */
export async function touchPatientPortalWorkoutActivity(
  client: SupabaseClient,
  patientId: string
): Promise<void> {
  const id = patientId.trim();
  if (!id) return;

  try {
    const nowIso = new Date().toISOString();
    const { data: row, error: fetchErr } = await client
      .from('patients')
      .select('payload')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      if (import.meta.env.DEV) {
        console.warn('[touchPatientPortalWorkoutActivity] fetch', fetchErr.message);
      }
      return;
    }
    if (!row) return;

    const payloadRoot =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    if (!payloadRoot || typeof payloadRoot.id !== 'string' || !payloadRoot.id.trim()) {
      if (import.meta.env.DEV) {
        console.warn('[touchPatientPortalWorkoutActivity] patient payload unreadable');
      }
      return;
    }

    const mergedPayload = { ...payloadRoot, lastWorkoutAt: nowIso };
    const { error } = await client
      .from('patients')
      .update({
        payload: mergedPayload,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (error && import.meta.env.DEV) {
      console.warn('[touchPatientPortalWorkoutActivity]', error.message);
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[touchPatientPortalWorkoutActivity] catch', e);
    }
  }
}

function consoleTableBeforePatientsUpsert(row: Record<string, unknown>, label: string) {
  if (!import.meta.env.DEV) return;
  const p = row.payload as Record<string, unknown> | null | undefined;
  const payloadKeys = p && typeof p === 'object' ? Object.keys(p).length : 0;
  console.log(`[upsertPatientRecords] ▶ ${label}`, {
    idPresent: typeof row.id === 'string' && row.id.length > 0,
    therapistIdPresent: typeof row.therapist_id === 'string' && row.therapist_id.length > 0,
    payloadKeys,
  });
}

function consoleTableExercisePlanRow(label: string, row: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  const ex = row.exercises;
  const exN = Array.isArray(ex) ? (ex as unknown[]).length : '—';
  console.log(`[upsertExercisePlans] ▶ ${label}`, {
    hasPatientId: typeof row.patient_id === 'string' && row.patient_id.length > 0,
    version_number: row.version_number,
    is_active: row.is_active,
    exercises: exN,
  });
}

/** HTTP status when PostgREST / Auth returns one (helps surface 400/401 to the UI). */
export function postgrestHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const s = o.status ?? o.statusCode;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return undefined;
}

export function clinicalPushFail(message: string, err?: unknown): {
  ok: false;
  message: string;
  httpStatus?: number;
} {
  const httpStatus = err !== undefined ? postgrestHttpStatus(err) : undefined;
  const safeMessage = sanitizeDbErrorMessage(message);
  return serviceFail(
    safeMessage,
    httpStatus !== undefined ? { httpStatus } : undefined,
  );
}

/** תוצאת upsert ל־app_knowledge_base כולל גוף תשובה לדיבוג (403/400 וכו׳). */
export type AppKnowledgeBaseSaveOutcome =
  | {
      ok: true;
      data: unknown | null;
      therapistAuthUserId: string | null;
      skippedReason?: 'kb-not-hydrated';
    }
  | {
      ok: false;
      message: string;
      httpStatus?: number;
      code?: string;
      raw?: unknown;
      therapistAuthUserId: string | null;
    };

export type ClinicalPushResult =
  | { ok: true; syncedPatients?: Patient[]; knowledgeBaseUpsert?: AppKnowledgeBaseSaveOutcome }
  | { ok: false; message: string; httpStatus?: number; knowledgeBaseUpsert?: AppKnowledgeBaseSaveOutcome };

export type ClinicalAuditLogRow = {
  id: string;
  therapist_id: string;
  patient_id: string;
  entity_type: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

/**
 * Therapist profile rows for Supabase — used when syncing patient state (patient.therapistId).
 *
 * With Supabase Auth + RLS (`profiles.id = auth.uid()::text`), only the signed-in user's row may be
 * written. Demo ids like `therapist-001` are not valid UUIDs for `auth.uid()` — upserting them causes 400.
 * When {@link isSupabaseAuthEnabled} is true, we only upsert the row for `auth.getUser().id`.
 */
export async function upsertTherapistProfilesForPatients(
  client: SupabaseClient,
  patients: Patient[],
  now: string
): Promise<ClinicalPushResult> {
  let therapistIds: string[];
  let authUser: User | null = null;

  if (isSupabaseAuthEnabled()) {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: true };
    }
    therapistIds = [user.id];
    authUser = user;
  } else {
    const ids = new Set<string>();
    for (const p of patients) {
      ids.add(p.therapistId);
    }
    therapistIds = [...ids];
  }

  const profileRows = therapistIds.map((id) => {
    const t = THERAPISTS_BY_ID[id] ?? {
      id,
      name: 'מטפל',
      email: '',
      title: '',
      avatarInitials: '—',
      clinicName: '',
    };
    const meta = authUser?.user_metadata as Record<string, unknown> | undefined;
    const fromMetaName =
      typeof meta?.full_name === 'string' && meta.full_name.trim()
        ? meta.full_name.trim()
        : typeof meta?.name === 'string' && meta.name.trim()
          ? meta.name.trim()
          : '';
    return {
      id,
      email:
        authUser?.id === id && authUser.email?.trim()
          ? authUser.email.trim()
          : t.email,
      name: fromMetaName || t.name,
      title: t.title,
      avatar_initials: t.avatarInitials,
      clinic_name: t.clinicName,
      updated_at: now,
    };
  });

  if (profileRows.length > 0) {
    const { error } = await client.from('profiles').upsert(profileRows, { onConflict: 'id' });
    if (error) return clinicalPushFail(`profiles: ${error.message}`, error);
  }

  return { ok: true };
}

async function insertClinicalAuditLog(
  client: SupabaseClient,
  row: {
    therapistId: string;
    patientId: string;
    entityType: 'plan' | 'patient_info' | 'recommendation';
    action: 'create' | 'update' | 'approve' | 'decline';
    oldValue: unknown;
    newValue: unknown;
  }
): Promise<ClinicalPushResult> {
  const { error } = await client.from('clinical_audit_logs').insert({
    therapist_id: row.therapistId,
    patient_id: row.patientId,
    entity_type: row.entityType,
    action: row.action,
    old_value: row.oldValue,
    new_value: row.newValue,
  });
  if (error) return clinicalPushFail(`clinical_audit_logs: ${error.message}`, error);
  return { ok: true };
}

/** Logs therapist approval of an AI clinical recommendation to `clinical_audit_logs`. */
export async function logRecommendationApprovalAudit(
  client: SupabaseClient,
  row: {
    therapistId: string;
    patientId: string;
    suggestion: AiSuggestion;
    appliedPlanUpdates: Record<string, unknown>;
  }
): Promise<ClinicalPushResult> {
  return insertClinicalAuditLog(client, {
    therapistId: row.therapistId,
    patientId: row.patientId,
    entityType: 'recommendation',
    action: 'approve',
    oldValue: row.suggestion,
    newValue: {
      suggestionId: row.suggestion.id,
      appliedPlanUpdates: row.appliedPlanUpdates,
      approvedAt: new Date().toISOString(),
    },
  });
}

/** Logs therapist dismissal of an AI clinical recommendation to `clinical_audit_logs`. */
export async function logRecommendationDismissAudit(
  client: SupabaseClient,
  row: {
    therapistId: string;
    patientId: string;
    suggestion: AiSuggestion;
  }
): Promise<ClinicalPushResult> {
  return insertClinicalAuditLog(client, {
    therapistId: row.therapistId,
    patientId: row.patientId,
    entityType: 'recommendation',
    action: 'decline',
    oldValue: row.suggestion,
    newValue: {
      suggestionId: row.suggestion.id,
      dismissedAt: new Date().toISOString(),
      status: 'dismissed',
    },
  });
}

/**
 * Persists the full clinical insights queue shard for one patient to Supabase
 * (`patients.payload.clinicalInsightsQueue`).
 */
export async function persistPatientClinicalInsightsQueue(
  client: SupabaseClient,
  patient: Patient,
  aiSuggestions: AiSuggestion[],
  safetyAlerts: SafetyAlert[],
  now: string
): Promise<ClinicalPushResult> {
  const patientSuggestions = aiSuggestions.filter((s) => s.patientId === patient.id);
  const patientAlerts = safetyAlerts.filter((a) => a.patientId === patient.id);
  const [embedded] = embedClinicalInsightsIntoPatients(
    [patient],
    patientSuggestions,
    patientAlerts,
    now
  );
  return upsertPatientRecords(client, [embedded], now);
}

export type UpsertPatientRecordsOptions = {
  /** When set (portal patient / RLS patient role), only this row is written to `patients`. */
  onlyPatientId?: string;
  /**
   * Supabase Auth UUID for the portal patient account just created by
   * {@link signUpPortalPatientOnCreate}.  When provided, it is written into
   * `patients.auth_user_id` immediately so the patient can access their data
   * via the portal without waiting for their first login to trigger
   * `link_patient_auth_user`.
   *
   * Only include a value here when the patients being upserted correspond to
   * this specific newly-created Auth user.  On subsequent saves (autosave,
   * full-sync) omit this option so existing `auth_user_id` values are never
   * accidentally overwritten.
   */
  authUserId?: string;
  /**
   * When true, patient payload merge drops KB facts that exist only on the server
   * (local list wins for membership). Pass for therapist-driven deletes.
   * When omitted, defaults to hydrated therapist-dashboard behavior.
   */
  trustKnowledgeFactDeletions?: boolean;
  /**
   * Therapist intentional freeze/unfreeze — lets incoming account control win over
   * sticky server freeze protection. Never set from patient portal upserts.
   */
  trustIncomingAccountControl?: boolean;
};

export async function upsertPatientRecords(
  client: SupabaseClient,
  patients: Patient[],
  now: string,
  options?: UpsertPatientRecordsOptions
): Promise<ClinicalPushResult> {
  try {
  const onlyId = options?.onlyPatientId?.trim();
  // auth_user_id to set at creation time (from signUpPortalPatientOnCreate).
  // Empty string means "not provided" — we won't include the column so we don't
  // accidentally clear an existing link.
  const newAuthUserId = options?.authUserId?.trim() || null;
  const source =
    onlyId && onlyId.length > 0 ? patients.filter((p) => p.id === onlyId) : patients;
  const skipAudit = Boolean(onlyId && onlyId.length > 0);
  const isPatientPortal = Boolean(onlyId && onlyId.length > 0);

  if (isSupabaseAuthEnabled()) {
    const guard = await ensureSupabaseSessionReady(client, {
      context: isPatientPortal ? 'שמירת מטופל (פורטל)' : 'שמירת מטופל (דשבורד מטפל)',
      alertUser: false,
    });
    if (!guard.ok) {
      return { ok: false, message: `patients: ${guard.message}` };
    }
  }

  let therapistUser: User | null = null;
  if (isSupabaseAuthEnabled() && !isPatientPortal) {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: false, message: 'patients: נדרש מטפל מחובר ל-Supabase לכתיבה' };
    }
    therapistUser = user;
  }

  let wroteAny = false;
  const syncedPatients: Patient[] = [];

  for (const p of source) {
    const patientRowId = (p.id ?? '').trim();
    if (!patientRowId) {
      console.warn('[upsertPatientRecords] skipping patient without id');
      continue;
    }

    let therapistIdForRow = p.therapistId;
    let payloadForRow: Patient = p;

    if (therapistUser) {
      const resolved = resolveTherapistIdForSupabaseRls(p.therapistId, therapistUser);
      if (resolved === null) {
        therapistIdForRow = therapistUser.id;
        payloadForRow =
          p.therapistId === therapistUser.id ? p : { ...p, therapistId: therapistUser.id };
      } else {
        therapistIdForRow = resolved;
        payloadForRow = resolved === p.therapistId ? p : { ...p, therapistId: resolved };
      }
    }

    const { data: existing, error: fetchErr } = await client
      .from('patients')
      .select('payload, therapist_id, auth_user_id')
      .eq('id', patientRowId)
      .maybeSingle();

    if (fetchErr) {
      if (import.meta.env.DEV) {
        console.error('[SYNC_ERROR] upsertPatientRecords/select', fetchErr.message);
      }
      logSupabaseCallError('upsertPatientRecords/select', fetchErr, { patientId: patientRowId });
      return clinicalPushFail(`patients: ${fetchErr.message}`, fetchErr);
    }

    const oldPayload =
      existing?.payload != null ? tryParsePatientPayload(existing.payload) ?? undefined : undefined;

    /** patients.auth_user_id = portal patient's Auth id only — never the therapist's uid */

    const rawUsername = payloadForRow.portalUsername?.trim() ?? '';
    const contactEmail = rawUsername
      ? portalUsernameToAuthEmail(normalizePortalUsername(rawUsername))
      : '';

    const ageVal =
      typeof payloadForRow.age === 'number' && Number.isFinite(payloadForRow.age)
        ? Math.round(payloadForRow.age)
        : null;
    const birthRaw = payloadForRow.birthDate?.trim();
    const birthDateSql =
      birthRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthRaw) ? birthRaw : null;
    const occupationSql = payloadForRow.occupation?.trim()
      ? payloadForRow.occupation.trim()
      : null;
    const demoFree =
      typeof payloadForRow.demographicsFreeText === 'string'
        ? payloadForRow.demographicsFreeText.trim()
        : '';
    const activeArea =
      payloadForRow.primaryBodyArea != null && `${payloadForRow.primaryBodyArea}`.trim() !== ''
        ? String(payloadForRow.primaryBodyArea)
        : null;

    const payloadDraft: Patient = {
      ...payloadForRow,
      id: patientRowId,
      therapistId: therapistIdForRow,
      name: (payloadForRow.name ?? '').trim() || payloadForRow.name,
      demographicsFreeText: demoFree.length > 0 ? demoFree : undefined,
      occupation: occupationSql ?? undefined,
      birthDate: birthDateSql ?? undefined,
      primaryBodyArea: payloadForRow.primaryBodyArea,
    };

    /** Merge with DB row so stale clients cannot zero out XP/coins (see {@link mergePatientPayloadForUpsert}). */
    const omitKnowledgeFactsForCloud =
      isSupabaseAuthEnabled() && !isPatientPortal && !getAppKbHydratedFromCloud();
    const defaultTrustKbDel = !omitKnowledgeFactsForCloud && !isPatientPortal;
    const trustKbDel =
      options?.trustKnowledgeFactDeletions !== undefined
        ? options.trustKnowledgeFactDeletions
        : defaultTrustKbDel;
    const trustAccountControl =
      !isPatientPortal && options?.trustIncomingAccountControl === true;
    let payloadForUpsert = mergePatientPayloadForUpsert(oldPayload, payloadDraft, {
      omitKnowledgeFactsForCloud,
      therapistTrustKnowledgeFactDeletions: trustKbDel,
      trustIncomingAccountControl: trustAccountControl,
    });
    if ((payloadForUpsert.id ?? '').trim() !== patientRowId) {
      console.warn('[upsertPatientRecords] repairing payload id to match row key', {
        patientRowId,
        payloadId: payloadForUpsert.id,
      });
      payloadForUpsert = { ...payloadForUpsert, id: patientRowId };
    }
    /**
     * Portal self-updates: Phase5 BEFORE UPDATE trigger compares payload
     * accountFrozen / account_frozen / status with the DB row byte-for-byte.
     * Merge canonicalization can inject `accountFrozen: false` when the server
     * row omitted the key — that trips the lock even when freeze state is unchanged.
     * Preserve the exact server representation for patient portal writes.
     */
    if (isPatientPortal && oldPayload) {
      const oldRaw = oldPayload as Patient & { account_frozen?: unknown };
      if (Object.prototype.hasOwnProperty.call(oldRaw, 'accountFrozen')) {
        payloadForUpsert.accountFrozen = oldRaw.accountFrozen;
      } else {
        delete payloadForUpsert.accountFrozen;
      }
      if (Object.prototype.hasOwnProperty.call(oldRaw, 'status')) {
        payloadForUpsert.status = oldRaw.status;
      }
      const upsertRec = payloadForUpsert as Patient & { account_frozen?: unknown };
      if (Object.prototype.hasOwnProperty.call(oldRaw, 'account_frozen')) {
        upsertRec.account_frozen = oldRaw.account_frozen;
      } else {
        delete upsertRec.account_frozen;
      }
    }
    const firstName = (payloadForUpsert.name ?? '').trim();

    const baseRow: Record<string, unknown> = {
      id: payloadForUpsert.id,
      therapist_id: therapistIdForRow,
      first_name: firstName,
      active_area: activeArea,
      demographics_free_text: demoFree.length > 0 ? demoFree : null,
      occupation: occupationSql,
      payload: payloadForUpsert,
      updated_at: now,
    };

    if (PATIENTS_UPSERT_FULL_DENORMALIZED) {
      baseRow.contact_email = contactEmail;
      baseRow.age = ageVal;
      baseRow.gender = payloadForRow.clinicalSex ?? null;
      baseRow.birth_date = birthDateSql;
      if (newAuthUserId) {
        baseRow.auth_user_id = newAuthUserId;
      }
    }

    const upsertRow = shallowStripUndefined(baseRow);

    devLog('[upsertPatientRecords] row preview', {
      id: typeof upsertRow.id === 'string' ? redactId(upsertRow.id) : undefined,
      therapist_id:
        typeof upsertRow.therapist_id === 'string' ? redactId(upsertRow.therapist_id) : undefined,
      therapist_id_repaired: p.therapistId !== therapistIdForRow,
      full_denormalized: PATIENTS_UPSERT_FULL_DENORMALIZED,
      portalUpdateOnly: isPatientPortal,
    });
    consoleTableBeforePatientsUpsert(
      upsertRow,
      `${isPatientPortal ? 'UPDATE' : 'UPSERT'} patients id=${redactId(payloadForUpsert.id)}`
    );

    const selectCols = PATIENTS_UPSERT_FULL_DENORMALIZED
      ? 'id, therapist_id, updated_at, first_name, age, gender, occupation, birth_date, demographics_free_text, active_area, contact_email, payload'
      : 'id, therapist_id, updated_at, first_name, active_area, demographics_free_text, occupation, payload';

    /**
     * Portal patients only have UPDATE RLS (no INSERT). PostgREST `.upsert()` always
     * requires INSERT privilege for ON CONFLICT — that yields
     * "new row violates row-level security policy for table patients".
     * Existing portal rows must use `.update()` only.
     */
    let upserted: unknown[] | null = null;
    let error: { message: string; code?: string; details?: string; hint?: string } | null = null;

    if (isPatientPortal) {
      if (!existing) {
        console.error('EXERCISE_SAVE_FAIL_REASON', {
          scope: 'upsertPatientRecords/portal',
          code: 'PGRST_NO_ROW',
          message: 'patients row missing for portal update',
          patientId: redactId(patientRowId),
        });
        return clinicalPushFail('patients: שורת המטופל לא נמצאה לעדכון בפורטל');
      }
      // Never send auth_user_id / account_frozen / status on portal writes — lock trigger owns them.
      const { id: _omitId, ...portalUpdateRow } = upsertRow;
      void _omitId;
      const updateRes = await client
        .from('patients')
        .update(portalUpdateRow)
        .eq('id', patientRowId)
        .select(selectCols);
      upserted = updateRes.data;
      error = updateRes.error;
    } else {
      const upsertRes = await client
        .from('patients')
        .upsert([upsertRow], { onConflict: 'id' })
        .select(selectCols);
      upserted = upsertRes.data;
      error = upsertRes.error;
    }

    if (error) {
      console.error('EXERCISE_SAVE_FAIL_REASON', {
        scope: isPatientPortal ? 'upsertPatientRecords/portalUpdate' : 'upsertPatientRecords/upsert',
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        patientId: redactId(payloadForUpsert.id),
      });
      logSupabaseCallError('upsertPatientRecords/upsert', error, {
        patientId: redactId(payloadForUpsert.id),
        therapist_id: redactId(therapistIdForRow),
      });
      return clinicalPushFail(`patients: ${error.message}`, error);
    }
    if (isPatientPortal && (!upserted || upserted.length === 0)) {
      console.error('EXERCISE_SAVE_FAIL_REASON', {
        scope: 'upsertPatientRecords/portalUpdate',
        code: 'RLS_ZERO_ROWS',
        message: 'patients update returned 0 rows (RLS USING failed or wrong id)',
        patientId: redactId(patientRowId),
      });
      return clinicalPushFail('patients: העדכון נחסם — אין הרשאת עדכון לשורה');
    }
    devLog('[upsertPatientRecords] write select() ok', {
      rowCount: upserted?.length ?? 0,
      portalUpdateOnly: isPatientPortal,
    });

    for (const u of upserted ?? []) {
      const pl = tryParsePatientPayload((u as { payload?: unknown }).payload);
      if (pl) syncedPatients.push(pl);
    }

    wroteAny = true;

    if (skipAudit) continue;

    const audit =
      oldPayload === undefined
        ? await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: patientRowId,
            entityType: 'patient_info',
            action: 'create',
            oldValue: null,
            newValue: payloadForUpsert,
          })
        : await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: patientRowId,
            entityType: 'patient_info',
            action: 'update',
            oldValue: oldPayload,
            newValue: payloadForUpsert,
          });
    if (!audit.ok) return audit;
  }

  if (therapistUser && source.length > 0 && !wroteAny) {
    return {
      ok: false,
      message:
        'patients: אין מטופלים שמשויכים למטפל המחובר (או שורות קיימות ב-DB עם therapist_id ישן — עדכן ב-SQL או מחק מקומית)',
    };
  }

  return { ok: true, syncedPatients };
  } catch (e) {
    console.error('[SYNC_ERROR] upsertPatientRecords/unexpected', e);
    logSupabaseCallError('upsertPatientRecords/unexpected', e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type UpsertTreatmentReportOptions = Pick<
  UpsertPatientRecordsOptions,
  'onlyPatientId' | 'trustIncomingAccountControl'
> & {
  now?: string;
};

/**
 * Persists treatment documentation and related clinical narrative fields on the patient row
 * (`patients.payload`, including `clinicalTimeline`). Prefer this after merging new timeline
 * entries into a {@link Patient} snapshot so the payload matches what the user just saved.
 */
export async function upsertTreatmentReport(
  client: SupabaseClient,
  patient: Patient,
  options?: UpsertTreatmentReportOptions
): Promise<ClinicalPushResult> {
  const now = options?.now ?? new Date().toISOString();
  const onlyPatientId = options?.onlyPatientId?.trim();
  return upsertPatientRecords(client, [patient], now, {
    ...(onlyPatientId ? { onlyPatientId } : {}),
    ...(options?.trustIncomingAccountControl
      ? { trustIncomingAccountControl: true }
      : {}),
  });
}

/**
 * Returns the IDs of patient rows that have a `portalUsername` in their payload
 * but no `auth_user_id` set — i.e. the portal account was created but the patient
 * has never signed in (or the Auth link was lost).
 *
 * The therapist dashboard can call this after loading patients and warn the user
 * that these patients cannot yet access the patient portal.
 *
 * NOTE: `auth_user_id` is only used for *patient* RLS (portal access).
 * Therapist saves (exercise plans, patient records) use `therapist_id` and are
 * NOT affected by null `auth_user_id`.
 */
export async function fetchUnlinkedPortalPatientIds(
  client: SupabaseClient
): Promise<ServiceResult<string[]>> {
  const { data, error } = await client
    .from('patients')
    .select('id, payload, auth_user_id')
    .is('auth_user_id', null);

  if (error) {
    return serviceFail(error.message);
  }

  const unlinked: string[] = [];
  for (const row of data ?? []) {
    const payload = tryParsePatientPayload(row.payload);
    if (payload?.portalUsername?.trim()) {
      const rowId = typeof row.id === 'string' ? row.id.trim() : '';
      if (rowId) unlinked.push(rowId);
    }
  }

  if (unlinked.length > 0) {
    console.warn(
      '[fetchUnlinkedPortalPatientIds] מטופלים עם חשבון פורטל שלא התחברו מעולם (auth_user_id = NULL)',
      {
        count: unlinked.length,
        patientIds: unlinked,
        note: 'שמירות מטפל (exercise_plans, patients) אינן מושפעות. הגישה לפורטל המטופל תופעל רק לאחר כניסה ראשונה.',
      }
    );
  }

  return serviceOk(unlinked);
}

/** מחיקת שורת מטופל ב-Supabase (RLS — מטפל מחובר בלבד). מפעיל CASCADE למסדי תלות (תוכניות, היסטוריית סשנים, יומן ביקורת). חייב להצליח לפני ניקוי המצב המקומי. */
export async function deletePatientRowFromSupabase(
  client: SupabaseClient,
  patientId: string
): Promise<ClinicalPushResult> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user?.id) {
    return { ok: false, message: 'patients delete: נדרש מטפל מחובר ל-Supabase' };
  }

  // Filter by therapist_id (TEXT column, matches auth.uid()::text — satisfies RLS) and
  // the app patient ID stored inside the payload JSONB. This avoids touching the `id`
  // primary-key column whose type (TEXT vs UUID) may differ between environments.
  const { error } = await client
    .from('patients')
    .delete()
    .eq('therapist_id', user.id)
    .filter('payload->>id', 'eq', patientId)
    .select('therapist_id');

  if (error) {
    return { ok: false, message: `patients delete: ${error.message}` };
  }
  // If data is empty the row was already gone — treat as success.
  return { ok: true };
}

function logExercisePlansSupabaseError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>
) {
  if (!import.meta.env.DEV) return;
  const p = err as (PostgrestError & { status?: number; statusText?: string }) | undefined;
  const safeContext =
    context == null
      ? undefined
      : Object.fromEntries(
          Object.entries(context).map(([k, v]) => [
            k,
            typeof v === 'string' && /(id|patient|therapist|auth|uid)/i.test(k) ? redactId(v) : v,
          ]),
        );
  console.error(`[upsertExercisePlans] ${scope}`, {
    message: p?.message ?? (err instanceof Error ? err.message : String(err)),
    code: p?.code,
    status: p?.status,
    statusText: p?.statusText,
    details: p?.details,
    hint: p?.hint,
    ...safeContext,
  });
}

/**
 * Dev-only upsert diagnostics. Never emits row ids or payload bodies in production (Iron Rule 1).
 * JSONB arrays are summarized as `[N items]`.
 */
function logUpsertPayload(
  label: string,
  payload: Record<string, unknown>,
  extra?: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return;
  const display: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'patient_id' || k === 'patientId' || k === 'therapist_id' || k === 'id') {
      display[k] = typeof v === 'string' ? redactId(v) : v;
      continue;
    }
    display[k] = Array.isArray(v) ? `[${(v as unknown[]).length} items]` : v;
  }
  const safeExtra =
    extra == null
      ? undefined
      : Object.fromEntries(
          Object.entries(extra).map(([k, v]) => [
            k,
            typeof v === 'string' && /(id|patient|therapist)/i.test(k) ? redactId(v) : v,
          ]),
        );
  console.group(`[upsertExercisePlans] ▶ ${label}`);
  console.log('EXACT PAYLOAD KEYS:', Object.keys(payload).join(', '));
  console.log('EXACT PAYLOAD:', display);
  if (safeExtra) console.log('CONTEXT:', safeExtra);
  console.groupEnd();
}

function isUniqueOrConflictPostgrest(
  err: { code?: string; message?: string },
  httpStatus?: number
): boolean {
  if (err.code === '23505') return true;
  if (httpStatus === 409) return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('duplicate') || m.includes('unique') || m.includes('conflict');
}

async function deactivateAllActiveExercisePlansForPatient(
  client: SupabaseClient,
  patientId: string
): Promise<ClinicalPushResult> {
  const { error } = await client
    .from('exercise_plans')
    .update({ is_active: false })
    .eq('patient_id', patientId)
    .eq('is_active', true);
  if (error) {
    return clinicalPushFail(`exercise_plans: deactivate active plans: ${error.message}`, error);
  }
  return { ok: true };
}

/** Stop INSERT-versioning above this; at/above cap we UPDATE the canonical active row in place. */
const EXERCISE_PLAN_VERSION_INSERT_CAP = 20;

type ActiveExercisePlanRow = {
  id: string;
  version_number: number;
  exercises: unknown;
};

/**
 * Pick the canonical plan row for writes when multiple rows exist per patient (legacy drift /
 * concurrent tabs). Prefer `is_active=true`, then highest `version_number`, then newest `updated_at`.
 */
async function fetchCanonicalActiveExercisePlanRow(
  client: SupabaseClient,
  patientId: string
): Promise<
  | { ok: true; row: ActiveExercisePlanRow | null }
  | { ok: false; message: string; httpStatus?: number }
> {
  const { data, error } = await client
    .from('exercise_plans')
    .select('id, version_number, exercises, is_active, updated_at')
    .eq('patient_id', patientId)
    .order('is_active', { ascending: false })
    .order('version_number', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    logExercisePlansSupabaseError('שגיאה בשליפת תוכנית פעילה', error, { patientId });
    return clinicalPushFail(`exercise_plans: ${error.message}`, error);
  }

  const hit = data?.[0];
  if (!hit) return { ok: true, row: null };
  return {
    ok: true,
    row: {
      id: hit.id as string,
      version_number: typeof hit.version_number === 'number' ? hit.version_number : 0,
      exercises: hit.exercises,
    },
  };
}

type UpdateActivePlanInPlaceArgs = {
  planRowId: string;
  patientId: string;
  exercises: PatientExercise[];
  now: string;
  changeSummary: string | null;
  authUid: string;
  rowTherapistId: string | null;
  prevExercises: unknown;
  therapistId: string;
};

/** Overwrite exercises on the existing active row — no new version row (used at version cap). */
async function updateActiveExercisePlanInPlace(
  client: SupabaseClient,
  args: UpdateActivePlanInPlaceArgs
): Promise<ClinicalPushResult> {
  const updatePayload: Record<string, unknown> = {
    exercises: args.exercises,
    updated_at: args.now,
    is_active: true,
  };
  if (args.changeSummary?.trim()) {
    updatePayload.change_summary = args.changeSummary.trim();
  }

  logUpsertPayload('exercise_plans UPDATE (in-place at version cap)', updatePayload, {
    auth_uid: args.authUid,
    row_therapist_id: args.rowTherapistId,
    plan_row_id: args.planRowId,
    patient_id: args.patientId,
  });

  const { data, error } = await client
    .from('exercise_plans')
    .update(updatePayload)
    .eq('id', args.planRowId)
    .eq('patient_id', args.patientId)
    .select('id');

  if (error) {
    logExercisePlansSupabaseError('שגיאת update in-place ל-exercise_plans', error, {
      patientId: args.patientId,
      planRowId: args.planRowId,
      auth_uid: args.authUid,
    });
    return clinicalPushFail(`exercise_plans: ${error.message}`, error);
  }
  if (!data?.length) {
    return {
      ok: false,
      message:
        'exercise_plans: update in-place returned no rows (check RLS and plan row id)',
    };
  }

  devLog('[upsertExercisePlans] in-place update OK', {
    patientRef: redactId(args.patientId),
    planRowRef: redactId(args.planRowId),
    exerciseCount: args.exercises.length,
  });

  const audit = await insertClinicalAuditLog(client, {
    therapistId: args.therapistId,
    patientId: args.patientId,
    entityType: 'plan',
    action: 'update',
    oldValue: { exercises: args.prevExercises },
    newValue: { exercises: args.exercises },
  });
  if (!audit.ok) return audit;

  return { ok: true };
}

type InsertActivePlanVersionArgs = {
  patientId: string;
  exercises: PatientExercise[];
  now: string;
  versionNumber: number;
  parentPlanId: string | null;
  changeSummary: string | null;
  therapistId: string;
  authUid: string;
  rowTherapistId: string | null;
  logLabel: string;
};

/**
 * Inserts a new exercise plan row with a **fresh** {@link crypto.randomUUID} on each attempt.
 * Clears active rows for the patient first so at most one `is_active=true` plan remains app-wide;
 * retries on primary-key / unique violations (e.g. duplicate `id`) or transient conflicts.
 */
async function insertNewActiveExercisePlanVersion(
  client: SupabaseClient,
  args: InsertActivePlanVersionArgs
): Promise<ClinicalPushResult> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const deact = await deactivateAllActiveExercisePlansForPatient(client, args.patientId);
    if (!deact.ok) return deact;

    const newId = crypto.randomUUID();
    const insertPayload = {
      id: newId,
      patient_id: args.patientId,
      exercises: args.exercises,
      updated_at: args.now,
      version_number: args.versionNumber,
      is_active: true,
      parent_plan_id: args.parentPlanId,
      change_summary: args.changeSummary,
    };

    if (!insertPayload.patient_id || !args.authUid) {
      devWarn('[upsertExercisePlans] missing patient_id or auth_uid before insert', {
        patientRef: redactId(insertPayload.patient_id),
        authRef: redactId(args.authUid),
      });
    }

    logUpsertPayload(args.logLabel, insertPayload as unknown as Record<string, unknown>, {
      auth_uid: args.authUid,
      row_therapist_id: args.rowTherapistId,
      rls_will_pass: args.rowTherapistId === args.authUid,
      note: 'insert after clearing all is_active=true for patient_id',
    });
    consoleTableExercisePlanRow(args.logLabel, insertPayload as unknown as Record<string, unknown>);

    const { data: insData, error: insErr } = await client
      .from('exercise_plans')
      .insert(insertPayload)
      .select('id');

    if (!insErr) {
      devLog('[upsertExercisePlans] insert OK', {
        label: args.logLabel,
        rowCount: Array.isArray(insData) ? insData.length : 0,
      });
      return { ok: true };
    }

    const st = postgrestHttpStatus(insErr);
    if (isUniqueOrConflictPostgrest(insErr, st) && attempt < maxAttempts - 1) {
      logExercisePlansSupabaseError('ייחודיות / קונפליקט — ניסיון חוזר', insErr, {
        patientId: args.patientId,
        attempt: attempt + 1,
      });
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      continue;
    }

    logExercisePlansSupabaseError('שגיאת insert ל-exercise_plans', insErr, {
      patient_id: args.patientId,
      auth_uid: args.authUid,
      new_row_id: newId,
    });
    return clinicalPushFail(`exercise_plans: ${insErr.message}`, insErr);
  }
  return {
    ok: false,
    message:
      'exercise_plans: לא ניתן לשמור תוכנית פעילה לאחר ניסיונות חוזרים (קונפליקט ייחודיות)',
  };
}

/**
 * מונע יצירת גרסאות חדשות ללא הגבלה כשמצב מקומי/ענן מתנדנד (לולאת שמירה).
 * מתאפס בריענון דף מלא.
 */
let haltExercisePlanUpsertsThisSession = false;

/** לבדיקות בלבד */
export function resetExercisePlanUpsertHaltForTests(): void {
  haltExercisePlanUpsertsThisSession = false;
}

/** חתימת תוכן יציבה להשוואת תוכניות — מונעת גרסה חדשה כשאין שינוי אמיתי */
export function exercisePlanExercisesComparableSignature(exercises: PatientExercise[]): string {
  const sorted = [...exercises].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(
    sorted.map((ex) => {
      const record = ex as unknown as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const v = record[k];
        if (v !== undefined) out[k] = v;
      }
      return out;
    })
  );
}

function exercisesComparableSignatureFromUnknown(raw: unknown): string {
  return exercisePlanExercisesComparableSignature(tryParsePatientExerciseArray(raw));
}

/**
 * Syncs a single patient's exercise plan using the same versioning flow as {@link upsertExercisePlans}.
 * (A legacy `.upsert({ onConflict: 'patient_id' })` path is invalid once multiple `exercise_plans`
 * rows exist per patient — it causes PostgREST 409 / constraint conflicts.)
 */
export async function upsertExercisePlan(
  client: SupabaseClient,
  patientId: string,
  exercises: PatientExercise[],
  options?: { changeSummary?: string | null; now?: string; forceSave?: boolean }
): Promise<ClinicalPushResult> {
  try {
    const trimmedPid = typeof patientId === 'string' ? patientId.trim() : '';
    if (!trimmedPid) {
      return { ok: false, message: 'exercise_plans: patientId חסר או לא תקין' };
    }
    const now = options?.now ?? new Date().toISOString();
    const cs = options?.changeSummary?.trim();
    const upsertOpts: UpsertExercisePlansOptions | undefined =
      cs || options?.forceSave
        ? {
            ...(cs ? { changeSummaryByPatientId: { [trimmedPid]: cs } } : {}),
            ...(options?.forceSave
              ? { forceSavePatientIds: new Set([trimmedPid]) }
              : {}),
          }
        : undefined;
    return await upsertExercisePlans(
      client,
      [{ patientId: trimmedPid, exercises }],
      now,
      upsertOpts
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upsertExercisePlan] שגיאה בלתי צפויה', msg, e);
    return { ok: false, message: `exercise_plans: ${msg}` };
  }
}

export type UpsertExercisePlansOptions = {
  /** Optional per-patient note stored on the new version row when content changes. */
  changeSummaryByPatientId?: Record<string, string>;
  /** Bypass signature-equality skip (explicit therapist Save). */
  forceSavePatientIds?: Set<string>;
};

/**
 * Syncs exercise plans to Supabase with versioning: deactivates the active row and inserts a new
 * version **only when the exercises payload differs** from the active row (deep-stable comparison).
 * First-time creates still insert v1. At {@link EXERCISE_PLAN_VERSION_INSERT_CAP}+ versions, writes
 * UPDATE the canonical active row in place (no new version row) so clinical edits are never dropped.
 * Explicit therapist Save (`forceSavePatientIds`) bypasses signature skip and session halt guards.
 * {@link clinical_audit_logs} on real creates/updates.
 */
export async function upsertExercisePlans(
  client: SupabaseClient,
  exercisePlans: ExercisePlan[],
  now: string,
  options?: UpsertExercisePlansOptions
): Promise<ClinicalPushResult> {
  try {
    // ── Resolve auth user once for the entire batch ──────────────────────────
    // The exercise_plans RLS INSERT/UPDATE policy checks:
    //   patients.therapist_id = auth.uid()::text
    // so we must know auth.uid() upfront to detect mismatches before writing.
    const {
      data: { user: authUser },
      error: authErr,
    } = await client.auth.getUser();

    if (authErr || !authUser?.id) {
      console.error('[upsertExercisePlans] אין משתמש מחובר — לא ניתן לכתוב ל-exercise_plans', {
        authErr,
      });
      return {
        ok: false,
        message: 'exercise_plans: נדרש מטפל מחובר ל-Supabase לכתיבה (auth.uid() חסר)',
      };
    }
    const authUid = authUser.id;

    const changeSummaryByPatientId = options?.changeSummaryByPatientId ?? {};
    const forceSavePatientIds = options?.forceSavePatientIds ?? new Set<string>();

    const batchHasForceSave = exercisePlans.some((p) => {
      const pid = typeof p.patientId === 'string' ? p.patientId.trim() : '';
      return pid.length > 0 && forceSavePatientIds.has(pid);
    });

    if (haltExercisePlanUpsertsThisSession && !batchHasForceSave) {
      console.error(
        '[CRITICAL] exercise_plans upserts halted this session — skipping batch (see earlier version guard)'
      );
      return { ok: true };
    }

    // Batch-fetch patients.therapist_id for the whole batch (avoids one round-trip
    // per patient inside the loop — the classic N+1).
    const batchPatientIds = [
      ...new Set(
        exercisePlans
          .map((p) => (typeof p.patientId === 'string' ? p.patientId.trim() : ''))
          .filter((id) => id.length > 0)
      ),
    ];
    const therapistIdByPatientId = new Map<string, string | null>();
    if (batchPatientIds.length > 0) {
      const { data: prows, error: pErr } = await client
        .from('patients')
        .select('id, therapist_id')
        .in('id', batchPatientIds);
      if (pErr) {
        logExercisePlansSupabaseError('שגיאה בשליפת therapist_id מ-patients (batch)', pErr, {
          patientIds: batchPatientIds,
          auth_uid: authUid,
        });
        return clinicalPushFail(`patients: ${pErr.message}`, pErr);
      }
      for (const row of (prows ?? []) as { id: string; therapist_id: string | null }[]) {
        therapistIdByPatientId.set(String(row.id), row.therapist_id ?? null);
      }
    }

    for (const plan of exercisePlans) {
      const { patientId: rawPatientId } = plan;
      const exercises = normalizeCachedPatientExercises(plan.exercises);

      // ── Validate patient_id ──────────────────────────────────────────────
      if (typeof rawPatientId !== 'string' || !rawPatientId.trim()) {
        console.error('[upsertExercisePlans] patient_id חסר או לא תקין', { rawPatientId });
        return { ok: false, message: 'exercise_plans: patient_id חסר או לא תקין' };
      }
      const patientId = rawPatientId.trim();
      const changeSummary =
        changeSummaryByPatientId[patientId] ??
        changeSummaryByPatientId[rawPatientId] ??
        null;

      // ── Resolve therapist_id from the pre-fetched batch map ──────────────
      // exercise_plans has no therapist_id column; RLS enforces access through
      // the FK: patients.therapist_id = auth.uid()::text.  We use it to
      // (a) verify it matches auth.uid() — if not, the INSERT will be
      // silently blocked by RLS, and (b) populate the audit log.
      const rowTherapistId = therapistIdByPatientId.get(patientId) ?? null;
      const therapistId = authUid;

      if (!rowTherapistId) {
        // Patient row not visible via RLS (may not exist yet, or therapist_id is stale).
        // We'll still try the exercise_plans write; it will succeed only if the patients
        // row on the DB side already has therapist_id = auth.uid().
        devWarn(
          '[upsertExercisePlans] patients.therapist_id not found — RLS may block INSERT',
          { patientRef: redactId(patientId), authRef: redactId(authUid) }
        );
      } else if (rowTherapistId !== authUid) {
        // Mismatch: the stored therapist_id is different from the current JWT.
        // The RLS policy will block the INSERT with a silent 0-rows result or 403.
        devWarn(
          '[upsertExercisePlans] patients.therapist_id mismatch vs auth.uid() — RLS will block write',
          {
            patientRef: redactId(patientId),
            rowTherapistRef: redactId(rowTherapistId),
            authRef: redactId(authUid),
          }
        );
      }

      // ── Fetch canonical active row (handles multiple is_active / version rows) ──
      const activeFetch = await fetchCanonicalActiveExercisePlanRow(client, patientId);
      if (!activeFetch.ok) return activeFetch;
      const prevActive = activeFetch.row;

      const hadPrev = prevActive != null;
      const currentVn = prevActive?.version_number ?? 0;
      const forceSave = forceSavePatientIds.has(patientId);
      const atVersionCap = currentVn >= EXERCISE_PLAN_VERSION_INSERT_CAP;

      if (hadPrev && prevActive && !forceSave) {
        const dbSig = exercisesComparableSignatureFromUnknown(prevActive.exercises);
        const incomingSig = exercisePlanExercisesComparableSignature(exercises);
        if (dbSig === incomingSig) {
          devLog('[SAVE_CHECK] Attempting to save exercise plan. Change detected: NO', {
            patientRef: redactId(patientId),
          });
          continue;
        }
      }

      devLog('[SAVE_CHECK] Attempting to save exercise plan. Change detected: YES', {
        patientRef: redactId(patientId),
      });

      if (import.meta.env.DEV) {
        console.log('[upsertExercisePlans] שולח תוכנית לענן', {
          patientRef: redactId(patientId),
          rls_will_pass: rowTherapistId === authUid,
          exerciseCount: exercises.length,
          is_active: true,
          changeSummary,
          now,
          version_number: currentVn,
          atVersionCap,
          forceSave,
          saveMode: atVersionCap && hadPrev ? 'update_in_place' : 'insert_new_version',
        });
      }

      // At version cap: UPDATE the canonical active row instead of INSERTing another version.
      // forceSave bypasses the old session halt; auto-save also uses in-place update (never drops edits).
      if (atVersionCap && hadPrev && prevActive) {
        if (!forceSave) {
          devWarn(
            `[upsertExercisePlans] version_number >= ${EXERCISE_PLAN_VERSION_INSERT_CAP} — in-place UPDATE (auto-save)`,
            { patientRef: redactId(patientId), version_number: currentVn }
          );
        } else {
          devLog(
            `[upsertExercisePlans] version_number >= ${EXERCISE_PLAN_VERSION_INSERT_CAP} — in-place UPDATE (explicit forceSave)`,
            { patientRef: redactId(patientId), version_number: currentVn }
          );
        }

        const upd = await updateActiveExercisePlanInPlace(client, {
          planRowId: prevActive.id,
          patientId,
          exercises,
          now,
          changeSummary,
          authUid,
          rowTherapistId,
          prevExercises: prevActive.exercises,
          therapistId,
        });
        if (!upd.ok) return upd;
        continue;
      }

      const nextVersion = hadPrev && prevActive ? (prevActive.version_number ?? 1) + 1 : 1;
      const parentPlanId = hadPrev && prevActive ? prevActive.id : null;
      const logLabel = hadPrev ? 'exercise_plans INSERT (new version)' : 'exercise_plans INSERT (v1)';

      const ins = await insertNewActiveExercisePlanVersion(client, {
        patientId,
        exercises,
        now,
        versionNumber: nextVersion,
        parentPlanId,
        changeSummary,
        therapistId,
        authUid,
        rowTherapistId,
        logLabel,
      });
      if (!ins.ok) return ins;

      if (!hadPrev) {
        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'create',
          oldValue: null,
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
      } else if (prevActive) {
        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'update',
          oldValue: { exercises: prevActive.exercises },
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (import.meta.env.DEV) {
      console.error('[upsertExercisePlans] unexpected error', msg);
    }
    return { ok: false, message: `exercise_plans: ${msg}` };
  }
}

export async function fetchClinicalAuditLogsForPatient(
  client: SupabaseClient,
  patientId: string,
  limit = 80
): Promise<ClinicalAuditLogRow[] | null> {
  const { data, error } = await client
    .from('clinical_audit_logs')
    .select('id, therapist_id, patient_id, entity_type, action, old_value, new_value, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return (data ?? []) as ClinicalAuditLogRow[];
}

export type FetchPatientPayloadsForTherapistResult = ServiceResult<Patient[]>;

/**
 * Loads `patients.payload` rows visible to the current JWT (RLS: therapist_id = auth.uid()).
 * תרגילי תוכנית פעילה אינם ב־payload — משיגים באמצעות {@link fetchActiveExercisePlansForPatientIds}
 * או {@link fetchPatients}.
 */

/** Guaranteed by `20260410120000_initial_guardian_schema.sql` — push/login meta lives inside payload JSONB. */
const PATIENTS_THERAPIST_FETCH_SELECT = 'payload, updated_at';

type PatientRowForTherapistFetch = {
  payload?: unknown;
};

function patientsFromTherapistFetchRows(rows: PatientRowForTherapistFetch[] | null): Patient[] {
  const out: Patient[] = [];
  for (const row of rows ?? []) {
    const patient = tryParsePatientPayload(row.payload);
    if (patient) out.push(patient);
  }
  return out;
}

type ExercisePlanDbRow = {
  id?: string;
  patient_id: string;
  exercises: unknown;
  version_number?: number | null;
  updated_at?: string | null;
  is_active?: boolean | null;
};

/** Prefer active plan, then highest version_number, then newest updated_at. */
export function pickCanonicalExercisePlanDbRow<T extends ExercisePlanDbRow>(
  rows: T[]
): T | null {
  if (!rows.length) return null;
  const active = rows.filter((r) => r.is_active === true);
  const pool = active.length > 0 ? active : rows;
  return pool.reduce((best, row) => {
    const bestVn = best.version_number ?? 0;
    const rowVn = row.version_number ?? 0;
    if (rowVn !== bestVn) return rowVn > bestVn ? row : best;
    const bestTs = best.updated_at ? new Date(best.updated_at).getTime() : 0;
    const rowTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    return rowTs > bestTs ? row : best;
  });
}

function exercisePlanFromDbRow(row: ExercisePlanDbRow): ExercisePlan {
  const exercises = tryParsePatientExerciseArray(row.exercises);
  return {
    patientId: row.patient_id,
    exercises,
    planRowId: typeof row.id === 'string' ? row.id : undefined,
    versionNumber: typeof row.version_number === 'number' ? row.version_number : undefined,
    isActive: row.is_active === true ? true : row.is_active === false ? false : undefined,
  };
}

export async function fetchPatientPayloadsForTherapist(
  client: SupabaseClient
): Promise<FetchPatientPayloadsForTherapistResult> {
  try {
    const sessionGuard = await ensureSupabaseSessionReady(client, {
      context: 'טעינת רשימת מטופלים',
    });
    if (!sessionGuard.ok) {
      return serviceFail(sessionGuard.message);
    }

    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return serviceFail(userErr?.message ?? 'אין משתמש מחובר');
    }

    const therapistId = user.id.trim();

    const { data, error } = await client
      .from('patients')
      .select(PATIENTS_THERAPIST_FETCH_SELECT)
      .eq('therapist_id', therapistId)
      .order('updated_at', { ascending: false });

    if (error) {
      logSupabaseCallError('fetchPatientPayloadsForTherapist', error, {
        therapistId,
        httpStatus: postgrestHttpStatus(error),
        selectColumns: PATIENTS_THERAPIST_FETCH_SELECT,
      });
      return serviceFail(error.message);
    }

    const rows = (data ?? null) as PatientRowForTherapistFetch[] | null;
    const out = patientsFromTherapistFetchRows(rows);

    if (out.length === 0) {
      console.warn(
        '[fetchPatientPayloadsForTherapist] 0 rows for therapist — RLS or patients.therapist_id may not match auth.uid()',
        {
          therapistId,
          rawRowCount: rows?.length ?? 0,
          hint: 'In Supabase SQL: SELECT id, therapist_id FROM patients; compare therapist_id to auth.users.id for your login.',
        }
      );
    } else if (import.meta.env.DEV) {
      console.log('[fetchPatientPayloadsForTherapist] loaded', {
        therapistId,
        patientCount: out.length,
        selectColumns: PATIENTS_THERAPIST_FETCH_SELECT,
      });
    }

    return serviceOk(out);
  } catch (e) {
    logSupabaseCallError('fetchPatientPayloadsForTherapist/catch', e);
    return serviceFail(e instanceof Error ? e.message : String(e));
  }
}

export type FetchActiveExercisePlansResult = ServiceResult<ExercisePlan[]>;

/**
 * Fetches exercise plans for the given patient IDs from `exercise_plans`.
 * With a UNIQUE constraint on `patient_id` there is exactly one row per patient,
 * so the `is_active` filter is omitted to avoid hiding rows where the column was
 * never set or defaulted to false.
 */
export async function fetchActiveExercisePlansForPatientIds(
  client: SupabaseClient,
  patientIds: string[]
): Promise<FetchActiveExercisePlansResult> {
  const ids = [...new Set(patientIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return serviceOk([]);
  }

  const { data, error } = await client
    .from('exercise_plans')
    .select('id, patient_id, exercises, version_number, updated_at, is_active')
    .in('patient_id', ids);

  devLog('[fetchActiveExercisePlansForPatientIds] raw Supabase response', {
    patientIdCount: ids.length,
    rowCount: data?.length ?? 0,
    hasError: Boolean(error),
  });

  if (error) {
    return serviceFail(sanitizeDbErrorMessage(error.message || 'exercise_plans fetch failed'));
  }

  const rowsByPatient = new Map<string, ExercisePlanDbRow[]>();
  for (const row of data ?? []) {
    const pid = row.patient_id as string;
    const bucket = rowsByPatient.get(pid) ?? [];
    bucket.push(row as ExercisePlanDbRow);
    rowsByPatient.set(pid, bucket);
  }

  const exercisePlans: ExercisePlan[] = [];
  for (const [, patientRows] of rowsByPatient) {
    const canonical = pickCanonicalExercisePlanDbRow(patientRows);
    if (canonical) {
      exercisePlans.push(exercisePlanFromDbRow(canonical));
    }
  }
  return serviceOk(exercisePlans);
}

export type FetchActiveExercisePlanForPatientResult = ServiceResult<ExercisePlan | null>;

export async function fetchActiveExercisePlanForPatient(
  client: SupabaseClient,
  patientId: string
): Promise<FetchActiveExercisePlanForPatientResult> {
  const id = patientId.trim();
  if (!id) {
    return serviceOk(null);
  }

  // With versioned `exercise_plans`, multiple rows per `patient_id` are possible until legacy
  // data is cleaned up. Never use `.single()` / `.maybeSingle()` here — PostgREST errors when
  // more than one row matches. Pick the newest row by version_number, then updated_at.
  const { data, error } = await client
    .from('exercise_plans')
    .select('id, patient_id, exercises, version_number, updated_at, is_active')
    .eq('patient_id', id)
    .order('version_number', { ascending: false })
    .order('updated_at', { ascending: false });

  devLog('[fetchActiveExercisePlanForPatient] raw Supabase response', {
    patientId: redactId(id),
    rowCount: data?.length ?? 0,
    hasError: Boolean(error),
  });

  if (error) {
    return serviceFail(sanitizeDbErrorMessage(error.message || 'exercise_plans fetch failed'));
  }

  const rows = data ?? [];
  if (rows.length > 1) {
    devLog(
      '[fetchActiveExercisePlanForPatient] multiple exercise_plans rows — using newest version',
      {
        patientId: redactId(id),
        rowCount: rows.length,
        pickedVersion: rows[0]?.version_number,
      }
    );
  }

  const canonical = pickCanonicalExercisePlanDbRow(rows as ExercisePlanDbRow[]);
  if (!canonical) {
    return serviceOk(null);
  }

  return serviceOk(exercisePlanFromDbRow(canonical));
}

export type FetchPatientsResult = ServiceResult<{
  patients: Patient[];
  exercisePlans: ExercisePlan[];
}>;

/**
 * טעינת מטופלים + התוכנית הפעילה לכל אחד (מ־`exercise_plans`), לסנכרון מלא בעת כניסה.
 * מתאים לגרסת API שנקראית `fetchPatients` — לעומת `fetchPatientPayloadsForTherapist` שמטעינה את ה־payload בלבד.
 */
export async function fetchPatients(client: SupabaseClient): Promise<FetchPatientsResult> {
  try {
    const base = await fetchPatientPayloadsForTherapist(client);
    if (!base.ok) return base;

    const plans = await fetchActiveExercisePlansForPatientIds(
      client,
      base.data.map((p) => p.id)
    );
    if (!plans.ok) return plans;

    return serviceOk({
      patients: base.data,
      exercisePlans: mergeExercisePlansWithPatientPayloadCache(base.data, plans.data),
    });
  } catch (e) {
    logSupabaseCallError('fetchPatients/catch', e);
    return serviceFail(e instanceof Error ? e.message : String(e));
  }
}

export type GetPatientByIdResult = ServiceResult<{
  patient: Patient;
  exercisePlan: ExercisePlan | null;
}>;

/**
 * משיג שורת `patients` (payload מלא) + תוכנית תרגול פעילה לפי `patient_id`.
 *
 * כאשר ה-JWT של המטופל אינו מכוסה על-ידי מדיניות ה-RLS של `exercise_plans`
 * (מדיניות ברירת מחדל מגבילה לגישת מטפל בלבד), השאילתה מחזירה null.
 * במקרה זה משתמשים ב-`_exercisePlanCache` מתוך `patients.payload` —
 * שדה שהמטפל מעדכן בכל שמירה ושהמטופל תמיד רשאי לקרוא.
 */
export async function getPatientById(
  client: SupabaseClient,
  patientId: string
): Promise<GetPatientByIdResult> {
  const id = patientId.trim();
  if (!id) {
    return serviceFail('getPatientById: missing patient id');
  }

  const [rowResult, activePlanResult] = await Promise.all([
    client.from('patients').select('payload').eq('id', id).maybeSingle(),
    fetchActiveExercisePlanForPatient(client, id),
  ]);

  const { data, error } = rowResult;

  if (import.meta.env.DEV) {
    console.log('[getPatientById] patients row result', {
      hasData: !!data,
      hasError: !!error,
    });
  }

  if (error) {
    return serviceFail(`patients: ${error.message}`);
  }
  const payload = tryParsePatientPayload((data as { payload?: unknown } | null)?.payload);
  if (!payload) {
    if (import.meta.env.DEV) {
      console.warn('[getPatientById] patients payload חסר או לא תקין', {
        hasData: !!data,
        payloadKeys:
          data &&
          typeof data === 'object' &&
          (data as { payload?: unknown }).payload &&
          typeof (data as { payload?: unknown }).payload === 'object'
            ? Object.keys((data as { payload: object }).payload)
            : [],
      });
    }
    return serviceFail('patients: missing or invalid payload');
  }

  // Soft-fail: plan fetch errors do not fail the patient row — fall back to payload cache.
  let exercisePlan: ExercisePlan | null = activePlanResult.ok ? activePlanResult.data : null;
  if (!activePlanResult.ok) {
    console.warn('[getPatientById] exercise_plans result not ok (unexpected) — using cache only', {
      patientId: id,
      message: activePlanResult.message,
    });
  }

  if (!exercisePlan) {
    const cached = tryParsePatientExerciseArray(payload._exercisePlanCache);
    if (cached.length > 0) {
      console.log('[getPatientById] exercise_plans ריק — משתמש ב-_exercisePlanCache מ-patients.payload', {
        patientId: id,
        cachedCount: cached.length,
      });
      exercisePlan = {
        patientId: id,
        exercises: cached,
        planRowId: activePlanResult.ok ? activePlanResult.data?.planRowId : undefined,
        versionNumber: activePlanResult.ok
          ? activePlanResult.data?.versionNumber
          : undefined,
        isActive: activePlanResult.ok ? activePlanResult.data?.isActive : undefined,
      };
    } else {
      console.warn('[getPatientById] exercise_plans ריק וגם אין _exercisePlanCache — ייתכן שה-RLS חוסם את המטופל מטבלת exercise_plans', {
        patientId: id,
      });
    }
  }

  return serviceOk({
    patient: payload,
    exercisePlan,
  });
}

/**
 * מעלה לענן את רשימת התרגילים הפעילה של מטופל.
 * מאציל ל-{@link upsertExercisePlan} שמטפל באימות מטפל ו-upsert על-פי `patient_id`.
 */
export async function updatePatientExercises(
  client: SupabaseClient,
  patientId: string,
  updatedExercises: PatientExercise[],
  now?: string,
  options?: { changeSummary?: string | null; forceSave?: boolean }
): Promise<ClinicalPushResult> {
  return upsertExercisePlan(client, patientId, updatedExercises, {
    changeSummary: options?.changeSummary,
    now,
    forceSave: options?.forceSave,
  });
}

export type MigrateClinicalIntakeProfilesInSupabaseResult =
  | {
      ok: true;
      migratedPatientIds: string[];
      skippedCount: number;
      errors: { patientId: string; message: string }[];
      dryRun: boolean;
    }
  | { ok: false; message: string };

export type MigrateClinicalIntakeProfilesOptions = {
  /** When true, compute migrations but do not write to Supabase */
  dryRun?: boolean;
  /** Explicit patient list; when omitted, loads all therapist patients from Supabase */
  patients?: Patient[];
};

/**
 * Migrates legacy intake text into `payload.clinicalIntakeProfile` for patients that need it.
 * Safe to run repeatedly — only fills missing structured fields from legacy sources.
 */
export async function migrateClinicalIntakeProfilesInSupabase(
  client: SupabaseClient,
  options?: MigrateClinicalIntakeProfilesOptions
): Promise<MigrateClinicalIntakeProfilesInSupabaseResult> {
  const dryRun = options?.dryRun === true;

  try {
    let sourcePatients = options?.patients;
    if (!sourcePatients) {
      const fetched = await fetchPatientPayloadsForTherapist(client);
      if (!fetched.ok) {
        return { ok: false, message: fetched.message };
      }
      sourcePatients = fetched.data;
    }

    const batch: BatchClinicalIntakeProfileMigrationResult =
      migratePatientsClinicalIntakeProfiles(sourcePatients);
    const migratedIds = new Set(batch.migratedPatientIds);
    const toWrite = batch.patients.filter((p) => migratedIds.has(p.id));

    if (!dryRun && toWrite.length > 0) {
      const now = new Date().toISOString();
      const push = await upsertPatientRecords(client, toWrite, now);
      if (push.ok === false) {
        return { ok: false, message: push.message };
      }
    }

    return {
      ok: true,
      migratedPatientIds: batch.migratedPatientIds,
      skippedCount: sourcePatients.length - batch.migratedPatientIds.length,
      errors: batch.errors,
      dryRun,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `migrateClinicalIntakeProfilesInSupabase: ${message}` };
  }
}
