import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AiSuggestion, BodyArea, Message, Patient, SafetyAlert } from '../types';
import { bodyAreaBlocksSelfCare } from '../body/bodyPickMapping';
import {
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
  persistPatientClinicalInsightsQueue,
  logRecommendationDismissAudit,
  logRecommendationApprovalAudit,
} from '../services/clinicalService';
import { supabase } from '../lib/supabase';
import {
  applyTherapistClinicalCycle,
  applyTherapistPrimaryFocus,
} from '../context/patientDomainHelpers';
import {
  appendLocalDismissedRecommendationSignature,
  collectDismissedRecommendationTypeSignatures,
  recommendationTypeDismissalSignature,
} from '../utils/clinicalAiQueueMerge';

function applySelfCareZonesForPatientUpdate(
  setSelfCareZonesByPatientId: Dispatch<SetStateAction<Record<string, BodyArea[]>>>,
  patientId: string,
  nextPatient: Patient
) {
  setSelfCareZonesByPatientId((zp) => {
    const cur = zp[patientId] ?? [];
    const s = nextPatient.secondaryClinicalBodyAreas ?? [];
    const filtered = cur.filter((a) => {
      const inj = nextPatient.injuryHighlightSegments ?? [];
      return !bodyAreaBlocksSelfCare(a, inj, s);
    });
    if (filtered.length === cur.length) return zp;
    return { ...zp, [patientId]: filtered };
  });
}

/**
 * אווטאר/מפת גוף, VAS/אנליטיקת כאב, רשומות רפואיות/הערות מטפל, וסנכרון שורות patients/profiles ל-Supabase.
 */
export type UseClinicalDataParams = {
  allPatients: Patient[];
  setAllPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSelfCareZonesByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, BodyArea[]>>
  >;
  setAiSuggestions: React.Dispatch<React.SetStateAction<AiSuggestion[]>>;
  safetyAlerts?: SafetyAlert[];
  /** Patient portal — skip `profiles` upsert; only own `patients` row. */
  restrictPatientSessionId?: string | null;
  /** Called after new AI queue items are added (e.g. immediate cloud shard push). */
  onClinicalQueueUpdated?: () => void;
};

export function useClinicalData({
  allPatients,
  setAllPatients,
  setMessages,
  setSelfCareZonesByPatientId,
  setAiSuggestions,
  safetyAlerts = [],
  restrictPatientSessionId = null,
  onClinicalQueueUpdated,
}: UseClinicalDataParams) {
  const resolveRedFlag = useCallback((patientId: string) => {
    setAllPatients((prev) =>
      prev.map((p) =>
        p.id === patientId ? { ...p, hasRedFlag: false, redFlagActive: false } : p
      )
    );
  }, [setAllPatients]);

  const reportPatientUrgentRedFlag = useCallback(
    (patientId: string, portalLogLine: string) => {
      const trimmed = portalLogLine.trim();
      if (!trimmed) return;
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? {
                ...p,
                hasRedFlag: true,
                redFlagActive: true,
                pendingMessages: p.pendingMessages + 1,
              }
            : p
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `urgent-rf-${Date.now()}`,
          patientId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          isRead: false,
          fromPatient: true,
        },
      ]);
    },
    [setAllPatients, setMessages]
  );

  const setPatientContactWhatsapp = useCallback(
    (patientId: string, phoneRaw: string) => {
      const d = phoneRaw.replace(/\D/g, '');
      const contactWhatsappE164 = d.length >= 9 ? d : undefined;
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, contactWhatsappE164 } : p))
      );
    },
    [setAllPatients]
  );

  const updateTherapistNotes = useCallback(
    (patientId: string, notes: string) => {
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: notes } : p))
      );
    },
    [setAllPatients]
  );

  const persistAiSuggestionQueueForPatient = useCallback(
    async (patientId: string, nextSuggestions: AiSuggestion[]) => {
      if (!supabase) return;
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return;

      const now = new Date().toISOString();
      const dismissedRecommendationSignatures = [
        ...collectDismissedRecommendationTypeSignatures(
          nextSuggestions,
          patientId,
          patient.clinicalInsightsQueue?.dismissedRecommendationSignatures ?? []
        ),
      ];
      const patientWithQueue: Patient = {
        ...patient,
        clinicalInsightsQueue: {
          aiSuggestions: nextSuggestions.filter((s) => s.patientId === patientId),
          safetyAlerts: safetyAlerts.filter((a) => a.patientId === patientId),
          dismissedRecommendationSignatures,
          syncedAt: now,
        },
      };
      const result = await persistPatientClinicalInsightsQueue(
        supabase,
        patientWithQueue,
        nextSuggestions,
        safetyAlerts,
        now
      );
      if (!result.ok && import.meta.env.DEV) {
        console.warn('[useClinicalData] clinical insights queue persist failed', result.message);
      }
    },
    [allPatients, safetyAlerts]
  );

  const appendDismissedRecommendationSignature = useCallback(
    (patientId: string, type: AiSuggestion['type']) => {
      const signature = recommendationTypeDismissalSignature(patientId, type);
      appendLocalDismissedRecommendationSignature(patientId, signature);
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const prevSigs = p.clinicalInsightsQueue?.dismissedRecommendationSignatures ?? [];
          if (prevSigs.includes(signature)) return p;
          return {
            ...p,
            clinicalInsightsQueue: {
              aiSuggestions: p.clinicalInsightsQueue?.aiSuggestions ?? [],
              safetyAlerts: p.clinicalInsightsQueue?.safetyAlerts ?? [],
              syncedAt: p.clinicalInsightsQueue?.syncedAt,
              dismissedRecommendationSignatures: [...prevSigs, signature],
            },
          };
        })
      );
      return signature;
    },
    [setAllPatients]
  );

  const commitTherapistAiSuggestionDecision = useCallback(
    async (
      suggestionId: string,
      status: 'approved' | 'dismissed',
      auditContext?: {
        appliedPlanUpdates?: Record<string, unknown>;
      }
    ) => {
      const reviewedAt = new Date().toISOString();
      let updatedSuggestion: AiSuggestion | undefined;
      let nextQueue: AiSuggestion[] = [];

      setAiSuggestions((prev) => {
        const found = prev.find((s) => s.id === suggestionId);
        if (!found || found.status !== 'awaiting_therapist') {
          nextQueue = prev;
          return prev;
        }
        updatedSuggestion = { ...found, status, reviewedAt };
        nextQueue = prev.map((s) => (s.id === suggestionId ? updatedSuggestion! : s));
        return nextQueue;
      });

      if (!updatedSuggestion) return;

      if (status === 'dismissed') {
        appendDismissedRecommendationSignature(updatedSuggestion.patientId, updatedSuggestion.type);
      }

      await persistAiSuggestionQueueForPatient(updatedSuggestion.patientId, nextQueue);
      onClinicalQueueUpdated?.();

      if (supabase) {
        const patientRow = allPatients.find((p) => p.id === updatedSuggestion!.patientId);
        const therapistId = patientRow?.therapistId?.trim();
        if (therapistId) {
          if (status === 'approved' && auditContext?.appliedPlanUpdates) {
            void logRecommendationApprovalAudit(supabase, {
              therapistId,
              patientId: updatedSuggestion.patientId,
              suggestion: updatedSuggestion,
              appliedPlanUpdates: auditContext.appliedPlanUpdates,
            });
          } else if (status === 'dismissed') {
            void logRecommendationDismissAudit(supabase, {
              therapistId,
              patientId: updatedSuggestion.patientId,
              suggestion: updatedSuggestion,
            });
          }
        }
      }
    },
    [
      allPatients,
      appendDismissedRecommendationSignature,
      onClinicalQueueUpdated,
      persistAiSuggestionQueueForPatient,
      setAiSuggestions,
    ]
  );

  /**
   * Former Recommendation Engine enqueue path — retired.
   * Program Review is the sole actionable plan-modification queue.
   * Still syncs optional therapist notes when provided.
   */
  const runClinicalAssessmentEngine = useCallback(
    (patientId: string, notes: string) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return;
      const trimmedNotes = notes.trim();
      if (trimmedNotes.length > 0 && (patient.therapistNotes ?? '').trim() !== trimmedNotes) {
        setAllPatients((prev) =>
          prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: trimmedNotes } : p))
        );
      }
    },
    [allPatients, setAllPatients]
  );

  const resetPatientPainReports = useCallback(
    (patientId: string) => {
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          return {
            ...p,
            analytics: {
              ...p.analytics,
              painHistory: [],
              averageOverallPain: 0,
              painByArea: {},
            },
          };
        })
      );
    },
    [setAllPatients]
  );

  const togglePatientInjuryHighlight = useCallback(
    (patientId: string, area: BodyArea) => {
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const cur = p.injuryHighlightSegments ?? [];
          const has = cur.includes(area);
          const next = has ? cur.filter((a) => a !== area) : [...cur, area];
          return { ...p, injuryHighlightSegments: next };
        })
      );
    },
    [setAllPatients]
  );

  const clearPatientInjuryHighlights = useCallback(
    (patientId: string) => {
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, injuryHighlightSegments: [] } : p))
      );
    },
    [setAllPatients]
  );

  const cycleTherapistBodyMapClinical = useCallback(
    (patientId: string, area: BodyArea) => {
      let nextPatient: Patient | null = null;
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        nextPatient = applyTherapistClinicalCycle(prev[idx], area);
        return prev.map((p, i) => (i === idx ? nextPatient! : p));
      });
      if (nextPatient) {
        applySelfCareZonesForPatientUpdate(setSelfCareZonesByPatientId, patientId, nextPatient);
      }
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  const setTherapistPrimaryBodyArea = useCallback(
    (patientId: string, area: BodyArea) => {
      let nextPatient: Patient | null = null;
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        nextPatient = applyTherapistPrimaryFocus(prev[idx], area);
        return prev.map((p, i) => (i === idx ? nextPatient! : p));
      });
      if (nextPatient) {
        applySelfCareZonesForPatientUpdate(setSelfCareZonesByPatientId, patientId, nextPatient);
      }
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  const applyTherapistPainFields = useCallback(
    (
      patientId: string,
      fields: {
        injuryHighlightSegments: BodyArea[];
        secondaryClinicalBodyAreas: BodyArea[];
        primaryBodyArea: BodyArea;
      }
    ) => {
      let nextPatient: Patient | null = null;
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        const p = prev[idx];
        nextPatient = {
          ...p,
          injuryHighlightSegments: [...fields.injuryHighlightSegments],
          secondaryClinicalBodyAreas: [...fields.secondaryClinicalBodyAreas],
          primaryBodyArea: fields.primaryBodyArea,
          manualClinicalSegmentLockOverrides: undefined,
        };
        return prev.map((x, i) => (i === idx ? nextPatient! : x));
      });
      if (nextPatient) {
        applySelfCareZonesForPatientUpdate(setSelfCareZonesByPatientId, patientId, nextPatient);
      }
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  const syncClinicalPatientsToSupabase = useCallback(async () => {
    if (!supabase) return { ok: false as const, message: 'Supabase לא מוגדר' };
    const now = new Date().toISOString();
    const ownId = restrictPatientSessionId?.trim() ?? '';
    if (ownId) {
      return upsertPatientRecords(supabase, allPatients, now, { onlyPatientId: ownId });
    }
    const r1 = await upsertTherapistProfilesForPatients(supabase, allPatients, now);
    if (!r1.ok) return r1;
    return upsertPatientRecords(supabase, allPatients, now);
  }, [allPatients, restrictPatientSessionId]);

  return {
    resolveRedFlag,
    reportPatientUrgentRedFlag,
    setPatientContactWhatsapp,
    updateTherapistNotes,
    runClinicalAssessmentEngine,
    commitTherapistAiSuggestionDecision,
    resetPatientPainReports,
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
    cycleTherapistBodyMapClinical,
    setTherapistPrimaryBodyArea,
    applyTherapistPainFields,
    syncClinicalPatientsToSupabase,
  };
}
