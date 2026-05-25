import type {
  AiSuggestion,
  Patient,
  PatientClinicalInsightsQueue,
  SafetyAlert,
} from '../types';

export type ClinicalInsightsSnapshot = {
  aiSuggestions: AiSuggestion[];
  safetyAlerts: SafetyAlert[];
};

function isAiSuggestion(v: unknown): v is AiSuggestion {
  if (!v || typeof v !== 'object') return false;
  const o = v as AiSuggestion;
  return (
    typeof o.id === 'string' &&
    typeof o.patientId === 'string' &&
    typeof o.exerciseId === 'string' &&
    typeof o.status === 'string'
  );
}

function isSafetyAlert(v: unknown): v is SafetyAlert {
  if (!v || typeof v !== 'object') return false;
  const o = v as SafetyAlert;
  return (
    typeof o.id === 'string' &&
    typeof o.patientId === 'string' &&
    typeof o.reasonCode === 'string'
  );
}

function normalizeQueue(raw: unknown): PatientClinicalInsightsQueue | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as PatientClinicalInsightsQueue;
  const aiSuggestions = Array.isArray(o.aiSuggestions)
    ? o.aiSuggestions.filter(isAiSuggestion)
    : [];
  const safetyAlerts = Array.isArray(o.safetyAlerts)
    ? o.safetyAlerts.filter(isSafetyAlert)
    : [];
  const dismissedRecommendationSignatures = Array.isArray(o.dismissedRecommendationSignatures)
    ? [...new Set(o.dismissedRecommendationSignatures.filter((s): s is string => typeof s === 'string' && s.trim().length > 0))]
    : undefined;
  if (
    aiSuggestions.length === 0 &&
    safetyAlerts.length === 0 &&
    (!dismissedRecommendationSignatures || dismissedRecommendationSignatures.length === 0)
  ) {
    return undefined;
  }
  return {
    aiSuggestions,
    safetyAlerts,
    syncedAt: typeof o.syncedAt === 'string' ? o.syncedAt : undefined,
    dismissedRecommendationSignatures,
  };
}

/** Aggregate clinical queue shards from patient payloads (post-fetch / pull). */
export function pullClinicalInsightsFromPatientPayloads(
  patients: Patient[]
): ClinicalInsightsSnapshot {
  const sugById = new Map<string, AiSuggestion>();
  const alertById = new Map<string, SafetyAlert>();

  for (const p of patients) {
    const queue = normalizeQueue(p.clinicalInsightsQueue);
    if (!queue) continue;
    for (const s of queue.aiSuggestions) {
      const prev = sugById.get(s.id);
      if (!prev || s.createdAt.localeCompare(prev.createdAt) >= 0) {
        sugById.set(s.id, s);
      }
    }
    for (const a of queue.safetyAlerts) {
      const prev = alertById.get(a.id);
      if (!prev || a.createdAt.localeCompare(prev.createdAt) >= 0) {
        alertById.set(a.id, a);
      }
    }
  }

  return {
    aiSuggestions: [...sugById.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    safetyAlerts: [...alertById.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

const TERMINAL_AI_SUGGESTION_STATUSES = new Set(['approved', 'declined', 'dismissed']);

function isTerminalAiSuggestionStatus(status: string): boolean {
  return TERMINAL_AI_SUGGESTION_STATUSES.has(status);
}

function pickNewerAiSuggestion(local: AiSuggestion, remote: AiSuggestion): AiSuggestion {
  const localTerminal = isTerminalAiSuggestionStatus(local.status);
  const remoteTerminal = isTerminalAiSuggestionStatus(remote.status);

  if (localTerminal && !remoteTerminal) return local;
  if (remoteTerminal && !localTerminal) return remote;

  const localReviewed = local.reviewedAt ?? local.createdAt;
  const remoteReviewed = remote.reviewedAt ?? remote.createdAt;
  if (localTerminal && remoteTerminal) {
    return localReviewed.localeCompare(remoteReviewed) >= 0 ? local : remote;
  }

  return local.createdAt.localeCompare(remote.createdAt) >= 0 ? local : remote;
}

/** Merge server-pulled insights with local state (union by id; terminal therapist decisions win). */
export function mergeClinicalInsightsSnapshots(
  local: ClinicalInsightsSnapshot,
  remote: ClinicalInsightsSnapshot
): ClinicalInsightsSnapshot {
  const mergeAiSuggestions = (a: AiSuggestion[], b: AiSuggestion[]): AiSuggestion[] => {
    const map = new Map<string, AiSuggestion>();
    for (const row of [...a, ...b]) {
      const prev = map.get(row.id);
      map.set(row.id, prev ? pickNewerAiSuggestion(prev, row) : row);
    }
    return [...map.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  };

  const mergeById = <T extends { id: string; createdAt: string }>(
    left: T[],
    right: T[]
  ): T[] => {
    const map = new Map<string, T>();
    for (const row of [...left, ...right]) {
      const prev = map.get(row.id);
      if (!prev || row.createdAt.localeCompare(prev.createdAt) >= 0) {
        map.set(row.id, row);
      }
    }
    return [...map.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  };

  return {
    aiSuggestions: mergeAiSuggestions(local.aiSuggestions, remote.aiSuggestions),
    safetyAlerts: mergeById(local.safetyAlerts, remote.safetyAlerts),
  };
}

/** Embed global insight arrays into each patient's payload before cloud upsert. */
export function embedClinicalInsightsIntoPatients(
  patients: Patient[],
  aiSuggestions: AiSuggestion[],
  safetyAlerts: SafetyAlert[],
  syncedAt: string
): Patient[] {
  return patients.map((p) => {
    const patientSuggestions = aiSuggestions.filter((s) => s.patientId === p.id);
    const patientAlerts = safetyAlerts.filter((a) => a.patientId === p.id);
    const dismissedRecommendationSignatures =
      p.clinicalInsightsQueue?.dismissedRecommendationSignatures ?? [];
    if (
      patientSuggestions.length === 0 &&
      patientAlerts.length === 0 &&
      dismissedRecommendationSignatures.length === 0
    ) {
      const { clinicalInsightsQueue: _drop, ...rest } = p;
      return rest;
    }
    return {
      ...p,
      clinicalInsightsQueue: {
        aiSuggestions: patientSuggestions,
        safetyAlerts: patientAlerts,
        dismissedRecommendationSignatures,
        syncedAt,
      },
    };
  });
}
