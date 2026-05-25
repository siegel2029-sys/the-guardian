import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AiSuggestion, BodyArea, DailyHistoryEntry, ExercisePlan, Message, Patient } from '../types';
import { bodyAreaBlocksSelfCare } from '../body/bodyPickMapping';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
import {
  consolidateClinicalTracking,
  generateClinicalRecommendation,
} from '../ai/clinicalRecommendationEngine';
import {
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
} from '../services/clinicalService';
import { supabase } from '../lib/supabase';
import {
  applyTherapistClinicalCycle,
  applyTherapistPrimaryFocus,
} from '../context/patientDomainHelpers';
import { pickCanonicalExercisePlan } from '../utils/exercisePlanCanonical';
import {
  appendTherapistNoteToReason,
  mergeClinicalRecommendationIntoQueue,
  newClinicalAssessmentSuggestionId,
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
  exercisePlans: ExercisePlan[];
  setAiSuggestions: React.Dispatch<React.SetStateAction<AiSuggestion[]>>;
  clinicalToday: string;
  dailyHistoryByPatient?: Record<string, Record<string, DailyHistoryEntry>>;
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
  exercisePlans,
  setAiSuggestions,
  clinicalToday,
  dailyHistoryByPatient = {},
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

  const runClinicalAssessmentEngine = useCallback(
    (patientId: string, notes: string) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return;

      const plan = pickCanonicalExercisePlan(exercisePlans, patientId);
      const exercises = plan?.exercises ?? [];
      const dayMap = dailyHistoryByPatient?.[patientId];
      const insight = computeClinicalProgressInsight(patient, clinicalToday);

      const trimmedNotes = notes.trim();
      if (trimmedNotes.length > 0 && (patient.therapistNotes ?? '').trim() !== trimmedNotes) {
        setAllPatients((prev) =>
          prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: trimmedNotes } : p))
        );
      }

      void (async () => {
        const tracking = consolidateClinicalTracking({
          patient,
          clinicalToday,
          dayMap,
          rehabExerciseCount: exercises.length,
        });

        const gate = tracking.longitudinalGate;
        const shouldGenerate =
          exercises.length > 0 &&
          (gate.shouldSuggest ||
            tracking.recommendationIntent === 'progression' ||
            tracking.recommendationIntent === 'regression' ||
            insight.category === 'load_increase' ||
            insight.category === 'load_decrease' ||
            insight.category === 'escalate_care');

        if (!shouldGenerate) return;

        const engineRec = await generateClinicalRecommendation({
          patient,
          clinicalExercises: exercises,
          clinicalToday,
          dayMap,
          longitudinalGate: gate,
          defaultStatus: 'awaiting_therapist',
        });

        let queueChanged = false;

        setAiSuggestions((prev) => {
          let candidate: AiSuggestion | null = null;

          if (engineRec) {
            candidate = {
              ...engineRec,
              id: newClinicalAssessmentSuggestionId(patientId),
              status: 'awaiting_therapist',
              source: 'clinical_recommendation_engine',
              reason: appendTherapistNoteToReason(engineRec.reason, notes),
            };
          } else if (
            insight.category === 'load_increase' ||
            insight.category === 'load_decrease' ||
            insight.category === 'escalate_care'
          ) {
            const ex = exercises.find((e) => (e.patientReps ?? 0) > 0);
            if (ex) {
              const currentValue = ex.patientReps;
              const isReduce =
                insight.category === 'load_decrease' || insight.category === 'escalate_care';
              const suggestedValue = isReduce
                ? Math.max(1, Math.floor(currentValue * 0.75))
                : Math.max(currentValue + 1, Math.round(currentValue * 1.1));

              if (suggestedValue !== currentValue) {
                candidate = {
                  id: newClinicalAssessmentSuggestionId(patientId),
                  patientId,
                  exerciseId: ex.id,
                  exerciseName: ex.name,
                  type: isReduce ? 'reduce_reps' : 'increase_reps',
                  field: 'reps',
                  currentValue,
                  suggestedValue,
                  reason: appendTherapistNoteToReason(
                    `${insight.nextStepHe}\n\n${insight.basisHe}`,
                    notes
                  ),
                  createdAt: new Date().toISOString(),
                  status: 'awaiting_therapist',
                  source: 'clinical_recommendation_engine',
                };
              }
            }
          }

          const { next, changed } = mergeClinicalRecommendationIntoQueue(
            prev,
            patientId,
            candidate
          );
          queueChanged = changed;
          return next;
        });

        if (queueChanged) onClinicalQueueUpdated?.();
      })();
    },
    [
      allPatients,
      exercisePlans,
      clinicalToday,
      dailyHistoryByPatient,
      setAiSuggestions,
      setAllPatients,
      onClinicalQueueUpdated,
    ]
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
    resetPatientPainReports,
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
    cycleTherapistBodyMapClinical,
    setTherapistPrimaryBodyArea,
    applyTherapistPainFields,
    syncClinicalPatientsToSupabase,
  };
}
