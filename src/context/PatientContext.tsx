// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  Patient, NavSection, Message, ExercisePlan, DailySession,
  PatientExercise, AiSuggestion, Exercise, PainLevel, ExerciseSession, AiSuggestionSource,
  SafetyAlert, ClinicalSafetyTier, DailyHistoryEntry, BodyArea,
} from '../types';
import { bodyAreaLabels } from '../types';
import {
  mockPatients, mockMessages, mockExercisePlans, mockAiSuggestions, EXERCISE_LIBRARY, mockTherapist,
} from '../data/mockData';
import { getClinicalAlertStandardMessage } from '../ai/patientProgressReasoning';
import {
  screenPatientFreeTextForEmergency,
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
  type EmergencyScreenResult,
} from '../safety/clinicalEmergencyScreening';
import { getClinicalDate, getClinicalYesterday } from '../utils/clinicalCalendar';
import { mergeHistoryFromSessions } from '../utils/dailyHistory';
import { savePersistedPatientState } from './patientPersistence';
import { addPatientAccount } from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';

function buildEmptySession(patientId: string, clinicalDate: string): DailySession {
  return { patientId, date: clinicalDate, completedIds: [], sessionXp: 0 };
}

function clampPain(n: number): PainLevel {
  const r = Math.round(Math.min(10, Math.max(0, n)));
  return r as PainLevel;
}

function clampEffort(n: number): 1 | 2 | 3 | 4 | 5 {
  const r = Math.round(Math.min(5, Math.max(1, n)));
  return r as 1 | 2 | 3 | 4 | 5;
}

// ── Context shape ────────────────────────────────────────────────

interface PatientContextValue {
  // Patients
  patients: Patient[];
  selectedPatient: Patient | null;
  selectPatient: (id: string) => void;

  // Navigation
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;

  // Messages
  messages: Message[];
  markMessageRead: (id: string) => void;
  getPatientMessages: (patientId: string) => Message[];
  sendTherapistReply: (patientId: string, content: string) => void;
  /** Simulated patient → therapist (unread for therapist). */
  sendPatientMessage: (patientId: string, content: string) => void;
  /** התראה קלינית ממנוע Guardian לתיבת המטפל */
  sendAiClinicalAlert: (
    patientId: string,
    detailHebrew?: string,
    tier?: ClinicalSafetyTier
  ) => void;

  /** התראות בטיחות לדשבורד מטפל */
  safetyAlerts: SafetyAlert[];
  dismissSafetyAlert: (alertId: string) => void;
  /** נעילת תרגול אחרי חירום — רק מטפל משחרר */
  isPatientExerciseSafetyLocked: (patientId: string) => boolean;
  clearPatientExerciseSafetyLock: (patientId: string) => void;
  /** מזהה חירום בטקסט מטופל (צ׳אט/הודעה) — מחזיר true אם טופל כחירום */
  screenAndHandleEmergencyText: (patientId: string, text: string, sourceLabel: string) => boolean;
  /** לתצוגת מודל חירום בתצוגת מטופל */
  emergencyModalPatientId: string | null;
  setEmergencyModalPatientId: (id: string | null) => void;

  // View mode (therapist dashboard vs simulated patient)
  viewMode: 'therapist' | 'patient';
  setViewMode: (mode: 'therapist' | 'patient') => void;
  /** כניסה כמטופל — חוסם מעבר למסך מטפל */
  isPatientSessionLocked: boolean;
  /** יצירת מטופל + מזהה גישה וסיסמה (נשמר ב-localStorage) */
  createPatientWithAccess: (displayName: string) => {
    loginId: string;
    password: string;
    patientId: string;
  };

  // Red flags
  resolveRedFlag: (patientId: string) => void;

  // Exercise plans (mutable)
  exercisePlans: ExercisePlan[];
  getExercisePlan: (patientId: string) => ExercisePlan | undefined;
  addExerciseToPlan: (patientId: string, exercise: Exercise) => void;
  removeExerciseFromPlan: (patientId: string, exerciseId: string) => void;
  updateExerciseInPlan: (
    patientId: string,
    exerciseId: string,
    updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>>
  ) => void;

  // Daily sessions & לוח קליני (04:00)
  dailySessions: DailySession[];
  /** תאריך קליני נוכחי (מתעדכן אוטומטית, כולל מעבר ב־04:00) */
  clinicalToday: string;
  /** היסטוריה יומית לפי מטופל — מסונכרנת מ־dailySessions */
  dailyHistoryByPatient: Record<string, Record<string, DailyHistoryEntry>>;
  getTodaySession: (patientId: string) => DailySession;
  toggleExercise: (patientId: string, exerciseId: string, xpReward: number) => void;
  /** Patient flow: record pain/effort, award XP, optional red flag, merge daily session. */
  submitExerciseReport: (
    patientId: string,
    exerciseId: string,
    painLevel: number,
    effortRating: number,
    xpReward: number
  ) => void;

  // AI suggestions (מטופל מאשר → awaiting_therapist; מטפל מאשר → עדכון תוכנית)
  aiSuggestions: AiSuggestion[];
  getPendingAiSuggestions: (patientId: string) => AiSuggestion[];
  getAwaitingTherapistSuggestions: (patientId: string) => AiSuggestion[];
  getTotalAwaitingTherapistCount: () => number;
  /** מטופל: אישור הצעה → נשלחת בקשה למטפל (לא מעדכן תרגיל) */
  patientAgreeToAiSuggestion: (suggestionId: string) => void;
  /** מטופל: דחיית הצעה */
  patientDeclineAiSuggestion: (suggestionId: string) => void;
  /** מטפל: אישור סופי — מיישם שינוי בתוכנית */
  therapistApproveAiSuggestion: (suggestionId: string) => void;
  /** מטפל: דחייה אחרי בקשת מטופל */
  therapistDeclineAiSuggestion: (suggestionId: string) => void;
  /** Guardian: בקשת העלאת חזרות למטפל */
  submitGuardianRepsIncreaseRequest: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    currentReps: number,
    suggestedReps: number
  ) => void;

  /** בונוס למידה (מטבעות) בתצוגת מטופל */
  grantPatientCoins: (patientId: string, amount: number) => void;
  /** הידעת? — מטבעות + XP אחרי השלמת קריאה */
  grantPatientKnowledgeReward: (patientId: string) => void;

  /** אזור גוף + תוכנית התחלתית מספרייה (אונבורדינג מטופל חדש/ממתין) */
  applyInitialClinicalProfile: (
    patientId: string,
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[]
  ) => void;
}

const PatientContext = createContext<PatientContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

function randomPatientPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normalizePatientsTherapistIds(list: Patient[]): Patient[] {
  return list.map((p) => ({
    ...p,
    therapistId: p.therapistId ?? mockTherapist.id,
  }));
}

export function PatientProvider({
  children,
  restrictPatientSessionId = null,
  therapistScopeId = null,
}: {
  children: ReactNode;
  /** כשמוגדר — רק מטופל זה, ללא דשבורד מטפל */
  restrictPatientSessionId?: string | null;
  /** מטפל מחובר — סינון רשימת מטופלים בדשבורד */
  therapistScopeId?: string | null;
}) {
  const [clinicalTick, setClinicalTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClinicalTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [allPatients, setAllPatients] = useState<Patient[]>(() => {
    const persisted = readPersistedOnce().patient;
    const base = persisted?.patients ?? mockPatients;
    return normalizePatientsTherapistIds(base);
  });

  const patients = useMemo(() => {
    if (restrictPatientSessionId) {
      return allPatients.filter((p) => p.id === restrictPatientSessionId);
    }
    if (therapistScopeId) {
      return allPatients.filter((p) => p.therapistId === therapistScopeId);
    }
    return allPatients;
  }, [allPatients, therapistScopeId, restrictPatientSessionId]);

  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    const persisted = readPersistedOnce().patient;
    const listAll = normalizePatientsTherapistIds(persisted?.patients ?? mockPatients);
    if (restrictPatientSessionId && listAll.some((p) => p.id === restrictPatientSessionId)) {
      return restrictPatientSessionId;
    }
    const scoped = therapistScopeId
      ? listAll.filter((p) => p.therapistId === therapistScopeId)
      : listAll;
    const id = persisted?.selectedPatientId;
    if (id && scoped.some((p) => p.id === id)) return id;
    return scoped[0]?.id ?? listAll[0]?.id ?? '';
  });
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [messages, setMessages] = useState<Message[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.messages ?? mockMessages;
  });
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.exercisePlans ?? mockExercisePlans;
  });
  const [dailySessions, setDailySessions] = useState<DailySession[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.dailySessions ?? [];
  });
  const [dailyHistoryByPatient, setDailyHistoryByPatient] = useState<
    Record<string, Record<string, DailyHistoryEntry>>
  >(() => {
    const persisted = readPersistedOnce().patient;
    return mergeHistoryFromSessions(
      persisted?.dailySessions ?? [],
      persisted?.exercisePlans ?? mockExercisePlans,
      {}
    );
  });
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.aiSuggestions ?? mockAiSuggestions;
  });
  const [viewMode, setViewModeInternal] = useState<'therapist' | 'patient'>('therapist');

  const setViewMode = useCallback(
    (mode: 'therapist' | 'patient') => {
      if (restrictPatientSessionId && mode === 'therapist') return;
      setViewModeInternal(mode);
    },
    [restrictPatientSessionId]
  );
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.safetyAlerts ?? [];
  });
  const [exerciseSafetyLockedPatientIds, setExerciseSafetyLockedPatientIds] = useState<
    Record<string, boolean>
  >(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.exerciseSafetyLockedPatientIds ?? {};
  });
  const [emergencyModalPatientId, setEmergencyModalPatientId] = useState<string | null>(null);

  const isPatientSessionLocked = restrictPatientSessionId != null && restrictPatientSessionId !== '';

  useEffect(() => {
    if (!restrictPatientSessionId) return;
    setViewModeInternal('patient');
    setSelectedPatientId(restrictPatientSessionId);
  }, [restrictPatientSessionId]);

  useEffect(() => {
    if (!therapistScopeId || restrictPatientSessionId) return;
    const mine = allPatients.filter((p) => p.therapistId === therapistScopeId);
    if (!mine.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId(mine[0]?.id ?? '');
    }
  }, [therapistScopeId, allPatients, selectedPatientId, restrictPatientSessionId]);

  const clinicalToday = useMemo(() => {
    void clinicalTick;
    return getClinicalDate();
  }, [clinicalTick]);

  useEffect(() => {
    setDailyHistoryByPatient(
      mergeHistoryFromSessions(dailySessions, exercisePlans, {})
    );
  }, [dailySessions, exercisePlans]);

  useEffect(() => {
    savePersistedPatientState({
      version: 1,
      patients: allPatients,
      messages,
      exercisePlans,
      dailySessions,
      aiSuggestions,
      selectedPatientId,
      safetyAlerts,
      exerciseSafetyLockedPatientIds,
    });
  }, [
    allPatients,
    messages,
    exercisePlans,
    dailySessions,
    aiSuggestions,
    selectedPatientId,
    safetyAlerts,
    exerciseSafetyLockedPatientIds,
  ]);

  const selectedPatient = useMemo(
    () => allPatients.find((p) => p.id === selectedPatientId) ?? null,
    [allPatients, selectedPatientId]
  );

  // ── Patient selection ──────────────────────────────────────────
  const selectPatient = useCallback(
    (id: string) => {
      if (restrictPatientSessionId && id !== restrictPatientSessionId) return;
      if (
        therapistScopeId &&
        !allPatients.some((p) => p.id === id && p.therapistId === therapistScopeId)
      ) {
        return;
      }
      setSelectedPatientId(id);
      setActiveSection('overview');
    },
    [restrictPatientSessionId, therapistScopeId, allPatients]
  );

  // ── Messages ───────────────────────────────────────────────────
  const getPatientMessages = useCallback(
    (patientId: string) => messages.filter((m) => m.patientId === patientId),
    [messages]
  );

  const markMessageRead = useCallback((messageId: string) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m));
      setAllPatients((prev) =>
        prev.map((p) => ({
          ...p,
          pendingMessages: next.filter(
            (m) =>
              m.patientId === p.id &&
              !m.isRead &&
              (m.fromPatient || m.aiClinicalAlert)
          ).length,
        }))
      );
      return next;
    });
  }, []);

  const applyEmergencyProtocol = useCallback(
    (patientId: string, patientTextSnippet: string, r: EmergencyScreenResult, sourceLabel: string) => {
      const now = new Date().toISOString();
      const alertId = `sa-em-${Date.now()}-${patientId}`;
      setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
      setEmergencyModalPatientId(patientId);
      setSafetyAlerts((prev) => [
        ...prev,
        {
          id: alertId,
          patientId,
          reasonCode: r.reasonCode,
          reasonHebrew: r.reasonHebrew,
          severity: 'emergency',
          createdAt: now,
        },
      ]);
      const exactPatientText =
        patientTextSnippet.length > 8000
          ? `${patientTextSnippet.slice(0, 8000)}\n…(קוצר — המשך בצ׳אט המטופל)`
          : patientTextSnippet;
      const content =
        `🚨 התראת חירום קלינית (${sourceLabel})\n` +
        `${r.reasonHebrew}\n\n` +
        `הטקסט המדויק שכתב/ה המטופל:\n«${exactPatientText}»`;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-em-${Date.now()}`,
          patientId,
          content,
          timestamp: now,
          isRead: false,
          fromPatient: false,
          aiClinicalAlert: true,
          clinicalSafetyTier: 'emergency',
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? { ...p, hasRedFlag: true, pendingMessages: p.pendingMessages + 1 }
            : p
        )
      );
    },
    []
  );

  const screenAndHandleEmergencyText = useCallback(
    (patientId: string, text: string, sourceLabel: string): boolean => {
      const r = screenPatientFreeTextForEmergency(text);
      if (!r.isEmergency) return false;
      applyEmergencyProtocol(patientId, text, r, sourceLabel);
      return true;
    },
    [applyEmergencyProtocol]
  );

  const dismissSafetyAlert = useCallback((alertId: string) => {
    setSafetyAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const isPatientExerciseSafetyLocked = useCallback(
    (patientId: string) => !!exerciseSafetyLockedPatientIds[patientId],
    [exerciseSafetyLockedPatientIds]
  );

  const clearPatientExerciseSafetyLock = useCallback((patientId: string) => {
    setExerciseSafetyLockedPatientIds((prev) => {
      const next = { ...prev };
      delete next[patientId];
      return next;
    });
    setEmergencyModalPatientId((cur) => (cur === patientId ? null : cur));
  }, []);

  const sendTherapistReply = useCallback((patientId: string, content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        patientId,
        content,
        timestamp: new Date().toISOString(),
        isRead: false,
        fromPatient: false,
      },
    ]);
  }, []);

  const sendPatientMessage = useCallback(
    (patientId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const em = screenPatientFreeTextForEmergency(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          patientId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          isRead: false,
          fromPatient: true,
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
        )
      );
      if (em.isEmergency) {
        applyEmergencyProtocol(patientId, trimmed, em, 'הודעה למטפל');
      }
    },
    [applyEmergencyProtocol]
  );

  const sendAiClinicalAlert = useCallback(
    (patientId: string, detailHebrew?: string, tier: ClinicalSafetyTier = 'standard') => {
      const base = getClinicalAlertStandardMessage();
      let content: string;
      if (tier === 'high_priority') {
        content =
          detailHebrew ??
          `${base}\n\nנדרשת התייחסות המטפל בהקדם האפשרי.`;
      } else if (tier === 'emergency') {
        content = detailHebrew ?? base;
      } else {
        content = detailHebrew ? `${base}\n\n${detailHebrew}` : base;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${Date.now()}`,
          patientId,
          content,
          timestamp: new Date().toISOString(),
          isRead: false,
          fromPatient: false,
          aiClinicalAlert: true,
          clinicalSafetyTier: tier,
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
        )
      );
    },
    []
  );

  // ── Red flags ──────────────────────────────────────────────────
  const resolveRedFlag = useCallback((patientId: string) => {
    setAllPatients((prev) => prev.map((p) => (p.id === patientId ? { ...p, hasRedFlag: false } : p)));
  }, []);

  // ── Exercise plan CRUD ─────────────────────────────────────────
  const getExercisePlan = useCallback(
    (patientId: string) => exercisePlans.find((ep) => ep.patientId === patientId),
    [exercisePlans]
  );

  const addExerciseToPlan = useCallback((patientId: string, exercise: Exercise) => {
    const newEntry: PatientExercise = {
      ...exercise,
      id: `${patientId}-${exercise.id}-${Date.now()}`,
      patientSets: exercise.sets,
      patientReps: exercise.reps ?? 0,
      addedAt: new Date().toISOString(),
    };
    setExercisePlans((prev) => {
      const existing = prev.find((ep) => ep.patientId === patientId);
      if (existing) {
        // Don't add duplicates (check base exercise id)
        const alreadyIn = existing.exercises.some((e) =>
          e.id === newEntry.id || e.id.includes(exercise.id)
        );
        if (alreadyIn) return prev;
        return prev.map((ep) =>
          ep.patientId === patientId
            ? { ...ep, exercises: [...ep.exercises, newEntry] }
            : ep
        );
      }
      return [...prev, { patientId, exercises: [newEntry] }];
    });
  }, []);

  const removeExerciseFromPlan = useCallback((patientId: string, exerciseId: string) => {
    setExercisePlans((prev) =>
      prev.map((ep) =>
        ep.patientId === patientId
          ? { ...ep, exercises: ep.exercises.filter((e) => e.id !== exerciseId) }
          : ep
      )
    );
    // Clean up any daily session completions for this exercise
    setDailySessions((prev) =>
      prev.map((s) =>
        s.patientId === patientId
          ? { ...s, completedIds: s.completedIds.filter((id) => id !== exerciseId) }
          : s
      )
    );
  }, []);

  const updateExerciseInPlan = useCallback(
    (
      patientId: string,
      exerciseId: string,
      updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>>
    ) => {
      setExercisePlans((prev) =>
        prev.map((ep) =>
          ep.patientId === patientId
            ? {
                ...ep,
                exercises: ep.exercises.map((e) =>
                  e.id === exerciseId ? { ...e, ...updates } : e
                ),
              }
            : ep
        )
      );
    },
    []
  );

  // ── Daily sessions ─────────────────────────────────────────────
  const getTodaySession = useCallback(
    (patientId: string): DailySession => {
      void clinicalTick;
      const cd = getClinicalDate();
      return (
        dailySessions.find((s) => s.patientId === patientId && s.date === cd) ??
        buildEmptySession(patientId, cd)
      );
    },
    [dailySessions, clinicalTick]
  );

  const toggleExercise = useCallback(
    (patientId: string, exerciseId: string, xpReward: number) => {
      const cd = getClinicalDate();
      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === cd);
        if (!existing) {
          return [...prev, { patientId, date: cd, completedIds: [exerciseId], sessionXp: xpReward }];
        }
        const alreadyDone = existing.completedIds.includes(exerciseId);
        const updated: DailySession = {
          ...existing,
          completedIds: alreadyDone
            ? existing.completedIds.filter((id) => id !== exerciseId)
            : [...existing.completedIds, exerciseId],
          sessionXp: alreadyDone
            ? Math.max(0, existing.sessionXp - xpReward)
            : existing.sessionXp + xpReward,
        };
        return prev.map((s) => (s.patientId === patientId && s.date === cd ? updated : s));
      });
    },
    [clinicalTick]
  );

  const submitExerciseReport = useCallback(
    (
      patientId: string,
      exerciseId: string,
      painLevel: number,
      effortRating: number,
      xpReward: number
    ) => {
      const clinicalDay = getClinicalDate();
      const prior = dailySessions.find((s) => s.patientId === patientId && s.date === clinicalDay);
      if (prior?.completedIds.includes(exerciseId)) return;

      const pain = clampPain(painLevel);
      const effort = clampEffort(effortRating);
      const plan = exercisePlans.find((ep) => ep.patientId === patientId);
      const totalInPlan = plan?.exercises.length ?? 0;
      const firstOfDay = !prior || prior.completedIds.length === 0;
      const clinicalYesterday = getClinicalYesterday();

      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === clinicalDay);
        if (existing?.completedIds.includes(exerciseId)) return prev;
        if (!existing) {
          return [
            ...prev,
            {
              patientId,
              date: clinicalDay,
              completedIds: [exerciseId],
              sessionXp: xpReward,
            },
          ];
        }
        return prev.map((s) =>
          s.patientId === patientId && s.date === clinicalDay
            ? {
                ...s,
                completedIds: [...s.completedIds, exerciseId],
                sessionXp: s.sessionXp + xpReward,
              }
            : s
        );
      });

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;

          // Clinical safety: red flag on elevated pain or reported exertion
          const triggersClinicalAlert = pain >= 6 || effort >= 4;
          const alertReasons: string[] = [];
          if (pain >= 6) alertReasons.push(`כאב ${pain}/10`);
          if (effort >= 4) alertReasons.push(`קושי ${effort}/5`);

          const painRecord = {
            date: clinicalDay,
            painLevel: pain,
            bodyArea: p.primaryBodyArea,
            ...(alertReasons.length > 0
              ? { notes: `התראת בטיחות — ${alertReasons.join(' · ')}` }
              : {}),
          };

          const newPainHistory = [...p.analytics.painHistory, painRecord];
          const averageOverallPain =
            newPainHistory.reduce((sum, r) => sum + r.painLevel, 0) / newPainHistory.length;

          const sh = [...p.analytics.sessionHistory];
          const todayIdx = sh.findIndex((s) => s.date === clinicalDay);
          let newSessionHistory: ExerciseSession[];

          const newDaySessionRow = todayIdx === -1;
          if (newDaySessionRow) {
            newSessionHistory = [
              ...sh,
              {
                date: clinicalDay,
                exercisesCompleted: 1,
                totalExercises: Math.max(1, totalInPlan),
                difficultyRating: effort,
                xpEarned: xpReward,
              },
            ];
          } else {
            const cur = sh[todayIdx];
            const n = cur.exercisesCompleted + 1;
            const avgDiff = Math.round(
              (cur.difficultyRating * cur.exercisesCompleted + effort) / n
            );
            newSessionHistory = sh.map((s, i) =>
              i === todayIdx
                ? {
                    ...s,
                    exercisesCompleted: n,
                    totalExercises: Math.max(s.totalExercises, totalInPlan || 1),
                    difficultyRating: avgDiff,
                    xpEarned: s.xpEarned + xpReward,
                  }
                : s
            );
          }

          const sessionDiffAvg =
            newSessionHistory.reduce((sum, s) => sum + s.difficultyRating, 0) /
            newSessionHistory.length;

          let { xp, level, xpForNextLevel } = p;
          xp += xpReward;
          const MAX_LEVEL = 10;
          while (xp >= xpForNextLevel && level < MAX_LEVEL) {
            xp -= xpForNextLevel;
            level += 1;
            xpForNextLevel = Math.floor(xpForNextLevel * 1.15);
          }

          let { currentStreak, longestStreak, lastSessionDate } = p;
          if (firstOfDay) {
            if (lastSessionDate === clinicalYesterday) {
              currentStreak += 1;
            } else if (lastSessionDate !== clinicalDay) {
              currentStreak = 1;
            }
            longestStreak = Math.max(longestStreak, currentStreak);
          }
          lastSessionDate = clinicalDay;

          const totalSessions = newDaySessionRow
            ? p.analytics.totalSessions + 1
            : p.analytics.totalSessions;

          return {
            ...p,
            hasRedFlag: p.hasRedFlag || triggersClinicalAlert,
            xp,
            level: level as Patient['level'],
            xpForNextLevel,
            lastSessionDate,
            currentStreak,
            longestStreak,
            analytics: {
              ...p.analytics,
              painHistory: newPainHistory,
              averageOverallPain: Math.round(averageOverallPain * 10) / 10,
              sessionHistory: newSessionHistory,
              averageDifficulty: Math.round(sessionDiffAvg * 10) / 10,
              totalSessions,
            },
          };
        })
      );

      const planAfter = exercisePlans.find((ep) => ep.patientId === patientId);
      if (pain >= 7) {
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-pain-${Date.now()}`,
            patientId,
            reasonCode: 'PAIN_SURGE',
            reasonHebrew: 'עליית כאב — דיווח ≥7',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `דיווח לאחר תרגיל: כאב ${pain}/10.\nהמלצה למטפל: לשקול הורדת העומס בכ־30% (חזרות / סטים / משקל) לאחר הערכה קלינית.\nטקסט שהומלץ למטופל:\n${PAIN_SURGE_PATIENT_COPY}`,
          'high_priority'
        );
      }
      if (effort === 5) {
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-eff-${Date.now()}`,
            patientId,
            reasonCode: 'DIFFICULTY_MAX',
            reasonHebrew: 'קושי מקסימלי בתרגיל (5/5)',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `דיווח לאחר תרגיל: קושי מאמץ ${effort}/5.\nמומלץ להפחית חזרות או סטים עד עדכון ממטפל.\nטקסט שהומלץ למטופל:\n${DIFFICULTY_MAX_PATIENT_COPY}`,
          'high_priority'
        );
        const ex = planAfter?.exercises.find((e) => e.id === exerciseId);
        if (ex && ex.patientReps > 0) {
          const suggestedReps = Math.max(1, Math.floor(ex.patientReps * 0.7));
          if (suggestedReps < ex.patientReps) {
            setAiSuggestions((prev) => [
              ...prev,
              {
                id: `ai-eff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                patientId,
                exerciseId,
                exerciseName: ex.name,
                type: 'reduce_reps',
                field: 'reps',
                currentValue: ex.patientReps,
                suggestedValue: suggestedReps,
                reason:
                  'דיווח מאמץ 5/5 — הצעה אוטומטית להפחתת חזרות; אשרו או התאימו ידנית.',
                createdAt: new Date().toISOString(),
                status: 'awaiting_therapist',
                source: 'system',
              },
            ]);
          }
        }
      }
    },
    [exercisePlans, dailySessions, sendAiClinicalAlert, clinicalTick]
  );

  // ── AI Suggestions ─────────────────────────────────────────────
  const getPendingAiSuggestions = useCallback(
    (patientId: string) =>
      aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'pending'),
    [aiSuggestions]
  );

  const getAwaitingTherapistSuggestions = useCallback(
    (patientId: string) =>
      aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'awaiting_therapist'),
    [aiSuggestions]
  );

  const visiblePatientIds = useMemo(() => new Set(patients.map((p) => p.id)), [patients]);

  const getTotalAwaitingTherapistCount = useCallback(
    () =>
      aiSuggestions.filter(
        (s) => s.status === 'awaiting_therapist' && visiblePatientIds.has(s.patientId)
      ).length,
    [aiSuggestions, visiblePatientIds]
  );

  const patientAgreeToAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'pending'
          ? { ...s, status: 'awaiting_therapist' as const }
          : s
      )
    );
  }, []);

  const patientDeclineAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'pending' ? { ...s, status: 'declined' as const } : s
      )
    );
  }, []);

  const therapistApproveAiSuggestion = useCallback(
    (suggestionId: string) => {
      let found: AiSuggestion | undefined;
      setAiSuggestions((prev) => {
        found = prev.find((s) => s.id === suggestionId);
        if (!found || found.status !== 'awaiting_therapist') return prev;
        return prev.map((s) =>
          s.id === suggestionId ? { ...s, status: 'approved' as const } : s
        );
      });
      if (!found || found.status !== 'awaiting_therapist') return;
      const updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>> =
        found.field === 'reps'
          ? { patientReps: found.suggestedValue }
          : found.field === 'sets'
            ? { patientSets: found.suggestedValue }
            : { patientWeightKg: found.suggestedValue };
      updateExerciseInPlan(found.patientId, found.exerciseId, updates);
    },
    [updateExerciseInPlan]
  );

  const therapistDeclineAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'awaiting_therapist'
          ? { ...s, status: 'declined' as const }
          : s
      )
    );
  }, []);

  const submitGuardianRepsIncreaseRequest = useCallback(
    (
      patientId: string,
      exerciseId: string,
      exerciseName: string,
      currentReps: number,
      suggestedReps: number
    ) => {
      const newSug: AiSuggestion = {
        id: `ai-g-${Date.now()}`,
        patientId,
        exerciseId,
        exerciseName,
        type: 'increase_reps',
        field: 'reps',
        currentValue: currentReps,
        suggestedValue: suggestedReps,
        reason:
          'בקשה שהתקבלה מהמטופל דרך עוזר Guardian: דיווח קושי נמוך בימים האחרונים והצעה להעלות חזרות.',
        createdAt: new Date().toISOString(),
        status: 'awaiting_therapist',
        source: 'guardian_patient' as AiSuggestionSource,
      };
      setAiSuggestions((prev) => [...prev, newSug]);
    },
    []
  );

  const applyInitialClinicalProfile = useCallback(
    (patientId: string, primaryBodyArea: BodyArea, libraryExerciseIds: string[]) => {
      const lib = EXERCISE_LIBRARY.filter((e) => libraryExerciseIds.includes(e.id));
      const addedAt = new Date().toISOString();
      const newExercises: PatientExercise[] = lib.map((exercise, i) => ({
        ...exercise,
        id: `${patientId}-${exercise.id}-${addedAt}-${i}`,
        patientSets: exercise.sets,
        patientReps: exercise.reps ?? 0,
        addedAt,
      }));

      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? {
                ...p,
                primaryBodyArea,
                status: 'active',
                diagnosis: `מוקד טיפול: ${bodyAreaLabels[primaryBodyArea]}`,
              }
            : p
        )
      );
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [...rest, { patientId, exercises: newExercises }];
      });
    },
    []
  );

  const createPatientWithAccess = useCallback((displayName: string) => {
    const ownerTid = therapistScopeId ?? mockTherapist.id;
    const name = displayName.trim() || 'מטופל חדש';
    const patientId = `patient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const loginId = `PT-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
    const password = randomPatientPassword();
    const joinDate = new Date().toISOString().slice(0, 10);
    const newPatient: Patient = {
      id: patientId,
      therapistId: ownerTid,
      name,
      age: 30,
      diagnosis: 'חדש — עדכנו אבחון ואזור גוף',
      primaryBodyArea: 'back_lower',
      status: 'pending',
      level: 1,
      xp: 0,
      xpForNextLevel: 500,
      currentStreak: 0,
      longestStreak: 0,
      joinDate,
      lastSessionDate: joinDate,
      pendingMessages: 0,
      hasRedFlag: false,
      therapistNotes: '',
      coins: 0,
      analytics: {
        averageOverallPain: 0,
        painByArea: {},
        averageDifficulty: 0,
        totalSessions: 0,
        painHistory: [],
        sessionHistory: [],
      },
    };
    setAllPatients((prev) => [...prev, newPatient]);
    setExercisePlans((prev) => [...prev, { patientId, exercises: [] }]);
    addPatientAccount(loginId, patientId, password, ownerTid, { mustChangePassword: true });
    setSelectedPatientId(patientId);
    setActiveSection('overview');
    return { loginId, password, patientId };
  }, [therapistScopeId]);

  const grantPatientCoins = useCallback((patientId: string, amount: number) => {
    if (amount <= 0) return;
    setAllPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, coins: p.coins + amount } : p))
    );
  }, []);

  const grantPatientKnowledgeReward = useCallback((patientId: string) => {
    const COINS = 5;
    const XP = 5;
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        let { xp, level, xpForNextLevel, coins } = p;
        coins += COINS;
        xp += XP;
        const MAX_LEVEL = 10;
        while (xp >= xpForNextLevel && level < MAX_LEVEL) {
          xp -= xpForNextLevel;
          level += 1;
          xpForNextLevel = Math.floor(xpForNextLevel * 1.15);
        }
        return {
          ...p,
          coins,
          xp,
          level: level as Patient['level'],
          xpForNextLevel,
        };
      })
    );
  }, []);

  return (
    <PatientContext.Provider
      value={{
        patients, selectedPatient, selectPatient,
        activeSection, setActiveSection,
        messages, markMessageRead, getPatientMessages, sendTherapistReply, sendPatientMessage, sendAiClinicalAlert,
        safetyAlerts,
        dismissSafetyAlert,
        isPatientExerciseSafetyLocked,
        clearPatientExerciseSafetyLock,
        screenAndHandleEmergencyText,
        emergencyModalPatientId,
        setEmergencyModalPatientId,
        viewMode, setViewMode,
        isPatientSessionLocked,
        createPatientWithAccess,
        resolveRedFlag,
        exercisePlans, getExercisePlan,
        addExerciseToPlan, removeExerciseFromPlan, updateExerciseInPlan,
        clinicalToday,
        dailyHistoryByPatient,
        dailySessions, getTodaySession, toggleExercise, submitExerciseReport,
        aiSuggestions,
        getPendingAiSuggestions,
        getAwaitingTherapistSuggestions,
        getTotalAwaitingTherapistCount,
        patientAgreeToAiSuggestion,
        patientDeclineAiSuggestion,
        therapistApproveAiSuggestion,
        therapistDeclineAiSuggestion,
        submitGuardianRepsIncreaseRequest,
        grantPatientCoins,
        grantPatientKnowledgeReward,
        applyInitialClinicalProfile,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used inside PatientProvider');
  return ctx;
}
