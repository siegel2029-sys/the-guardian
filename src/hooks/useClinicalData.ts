import { useCallback } from 'react';
import type { AiSuggestion, BodyArea, ExercisePlan, Message, Patient } from '../types';
import { bodyAreaBlocksSelfCare } from '../body/bodyPickMapping';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
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
  /** Patient portal — skip `profiles` upsert; only own `patients` row. */
  restrictPatientSessionId?: string | null;
};

export function useClinicalData({
  allPatients,
  setAllPatients,
  setMessages,
  setSelfCareZonesByPatientId,
  exercisePlans,
  setAiSuggestions,
  clinicalToday,
  restrictPatientSessionId = null,
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
      const insight = computeClinicalProgressInsight(patient, clinicalToday);

      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: notes } : p))
      );

      setAiSuggestions((prev) => {
        const withoutStale = prev.filter(
          (s) =>
            !(
              s.patientId === patientId &&
              s.source === 'therapist_note' &&
              s.status === 'pending'
            )
        );

        if (
          insight.category !== 'load_increase' &&
          insight.category !== 'load_decrease' &&
          insight.category !== 'escalate_care'
        ) {
          return withoutStale;
        }

        const ex = plan?.exercises.find((e) => (e.patientReps ?? 0) > 0);
        if (!ex) return withoutStale;

        const currentValue = ex.patientReps;
        const isReduce = insight.category === 'load_decrease' || insight.category === 'escalate_care';
        const suggestedValue = isReduce
          ? Math.max(1, currentValue - 3)
          : currentValue + 2;
        if (suggestedValue === currentValue) return withoutStale;

        const noteRef =
          notes.trim().length > 0
            ? ` סינתזה לאחר עדכון ההערכה הקלינית («${notes.trim().slice(0, 80)}${notes.trim().length > 80 ? '…' : ''}»).`
            : '';

        const newSug: AiSuggestion = {
          id: `ai-tn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          patientId,
          exerciseId: ex.id,
          exerciseName: ex.name,
          type: isReduce ? 'reduce_reps' : 'increase_reps',
          field: 'reps',
          currentValue,
          suggestedValue,
          reason: `${insight.nextStepHe}${noteRef}`,
          createdAt: new Date().toISOString(),
          status: 'pending',
          source: 'therapist_note',
        };
        return [...withoutStale, newSug];
      });
    },
    [allPatients, exercisePlans, clinicalToday, setAiSuggestions, setAllPatients]
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
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        const nextPatient = applyTherapistClinicalCycle(prev[idx], area);
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
        return prev.map((p, i) => (i === idx ? nextPatient : p));
      });
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  const setTherapistPrimaryBodyArea = useCallback(
    (patientId: string, area: BodyArea) => {
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        const nextPatient = applyTherapistPrimaryFocus(prev[idx], area);
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
        return prev.map((p, i) => (i === idx ? nextPatient : p));
      });
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  /** מפת כאב מטפל — עדכון שלושת השדות + ניקוי נעילות מקטע + סינון פרהאב */
  const applyTherapistPainFields = useCallback(
    (
      patientId: string,
      fields: {
        injuryHighlightSegments: BodyArea[];
        secondaryClinicalBodyAreas: BodyArea[];
        primaryBodyArea: BodyArea;
      }
    ) => {
      setAllPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === patientId);
        if (idx < 0) return prev;
        const p = prev[idx];
        const nextPatient: Patient = {
          ...p,
          injuryHighlightSegments: [...fields.injuryHighlightSegments],
          secondaryClinicalBodyAreas: [...fields.secondaryClinicalBodyAreas],
          primaryBodyArea: fields.primaryBodyArea,
          manualClinicalSegmentLockOverrides: undefined,
        };
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
        return prev.map((x, i) => (i === idx ? nextPatient : x));
      });
    },
    [setAllPatients, setSelfCareZonesByPatientId]
  );

  /**
   * דחיפה נקודתית של שורות קליניות (profiles מטפל + payload מטופל) — משמש לסנכרון ייעודי;
   * השמירה המלאה נשארת ב־savePersistedStateToCloud דרך supabaseSync.
   */
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
