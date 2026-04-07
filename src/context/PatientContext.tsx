// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  Patient, NavSection, Message, ExercisePlan, DailySession,
  PatientExercise, AiSuggestion, Exercise, PainLevel, ExerciseSession,
} from '../types';
import {
  mockPatients, mockMessages, mockExercisePlans, mockAiSuggestions,
} from '../data/mockData';

const TODAY = new Date().toISOString().slice(0, 10);

function buildEmptySession(patientId: string): DailySession {
  return { patientId, date: TODAY, completedIds: [], sessionXp: 0 };
}

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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

  // View mode (therapist dashboard vs simulated patient)
  viewMode: 'therapist' | 'patient';
  setViewMode: (mode: 'therapist' | 'patient') => void;

  // Red flags
  resolveRedFlag: (patientId: string) => void;

  // Exercise plans (mutable)
  exercisePlans: ExercisePlan[];
  getExercisePlan: (patientId: string) => ExercisePlan | undefined;
  addExerciseToPlan: (patientId: string, exercise: Exercise) => void;
  removeExerciseFromPlan: (patientId: string, exerciseId: string) => void;
  updateExerciseInPlan: (patientId: string, exerciseId: string, updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets'>>) => void;

  // Daily sessions
  dailySessions: DailySession[];
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

  // AI suggestions
  aiSuggestions: AiSuggestion[];
  getPendingAiSuggestions: (patientId: string) => AiSuggestion[];
  approveAiSuggestion: (suggestionId: string) => void;
  declineAiSuggestion: (suggestionId: string) => void;
}

const PatientContext = createContext<PatientContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

export function PatientProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(mockPatients);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(mockPatients[0].id);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>(mockExercisePlans);
  const [dailySessions, setDailySessions] = useState<DailySession[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(mockAiSuggestions);
  const [viewMode, setViewMode] = useState<'therapist' | 'patient'>('therapist');

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  // ── Patient selection ──────────────────────────────────────────
  const selectPatient = useCallback((id: string) => {
    setSelectedPatientId(id);
    setActiveSection('overview');
  }, []);

  // ── Messages ───────────────────────────────────────────────────
  const getPatientMessages = useCallback(
    (patientId: string) => messages.filter((m) => m.patientId === patientId),
    [messages]
  );

  const markMessageRead = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m)));
    setPatients((prev) =>
      prev.map((p) => {
        const unread = messages.filter(
          (m) => m.patientId === p.id && !m.isRead && m.id !== messageId
        ).length;
        return { ...p, pendingMessages: unread };
      })
    );
  }, [messages]);

  const sendTherapistReply = useCallback((patientId: string, content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}`, patientId, content, timestamp: new Date().toISOString(), isRead: true, fromPatient: false },
    ]);
  }, []);

  const sendPatientMessage = useCallback((patientId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
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
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
      )
    );
  }, []);

  // ── Red flags ──────────────────────────────────────────────────
  const resolveRedFlag = useCallback((patientId: string) => {
    setPatients((prev) => prev.map((p) => (p.id === patientId ? { ...p, hasRedFlag: false } : p)));
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
      updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets'>>
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
    (patientId: string): DailySession =>
      dailySessions.find((s) => s.patientId === patientId && s.date === TODAY) ??
      buildEmptySession(patientId),
    [dailySessions]
  );

  const toggleExercise = useCallback(
    (patientId: string, exerciseId: string, xpReward: number) => {
      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === TODAY);
        if (!existing) {
          return [...prev, { patientId, date: TODAY, completedIds: [exerciseId], sessionXp: xpReward }];
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
        return prev.map((s) => (s.patientId === patientId && s.date === TODAY ? updated : s));
      });
    },
    []
  );

  const submitExerciseReport = useCallback(
    (
      patientId: string,
      exerciseId: string,
      painLevel: number,
      effortRating: number,
      xpReward: number
    ) => {
      const prior = dailySessions.find((s) => s.patientId === patientId && s.date === TODAY);
      if (prior?.completedIds.includes(exerciseId)) return;

      const pain = clampPain(painLevel);
      const effort = clampEffort(effortRating);
      const plan = exercisePlans.find((ep) => ep.patientId === patientId);
      const totalInPlan = plan?.exercises.length ?? 0;
      const firstOfDay = !prior || prior.completedIds.length === 0;

      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === TODAY);
        if (existing?.completedIds.includes(exerciseId)) return prev;
        if (!existing) {
          return [...prev, { patientId, date: TODAY, completedIds: [exerciseId], sessionXp: xpReward }];
        }
        return prev.map((s) =>
          s.patientId === patientId && s.date === TODAY
            ? {
                ...s,
                completedIds: [...s.completedIds, exerciseId],
                sessionXp: s.sessionXp + xpReward,
              }
            : s
        );
      });

      setPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;

          // Clinical safety: red flag on elevated pain or reported exertion
          const triggersClinicalAlert = pain >= 6 || effort >= 4;
          const alertReasons: string[] = [];
          if (pain >= 6) alertReasons.push(`כאב ${pain}/10`);
          if (effort >= 4) alertReasons.push(`קושי ${effort}/5`);

          const painRecord = {
            date: TODAY,
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
          const todayIdx = sh.findIndex((s) => s.date === TODAY);
          let newSessionHistory: ExerciseSession[];

          const newDaySessionRow = todayIdx === -1;
          if (newDaySessionRow) {
            newSessionHistory = [
              ...sh,
              {
                date: TODAY,
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
            if (lastSessionDate === yesterdayIsoDate()) {
              currentStreak += 1;
            } else if (lastSessionDate !== TODAY) {
              currentStreak = 1;
            }
            longestStreak = Math.max(longestStreak, currentStreak);
          }
          lastSessionDate = TODAY;

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
    },
    [exercisePlans, dailySessions]
  );

  // ── AI Suggestions ─────────────────────────────────────────────
  const getPendingAiSuggestions = useCallback(
    (patientId: string) =>
      aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'pending'),
    [aiSuggestions]
  );

  const approveAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: 'approved' } : s))
    );
    // Apply the change to the exercise plan
    const suggestion = aiSuggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;
    const updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets'>> =
      suggestion.field === 'reps'
        ? { patientReps: suggestion.suggestedValue }
        : { patientSets: suggestion.suggestedValue };
    updateExerciseInPlan(suggestion.patientId, suggestion.exerciseId, updates);
  }, [aiSuggestions, updateExerciseInPlan]);

  const declineAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: 'declined' } : s))
    );
  }, []);

  return (
    <PatientContext.Provider
      value={{
        patients, selectedPatient, selectPatient,
        activeSection, setActiveSection,
        messages, markMessageRead, getPatientMessages, sendTherapistReply, sendPatientMessage,
        viewMode, setViewMode,
        resolveRedFlag,
        exercisePlans, getExercisePlan,
        addExerciseToPlan, removeExerciseFromPlan, updateExerciseInPlan,
        dailySessions, getTodaySession, toggleExercise, submitExerciseReport,
        aiSuggestions, getPendingAiSuggestions, approveAiSuggestion, declineAiSuggestion,
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
