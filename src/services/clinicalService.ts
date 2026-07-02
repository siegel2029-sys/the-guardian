import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type {
  AiSuggestion,
  BodyArea,
  DailyHistoryEntry,
  ExercisePlan,
  ExerciseSession,
  KnowledgeFact,
  PainRecord,
  Patient,
  PatientExercise,
  SafetyAlert,
  Therapist,
} from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';
import {
  mergeExercisePlansWithPatientPayloadCache,
  normalizeCachedPatientExercises,
} from '../utils/exercisePlanCanonical';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import {
  isSupabaseAuthEnabled,
  normalizePortalUsername,
  portalUsernameToAuthEmail,
} from '../lib/patientPortalAuth';
import {
  lifetimeXpFromPatient,
  normalizePatientProgressFields,
  patientWithLifetimeXp,
} from '../body/patientLevelXp';
import {
  ensureSupabaseSessionReady,
  logSupabaseCallError,
} from '../lib/supabaseSessionGuard';
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

export function mergeSessionHistoryByDate(a: ExerciseSession[], b: ExerciseSession[]): ExerciseSession[] {
  const map = new Map<string, ExerciseSession>();
  for (const s of [...a, ...b]) {
    const cur = map.get(s.date);
    if (!cur) {
      map.set(s.date, { ...s });
      continue;
    }
    map.set(s.date, {
      date: s.date,
      exercisesCompleted: Math.max(cur.exercisesCompleted, s.exercisesCompleted),
      totalExercises: Math.max(cur.totalExercises, s.totalExercises),
      difficultyRating: Math.max(cur.difficultyRating, s.difficultyRating),
      xpEarned: Math.max(cur.xpEarned, s.xpEarned),
    });
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

function painRecordKey(r: PainRecord): string {
  return `${r.date}|${r.bodyArea}|${r.painLevel}`;
}

export function mergePainHistoryUnique(a: PainRecord[], b: PainRecord[]): PainRecord[] {
  const map = new Map<string, PainRecord>();
  for (const r of [...a, ...b]) {
    map.set(painRecordKey(r), r);
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/** Minimal day map from merged session rows — for recomputing streak after fetch merge. */
function dayMapFromExerciseSessions(sessions: ExerciseSession[]): Record<string, DailyHistoryEntry> {
  const out: Record<string, DailyHistoryEntry> = {};
  for (const s of sessions) {
    out[s.date] = {
      clinicalDate: s.date,
      exercisesPlanned: s.totalExercises,
      exercisesCompleted: s.exercisesCompleted,
      completedExerciseIds: [],
      xpEarned: s.xpEarned,
      status: s.exercisesCompleted > 0 ? 'gold' : 'empty',
    };
  }
  return out;
}

function recomputePainAverages(painHistory: PainRecord[]): {
  averageOverallPain: number;
  painByArea: Partial<Record<BodyArea, number>>;
} {
  if (painHistory.length === 0) {
    return { averageOverallPain: 0, painByArea: {} };
  }
  const averageOverallPain =
    Math.round(
      (painHistory.reduce((sum, r) => sum + r.painLevel, 0) / painHistory.length) * 10
    ) / 10;
  const byArea: Partial<Record<BodyArea, number>> = {};
  const buckets: Partial<Record<BodyArea, { sumw: number; w: number }>> = {};
  for (const r of painHistory) {
    const cur = buckets[r.bodyArea] ?? { sumw: 0, w: 0 };
    cur.sumw += r.painLevel;
    cur.w += 1;
    buckets[r.bodyArea] = cur;
  }
  for (const [area, v] of Object.entries(buckets)) {
    if (v && v.w > 0) {
      byArea[area as BodyArea] = Math.round((v.sumw / v.w) * 10) / 10;
    }
  }
  return { averageOverallPain, painByArea: byArea };
}

/** Union-merge per clinical day: completed exercise IDs + max session XP (local vs server). */
export function mergeSessionCompletionByDateMaps(
  a?: Record<string, { completedIds: string[]; sessionXp: number }>,
  b?: Record<string, { completedIds: string[]; sessionXp: number }>
): Record<string, { completedIds: string[]; sessionXp: number }> | undefined {
  if (!a && !b) return undefined;
  if (!a) return b && Object.keys(b).length > 0 ? { ...b } : undefined;
  if (!b) return Object.keys(a).length > 0 ? { ...a } : undefined;
  const out: Record<string, { completedIds: string[]; sessionXp: number }> = {};
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const aa = a[d];
    const bb = b[d];
    const ids = new Set<string>([...(aa?.completedIds ?? []), ...(bb?.completedIds ?? [])]);
    out[d] = {
      completedIds: [...ids],
      sessionXp: Math.max(aa?.sessionXp ?? 0, bb?.sessionXp ?? 0),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type MergePatientPayloadOptions = {
  /**
   * When set, `currentStreak` is derived from the merged `sessionHistory` (union of server + local),
   * so one side cannot replace the other's streak counter without merging activity first.
   */
  clinicalToday?: string;
  /**
   * דשבורד מטפל + Supabase Auth לפני טעינת app_knowledge_base: אל תמזג ואל תכלול `knowledgeFacts`
   * ב־payload שנשלח — כדי שלא יידרס JSONB שכבר קיים בשרת מטיפים ריקים מקומית.
   */
  omitKnowledgeFactsForCloud?: boolean;
  /**
   * דשבורד מטפל אחרי טעינת KB מהענן: טיפ קיים בשרת ולא ברשימה המקומית — נחשב למחיקה (לא להחזיר ב-merge).
   */
  therapistTrustKnowledgeFactDeletions?: boolean;
};

export type MergeKnowledgeFactsForUpsertOptions = {
  therapistTrustLocalDeletions?: boolean;
};

/**
 * מיזוג רשימת «הידעת?» בין שרת (`existing`) ללקוח (`incoming`).
 * מכשיר חדש: מצב מקומי ריק + נתוני שרת — הענן מנצח (אין «דריסה ריקה»).
 * אם יש תוכן מקומי והשרת ריק — שומרים את המקומי (מונע דריסה מסנכרון ישן).
 */
export function mergeKnowledgeFactsForUpsert(
  serverFacts: KnowledgeFact[] | undefined,
  localFacts: KnowledgeFact[] | undefined,
  opts?: MergeKnowledgeFactsForUpsertOptions
): KnowledgeFact[] {
  let server = normalizeKnowledgeFactsList(serverFacts ?? []);
  const local = normalizeKnowledgeFactsList(localFacts ?? []);

  if (opts?.therapistTrustLocalDeletions) {
    const localIds = new Set(local.map((f) => f.id));
    server = server.filter((s) => localIds.has(s.id));
  }

  if (server.length > 0 || local.length > 0) {
    console.log(
      `[TIP_SYNC] Merging tip content. Local: ${local.length}, Server: ${server.length}`
    );
  }

  /** New device / מטמון ריק אחרי התחברות — לא לדרוס ענן בטיפים ריקים מקומית */
  if (local.length === 0 && server.length > 0) return server;

  if (local.length > 0 && server.length === 0) return local;
  if (server.length === 0 && local.length === 0) return [];

  const byId = new Map<string, KnowledgeFact>();
  for (const f of server) byId.set(f.id, f);
  for (const f of local) byId.set(f.id, f);
  return [...byId.values()];
}

/** איחוד עובדות מכל payload מטופל אחרי טעינת רשימת מטופלים מהשרת. */
export function aggregateKnowledgeFactsFromPatientPayloads(patients: Patient[]): KnowledgeFact[] {
  const byId = new Map<string, KnowledgeFact>();
  for (const p of patients) {
    for (const f of normalizeKnowledgeFactsList(p.knowledgeFacts)) {
      byId.set(f.id, f);
    }
  }
  return [...byId.values()];
}

/**
 * אחרי טעינת מטפלים מ-Supabase: מאחד עובדות מכל ה־payloads שהגיעו מהשרת (לא רק מטמון ישן)
 * עם שורת `app_knowledge_base` של המטפל (`id` / `therapist_id` = auth uid כשפעיל).
 * כשהמקומי ריק, התוצאה מתמלאת מתוכן השרת (payload + שורת KB).
 */
export function mergeKnowledgeFactsHydrateFromTherapistCloud(
  patientsFromServerFetch: Patient[],
  factsFromAppKnowledgeBaseGlobal: KnowledgeFact[] | undefined,
  localFacts: KnowledgeFact[] | undefined,
  deletedSeedIds?: string[]
): KnowledgeFact[] {
  const ban = new Set((deletedSeedIds ?? []).map((s) => s.trim()).filter(Boolean));
  const filterSeeds = (facts: KnowledgeFact[]) => {
    if (ban.size === 0) return facts;
    return facts.filter((f) => {
      const sid = f.seedId?.trim();
      if (!sid) return true;
      return !ban.has(sid);
    });
  };
  const fromPayloads = filterSeeds(aggregateKnowledgeFactsFromPatientPayloads(patientsFromServerFetch));
  const fromGlobal = filterSeeds(normalizeKnowledgeFactsList(factsFromAppKnowledgeBaseGlobal ?? []));
  const byId = new Map<string, KnowledgeFact>();
  for (const f of fromPayloads) byId.set(f.id, f);
  for (const f of fromGlobal) byId.set(f.id, f);
  const serverCombined = [...byId.values()];
  const localNorm = normalizeKnowledgeFactsList(localFacts ?? []);
  if (serverCombined.length === 0 && localNorm.length === 0) {
    return [];
  }
  const merged = mergeKnowledgeFactsForUpsert(serverCombined, localFacts ?? []);
  if ((localFacts?.length ?? 0) === 0 && merged.length > 0) {
    console.warn(
      `[TIP_SYNC] Hydration replaced empty local knowledgeFacts with ${merged.length} server/payload fact(s).`
    );
  }
  return merged;
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

  console.log('[DEBUG_KB_PAYLOAD] Sending items:', knowledgeItems);

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
 * Fetch-merge-save safe: combines server (`existing`) and client (`incoming`) so cumulative
 * gamification cannot be wiped by a stale client payload (e.g. empty XP after reload).
 * Demographics / clinical fields follow `incoming`; XP and coins use {@link Math.max}; session and
 * pain histories are merged by date/key; streaks use merged history when `clinicalToday` is passed.
 */
export function mergePatientPayloadForUpsert(
  existing: Patient | undefined,
  incoming: Patient,
  opts?: MergePatientPayloadOptions
): Patient {
  const omitKb = opts?.omitKnowledgeFactsForCloud === true;

  if (!existing) {
    let sole = normalizePatientProgressFields({ ...incoming });
    sole._sessionCompletionByDate = mergeSessionCompletionByDateMaps(
      undefined,
      incoming._sessionCompletionByDate
    );
    if (omitKb) {
      delete sole.knowledgeFacts;
    } else {
      const mergedFactsOnly = mergeKnowledgeFactsForUpsert(undefined, incoming.knowledgeFacts, {
        therapistTrustLocalDeletions: opts?.therapistTrustKnowledgeFactDeletions === true,
      });
      sole.knowledgeFacts = mergedFactsOnly.length > 0 ? mergedFactsOnly : undefined;
    }
    if (opts?.clinicalToday) {
      const dm = dayMapFromExerciseSessions(sole.analytics?.sessionHistory ?? []);
      sole.currentStreak = computeStreakForPatient(sole, dm, opts.clinicalToday);
      sole.longestStreak = Math.max(sole.longestStreak ?? 0, sole.currentStreak);
    }
    return sole;
  }
  const maxLife = Math.max(lifetimeXpFromPatient(existing), lifetimeXpFromPatient(incoming));
  let merged = patientWithLifetimeXp({ ...incoming }, maxLife);
  merged.coins = Math.max(existing.coins ?? 0, incoming.coins ?? 0);
  merged.lastSessionDate =
    (existing.lastSessionDate ?? '').localeCompare(incoming.lastSessionDate ?? '') > 0
      ? existing.lastSessionDate
      : incoming.lastSessionDate;
  merged.pendingMessages = Math.max(existing.pendingMessages ?? 0, incoming.pendingMessages ?? 0);

  const sessionHistory = mergeSessionHistoryByDate(
    existing.analytics?.sessionHistory ?? [],
    incoming.analytics?.sessionHistory ?? []
  );
  const painHistory = mergePainHistoryUnique(
    existing.analytics?.painHistory ?? [],
    incoming.analytics?.painHistory ?? []
  );
  const { averageOverallPain, painByArea } = recomputePainAverages(painHistory);
  const sessionDiffAvg =
    sessionHistory.length === 0
      ? incoming.analytics.averageDifficulty
      : sessionHistory.reduce((sum, s) => sum + s.difficultyRating, 0) / sessionHistory.length;

  merged.analytics = {
    ...incoming.analytics,
    sessionHistory,
    painHistory,
    averageOverallPain,
    painByArea,
    averageDifficulty: Math.round(sessionDiffAvg * 10) / 10,
    totalSessions: Math.max(
      sessionHistory.length,
      existing.analytics?.totalSessions ?? 0,
      incoming.analytics?.totalSessions ?? 0
    ),
  };

  if (opts?.clinicalToday) {
    const dm = dayMapFromExerciseSessions(sessionHistory);
    const fromMergedHistory = computeStreakForPatient(merged, dm, opts.clinicalToday);
    merged.currentStreak = fromMergedHistory;
    merged.longestStreak = Math.max(
      existing.longestStreak ?? 0,
      incoming.longestStreak ?? 0,
      fromMergedHistory
    );
  } else {
    merged.currentStreak = Math.max(existing.currentStreak ?? 0, incoming.currentStreak ?? 0);
    merged.longestStreak = Math.max(existing.longestStreak ?? 0, incoming.longestStreak ?? 0);
  }

  merged._sessionCompletionByDate = mergeSessionCompletionByDateMaps(
    existing._sessionCompletionByDate,
    incoming._sessionCompletionByDate
  );

  if (omitKb) {
    delete merged.knowledgeFacts;
  } else {
    const mergedFacts = mergeKnowledgeFactsForUpsert(
      existing.knowledgeFacts,
      incoming.knowledgeFacts,
      {
        therapistTrustLocalDeletions: opts?.therapistTrustKnowledgeFactDeletions === true,
      }
    );
    merged.knowledgeFacts = mergedFacts.length > 0 ? mergedFacts : undefined;
  }

  return normalizePatientProgressFields(merged);
}

function consoleTableBeforePatientsUpsert(row: Record<string, unknown>, label: string) {
  const { payload, ...scalar } = row;
  const p = payload as Record<string, unknown> | null | undefined;
  const payloadKeys = p && typeof p === 'object' ? Object.keys(p).length : 0;
  console.log(`[upsertPatientRecords] ▶ ${label} (console.table)`);
  console.table([
    {
      ...scalar,
      payload: `(JSONB object, ${payloadKeys} top-level keys)`,
    },
  ]);
}

function consoleTableExercisePlanRow(label: string, row: Record<string, unknown>) {
  const ex = row.exercises;
  const exN = Array.isArray(ex) ? (ex as unknown[]).length : '—';
  console.log(`[upsertExercisePlans] ▶ ${label} (console.table)`);
  console.table([
    {
      id: row.id,
      patient_id: row.patient_id,
      version_number: row.version_number,
      is_active: row.is_active,
      parent_plan_id: row.parent_plan_id,
      updated_at: row.updated_at,
      change_summary: row.change_summary,
      exercises: `[${exN} items]`,
    },
  ]);
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
  return httpStatus !== undefined ? { ok: false, message, httpStatus } : { ok: false, message };
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
      console.error('[SYNC_ERROR] upsertPatientRecords/select', fetchErr, { patientId: patientRowId });
      logSupabaseCallError('upsertPatientRecords/select', fetchErr, { patientId: patientRowId });
      return clinicalPushFail(`patients: ${fetchErr.message}`, fetchErr);
    }

    const oldPayload = existing?.payload != null ? (existing.payload as Patient) : undefined;

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
    let payloadForUpsert = mergePatientPayloadForUpsert(oldPayload, payloadDraft, {
      omitKnowledgeFactsForCloud,
      therapistTrustKnowledgeFactDeletions: trustKbDel,
    });
    if ((payloadForUpsert.id ?? '').trim() !== patientRowId) {
      console.warn('[upsertPatientRecords] repairing payload id to match row key', {
        patientRowId,
        payloadId: payloadForUpsert.id,
      });
      payloadForUpsert = { ...payloadForUpsert, id: patientRowId };
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

    console.log('[upsertPatientRecords] row preview', {
      id: upsertRow.id,
      therapist_id: upsertRow.therapist_id,
      original_therapistId: p.therapistId,
      therapist_id_repaired: p.therapistId !== therapistIdForRow,
      full_denormalized: PATIENTS_UPSERT_FULL_DENORMALIZED,
    });
    consoleTableBeforePatientsUpsert(upsertRow, `UPSERT patients id=${payloadForUpsert.id}`);

    const selectCols = PATIENTS_UPSERT_FULL_DENORMALIZED
      ? 'id, therapist_id, updated_at, first_name, age, gender, occupation, birth_date, demographics_free_text, active_area, contact_email, payload'
      : 'id, therapist_id, updated_at, first_name, active_area, demographics_free_text, occupation, payload';

    const { data: upserted, error } = await client
      .from('patients')
      .upsert([upsertRow], { onConflict: 'id' })
      .select(selectCols);
    if (error) {
      console.error('[SYNC_ERROR] upsertPatientRecords/upsert', {
        patientId: payloadForUpsert.id,
        therapist_id: therapistIdForRow,
        error_message: error.message,
        error_code: (error as { code?: string }).code,
        error_details: (error as { details?: string }).details,
        error,
      });
      logSupabaseCallError('upsertPatientRecords/upsert', error, {
        patientId: payloadForUpsert.id,
        therapist_id: therapistIdForRow,
      });
      return clinicalPushFail(`patients: ${error.message}`, error);
    }
    console.log('[upsertPatientRecords] upsert select() response', { upserted, error: null });

    for (const u of upserted ?? []) {
      const pl = (u as { payload?: unknown }).payload;
      if (
        pl &&
        typeof pl === 'object' &&
        'id' in pl &&
        typeof (pl as Patient).id === 'string'
      ) {
        syncedPatients.push(pl as Patient);
      }
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

export type UpsertTreatmentReportOptions = Pick<UpsertPatientRecordsOptions, 'onlyPatientId'> & {
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
  return upsertPatientRecords(
    client,
    [patient],
    now,
    onlyPatientId ? { onlyPatientId } : undefined
  );
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
): Promise<{ patientIds: string[]; error?: string }> {
  const { data, error } = await client
    .from('patients')
    .select('id, payload, auth_user_id')
    .is('auth_user_id', null);

  if (error) {
    return { patientIds: [], error: error.message };
  }

  const unlinked: string[] = [];
  for (const row of data ?? []) {
    const payload = row.payload as { portalUsername?: string } | null;
    if (payload?.portalUsername?.trim()) {
      unlinked.push(row.id as string);
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

  return { patientIds: unlinked };
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
  const p = err as (PostgrestError & { status?: number; statusText?: string }) | undefined;
  console.error(`[upsertExercisePlans] ${scope}`, {
    message: p?.message ?? (err instanceof Error ? err.message : String(err)),
    code: p?.code,
    status: p?.status,
    statusText: p?.statusText,
    details: p?.details,
    hint: p?.hint,
    ...context,
  });
}

/**
 * Logs the exact object being sent to a Supabase `.upsert()` / `.insert()` call so that
 * snake_case column names, nulls, and missing fields are immediately visible in DevTools.
 *
 * `exercises` / `payload` JSONB arrays are replaced with `"[N items]"` to keep the output
 * short; every other field is shown verbatim.
 */
function logUpsertPayload(
  label: string,
  payload: Record<string, unknown>,
  extra?: Record<string, unknown>
): void {
  const display: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    display[k] = Array.isArray(v) ? `[${(v as unknown[]).length} items]` : v;
  }
  console.group(`[upsertExercisePlans] ▶ ${label}`);
  console.log('EXACT PAYLOAD KEYS:', Object.keys(payload).join(', '));
  console.log('EXACT PAYLOAD:', display);
  if (extra) console.log('CONTEXT:', extra);
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

  console.log('[upsertExercisePlans] in-place update OK', {
    patientId: args.patientId,
    planRowId: args.planRowId,
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
      console.warn('[upsertExercisePlans] ⚠ חסר patient_id או auth_uid לפני insert', {
        patient_id: insertPayload.patient_id,
        auth_uid: args.authUid,
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
      console.log('[upsertExercisePlans] insert OK', { data: insData, label: args.logLabel });
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
  if (!Array.isArray(raw)) return exercisePlanExercisesComparableSignature([]);
  return exercisePlanExercisesComparableSignature(raw as PatientExercise[]);
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

      // ── Resolve therapist_id from patients row ───────────────────────────
      // exercise_plans has no therapist_id column; RLS enforces access through
      // the FK: patients.therapist_id = auth.uid()::text.  We fetch it here so
      // we can (a) verify it matches auth.uid() — if not, the INSERT will be
      // silently blocked by RLS, and (b) populate the audit log.
      const { data: prow, error: pErr } = await client
        .from('patients')
        .select('therapist_id')
        .eq('id', patientId)
        .maybeSingle();

      if (pErr) {
        logExercisePlansSupabaseError('שגיאה בשליפת therapist_id מ-patients', pErr, {
          patientId,
          auth_uid: authUid,
        });
        return clinicalPushFail(`patients: ${pErr.message}`, pErr);
      }

      // The therapist_id value we'll use for the audit log.
      // Always prefer auth.uid() — it's what RLS actually checks against.
      const rowTherapistId = (prow?.therapist_id as string | null | undefined) ?? null;
      const therapistId = authUid;

      if (!rowTherapistId) {
        // Patient row not visible via RLS (may not exist yet, or therapist_id is stale).
        // We'll still try the exercise_plans write; it will succeed only if the patients
        // row on the DB side already has therapist_id = auth.uid().
        console.warn(
          '[upsertExercisePlans] patients.therapist_id לא נמצא — ייתכן שה-RLS יחסום את ה-INSERT',
          { patientId, auth_uid: authUid }
        );
      } else if (rowTherapistId !== authUid) {
        // Mismatch: the stored therapist_id is different from the current JWT.
        // The RLS policy will block the INSERT with a silent 0-rows result or 403.
        console.warn(
          '[upsertExercisePlans] patients.therapist_id אינו תואם ל-auth.uid() — RLS ייחסום את הכתיבה',
          { patientId, row_therapist_id: rowTherapistId, auth_uid: authUid }
        );
      }

      // ── Fetch canonical active row (handles multiple is_active / version rows) ──
      const activeFetch = await fetchCanonicalActiveExercisePlanRow(client, patientId);
      if (!activeFetch.ok) return activeFetch;

      let prevActive = activeFetch.row;
      if (!prevActive) {
        const recheck = await fetchCanonicalActiveExercisePlanRow(client, patientId);
        if (!recheck.ok) return recheck;
        prevActive = recheck.row;
      }

      const hadPrev = prevActive != null;
      const currentVn = prevActive?.version_number ?? 0;
      const forceSave = forceSavePatientIds.has(patientId);
      const atVersionCap = currentVn >= EXERCISE_PLAN_VERSION_INSERT_CAP;

      if (hadPrev && !forceSave) {
        const dbSig = exercisesComparableSignatureFromUnknown(prevActive!.exercises);
        const incomingSig = exercisePlanExercisesComparableSignature(exercises);
        if (dbSig === incomingSig) {
          console.log(
            `[SAVE_CHECK] Attempting to save exercise plan. Change detected: NO (${patientId})`
          );
          continue;
        }
      }

      console.log(`[SAVE_CHECK] Attempting to save exercise plan. Change detected: YES (${patientId})`);

      console.log('[upsertExercisePlans] שולח תוכנית לענן', {
        patient_id: patientId,
        therapist_id_auth_uid: authUid,
        row_therapist_id: rowTherapistId,
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

      // At version cap: UPDATE the canonical active row instead of INSERTing another version.
      // forceSave bypasses the old session halt; auto-save also uses in-place update (never drops edits).
      if (atVersionCap && hadPrev) {
        if (!forceSave) {
          console.warn(
            `[upsertExercisePlans] version_number >= ${EXERCISE_PLAN_VERSION_INSERT_CAP} — in-place UPDATE (auto-save)`,
            { patientId, version_number: currentVn }
          );
        } else {
          console.log(
            `[upsertExercisePlans] version_number >= ${EXERCISE_PLAN_VERSION_INSERT_CAP} — in-place UPDATE (explicit forceSave)`,
            { patientId, version_number: currentVn }
          );
        }

        const upd = await updateActiveExercisePlanInPlace(client, {
          planRowId: prevActive!.id,
          patientId,
          exercises,
          now,
          changeSummary,
          authUid,
          rowTherapistId,
          prevExercises: prevActive!.exercises,
          therapistId,
        });
        if (!upd.ok) return upd;
        continue;
      }

      const nextVersion = hadPrev ? (prevActive!.version_number ?? 1) + 1 : 1;
      const parentPlanId = hadPrev ? prevActive!.id : null;
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
      } else {
        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'update',
          oldValue: { exercises: prevActive!.exercises },
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upsertExercisePlans] שגיאה בלתי צפויה', msg, e);
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

export type FetchPatientPayloadsForTherapistResult =
  | { ok: true; patients: Patient[] }
  | { ok: false; message: string };

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
    const payload = row.payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'id' in payload &&
      typeof (payload as Patient).id === 'string'
    ) {
      out.push(payload as Patient);
    }
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
  const exercises = Array.isArray(row.exercises)
    ? (row.exercises as PatientExercise[])
    : ([] as PatientExercise[]);
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
      return { ok: false, message: sessionGuard.message };
    }

    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: false, message: userErr?.message ?? 'אין משתמש מחובר' };
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
      return { ok: false, message: error.message };
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

    return { ok: true, patients: out };
  } catch (e) {
    logSupabaseCallError('fetchPatientPayloadsForTherapist/catch', e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type FetchActiveExercisePlansResult =
  | { ok: true; exercisePlans: ExercisePlan[] }
  | { ok: false; message: string };

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
    return { ok: true, exercisePlans: [] };
  }

  const { data, error } = await client
    .from('exercise_plans')
    .select('id, patient_id, exercises, version_number, updated_at, is_active')
    .in('patient_id', ids);

  console.log('[fetchActiveExercisePlansForPatientIds] raw Supabase response', {
    patientIds: ids,
    rowCount: data?.length ?? 0,
    error,
  });

  if (error) {
    console.warn('[fetchActiveExercisePlansForPatientIds] soft-fail — returning no plans', {
      patientIds: ids,
      message: error.message,
      code: (error as { code?: string }).code,
    });
    return { ok: true, exercisePlans: [] };
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
  return { ok: true, exercisePlans };
}

export type FetchActiveExercisePlanForPatientResult =
  | { ok: true; exercisePlan: ExercisePlan | null }
  | { ok: false; message: string };

export async function fetchActiveExercisePlanForPatient(
  client: SupabaseClient,
  patientId: string
): Promise<FetchActiveExercisePlanForPatientResult> {
  const id = patientId.trim();
  if (!id) {
    return { ok: true, exercisePlan: null };
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

  console.log('[fetchActiveExercisePlanForPatient] raw Supabase response', {
    patientId: id,
    rowCount: data?.length ?? 0,
    error,
  });

  if (error) {
    console.warn('[fetchActiveExercisePlanForPatient] soft-fail — treating as empty plan', {
      patientId: id,
      message: error.message,
      code: (error as { code?: string }).code,
    });
    return { ok: true, exercisePlan: null };
  }

  const rows = data ?? [];
  if (rows.length > 1) {
    console.warn(
      '[fetchActiveExercisePlanForPatient] multiple exercise_plans rows for patient_id — using first after sort (newest version)',
      {
        patientId: id,
        rowCount: rows.length,
        pickedVersion: rows[0]?.version_number,
        pickedId: rows[0]?.id,
      }
    );
  }

  const canonical = pickCanonicalExercisePlanDbRow(rows as ExercisePlanDbRow[]);
  if (!canonical) {
    return { ok: true, exercisePlan: null };
  }

  return {
    ok: true,
    exercisePlan: exercisePlanFromDbRow(canonical),
  };
}

export type FetchPatientsResult =
  | { ok: true; patients: Patient[]; exercisePlans: ExercisePlan[] }
  | { ok: false; message: string };

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
      base.patients.map((p) => p.id)
    );
    if (!plans.ok) return plans;

    return {
      ok: true,
      patients: base.patients,
      exercisePlans: mergeExercisePlansWithPatientPayloadCache(
        base.patients,
        plans.exercisePlans
      ),
    };
  } catch (e) {
    logSupabaseCallError('fetchPatients/catch', e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type GetPatientByIdResult =
  | { ok: true; patient: Patient; exercisePlan: ExercisePlan | null }
  | { ok: false; message: string };

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
    return { ok: false, message: 'getPatientById: missing patient id' };
  }

  const [rowResult, activePlanResult] = await Promise.all([
    client.from('patients').select('payload').eq('id', id).maybeSingle(),
    fetchActiveExercisePlanForPatient(client, id),
  ]);

  const { data, error } = rowResult;

  console.log('[getPatientById] patients row result', {
    patientId: id,
    hasData: !!data,
    error: error ?? null,
  });

  if (error) {
    return { ok: false, message: `patients: ${error.message}` };
  }
  const payload = (data as { payload?: unknown } | null)?.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('id' in payload) ||
    typeof (payload as Patient).id !== 'string'
  ) {
    console.warn('[getPatientById] patients payload חסר או לא תקין', {
      patientId: id,
      hasData: !!data,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    });
    return { ok: false, message: 'patients: missing or invalid payload' };
  }

  let exercisePlan: ExercisePlan | null = activePlanResult.ok
    ? activePlanResult.exercisePlan
    : null;
  if (!activePlanResult.ok) {
    console.warn('[getPatientById] exercise_plans result not ok (unexpected) — using cache only', {
      patientId: id,
      message: activePlanResult.message,
    });
  }

  if (!exercisePlan) {
    const cached = (payload as Patient)._exercisePlanCache;
    if (Array.isArray(cached) && cached.length > 0) {
      console.log('[getPatientById] exercise_plans ריק — משתמש ב-_exercisePlanCache מ-patients.payload', {
        patientId: id,
        cachedCount: cached.length,
      });
      exercisePlan = {
        patientId: id,
        exercises: cached as PatientExercise[],
        planRowId: activePlanResult.ok ? activePlanResult.exercisePlan?.planRowId : undefined,
        versionNumber: activePlanResult.ok
          ? activePlanResult.exercisePlan?.versionNumber
          : undefined,
        isActive: activePlanResult.ok ? activePlanResult.exercisePlan?.isActive : undefined,
      };
    } else {
      console.warn('[getPatientById] exercise_plans ריק וגם אין _exercisePlanCache — ייתכן שה-RLS חוסם את המטופל מטבלת exercise_plans', {
        patientId: id,
      });
    }
  }

  return {
    ok: true,
    patient: payload as Patient,
    exercisePlan,
  };
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
      sourcePatients = fetched.patients;
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
