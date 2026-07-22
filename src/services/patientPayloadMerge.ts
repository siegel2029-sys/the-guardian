/**
 * Pure patient-payload merge / freeze canonicalize helpers.
 * Extracted from clinicalService so JSONB upsert sync stays testable without Supabase I/O.
 *
 * Iron Rule 4: sticky freeze + canonical `status: 'frozen'` live here — keep call-site
 * argument order (`existing`/`server` first, `incoming`/`local` second) when wiring hydrates.
 */
import type {
  BodyArea,
  DailyHistoryEntry,
  ExerciseSession,
  KnowledgeFact,
  PainRecord,
  Patient,
  PatientStatus,
} from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import {
  lifetimeXpFromPatient,
  normalizePatientProgressFields,
  patientWithLifetimeXp,
} from '../body/patientLevelXp';

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
  /**
   * When true, `accountFrozen` / clinical `status` follow `incoming` (intentional therapist
   * freeze/unfreeze). Default protects server freeze from stale client upserts.
   */
  trustIncomingAccountControl?: boolean;
};

/** True when payload marks a portal freeze (flag or legacy paused/frozen status). */
export function patientPayloadIsFrozen(
  p: Pick<Patient, 'accountFrozen' | 'status'> | undefined | null
): boolean {
  if (!p) return false;
  if (p.accountFrozen === true) return true;
  return p.status === 'frozen' || p.status === 'paused';
}

/**
 * Canonical freeze pair: `accountFrozen` + `status: 'frozen'`.
 * Legacy `paused` (used by older freeze writes) is normalized to `frozen`.
 */
export function canonicalizeAccountControl(
  accountFrozen: boolean,
  status: PatientStatus
): { accountFrozen: boolean; status: PatientStatus } {
  if (accountFrozen || status === 'frozen' || status === 'paused') {
    return { accountFrozen: true, status: 'frozen' };
  }
  return { accountFrozen: false, status };
}

/**
 * Merge therapist portal freeze / clinical status so stale clients cannot unfreeze.
 * Freeze is sticky unless `trustIncomingAccountControl` is set (intentional UI write).
 */
export function mergeAccountControlForUpsert(
  existing: Pick<Patient, 'accountFrozen' | 'status'> | undefined,
  incoming: Pick<Patient, 'accountFrozen' | 'status'>,
  opts?: { trustIncomingAccountControl?: boolean }
): { accountFrozen: boolean; status: PatientStatus } {
  if (opts?.trustIncomingAccountControl || !existing) {
    const frozen =
      incoming.accountFrozen === true ||
      incoming.status === 'frozen' ||
      incoming.status === 'paused';
    if (frozen) return { accountFrozen: true, status: 'frozen' };
    const status =
      incoming.status === 'frozen' || incoming.status === 'paused' ? 'active' : incoming.status;
    return { accountFrozen: false, status };
  }

  const existingFrozen = patientPayloadIsFrozen(existing);
  const incomingFrozen = patientPayloadIsFrozen(incoming);

  if (existingFrozen || incomingFrozen) {
    return { accountFrozen: true, status: 'frozen' };
  }

  return canonicalizeAccountControl(false, incoming.status);
}

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

/** Keep the newest ISO timestamp when merging patient payloads. */
function pickNewerPatientActivityIso(
  a: string | null | undefined,
  b: string | null | undefined
): string | undefined {
  const aa = a?.trim();
  const bb = b?.trim();
  if (!aa) return bb || undefined;
  if (!bb) return aa;
  return new Date(aa).getTime() >= new Date(bb).getTime() ? aa : bb;
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
    const sole = normalizePatientProgressFields({ ...incoming });
    const control = mergeAccountControlForUpsert(undefined, incoming, {
      trustIncomingAccountControl: opts?.trustIncomingAccountControl,
    });
    sole.accountFrozen = control.accountFrozen;
    sole.status = control.status;
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
  const merged = patientWithLifetimeXp({ ...incoming }, maxLife);
  const control = mergeAccountControlForUpsert(existing, incoming, {
    trustIncomingAccountControl: opts?.trustIncomingAccountControl,
  });
  merged.accountFrozen = control.accountFrozen;
  merged.status = control.status;
  merged.coins = Math.max(existing.coins ?? 0, incoming.coins ?? 0);
  merged.lastSessionDate =
    (existing.lastSessionDate ?? '').localeCompare(incoming.lastSessionDate ?? '') > 0
      ? existing.lastSessionDate
      : incoming.lastSessionDate;
  merged.pendingMessages = Math.max(existing.pendingMessages ?? 0, incoming.pendingMessages ?? 0);
  merged.lastWorkoutAt = pickNewerPatientActivityIso(existing.lastWorkoutAt, incoming.lastWorkoutAt);
  merged.lastLoginAt = pickNewerPatientActivityIso(existing.lastLoginAt, incoming.lastLoginAt);

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
