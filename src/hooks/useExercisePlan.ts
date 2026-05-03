import { useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiSuggestion,
  AiSuggestionSource,
  BodyArea,
  ClinicalSafetyTier,
  DailySession,
  Exercise,
  ExercisePlan,
  ExerciseSession,
  InitialClinicalProfileExtras,
  NavSection,
  Patient,
  PatientExercise,
  PatientExerciseFinishReport,
  PatientIntakeArchive,
  SafetyAlert,
  SelfCareSessionReport,
} from '../types';
import { bodyAreaLabels } from '../types';
import { EXERCISE_LIBRARY } from '../data/mockData';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';
import { addClinicalDays, getClinicalDate, getClinicalYesterday } from '../utils/clinicalCalendar';
import { sendDataToTherapist } from '../utils/therapistAnalytics';
import { getTherapistAlertEmail, openClinicalMailto } from '../utils/clinicalAlertEmail';
import {
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
} from '../safety/clinicalEmergencyScreening';
import { isChainReactionZoneForPrimary } from '../body/chainReactionZones';
import { bodyAreaBlocksSelfCare } from '../body/bodyPickMapping';
import {
  applyXpCoinsLevelUp,
  computeExerciseCompletionRewards,
  computeOptionalRehabExerciseRewards,
  computeStreakAfterFirstDailyCompletion,
} from '../utils/gamification-utils';
import { xpRequiredToReachNextLevel } from '../body/patientLevelXp';
import { loadAuthSnapshot, addPatientAccount } from '../context/authPersistence';
import {
  isSupabaseAuthEnabled,
  signUpPortalPatientOnCreate,
  normalizePortalUsername,
  isValidPortalUsername,
} from '../lib/patientPortalAuth';
import { defaultPatientGear, type PatientGearState } from '../context/patientGearUtils';
import { buildEmptySession, clampPain, clampEffort } from '../context/patientDomainHelpers';
import { pickCanonicalExercisePlan } from '../utils/exercisePlanCanonical';
import { canPilot11DebugMutatePatient } from '../utils/pilot11GamificationDebug';
import { completeExerciseSafe } from '../services/exerciseCompletionRpc';

export type UseExercisePlanParams = {
  patients: Patient[];
  allPatients: Patient[];
  setAllPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  exercisePlans: ExercisePlan[];
  setExercisePlans: React.Dispatch<React.SetStateAction<ExercisePlan[]>>;
  dailySessions: DailySession[];
  setDailySessions: React.Dispatch<React.SetStateAction<DailySession[]>>;
  clinicalTick: number;
  clinicalToday: string;
  aiSuggestions: AiSuggestion[];
  setAiSuggestions: React.Dispatch<React.SetStateAction<AiSuggestion[]>>;
  selfCareZonesByPatientId: Record<string, BodyArea[]>;
  setSelfCareZonesByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, BodyArea[]>>
  >;
  selfCareReportsByPatientId: Record<string, SelfCareSessionReport[]>;
  setSelfCareReportsByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, SelfCareSessionReport[]>>
  >;
  patientExerciseFinishReportsByPatientId: Record<string, PatientExerciseFinishReport[]>;
  setPatientExerciseFinishReportsByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, PatientExerciseFinishReport[]>>
  >;
  selfCareStrengthTierByPatientId: Record<string, Partial<Record<BodyArea, 0 | 1 | 2>>>;
  setSelfCareStrengthTierByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, Partial<Record<BodyArea, 0 | 1 | 2>>>>
  >;
  patientGearByPatientId: Record<string, PatientGearState>;
  setPatientGearByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, PatientGearState>>
  >;
  setExerciseSafetyLockedPatientIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  setSafetyAlerts: React.Dispatch<React.SetStateAction<SafetyAlert[]>>;
  sendAiClinicalAlert: (
    patientId: string,
    detailHebrew?: string,
    tier?: ClinicalSafetyTier
  ) => void;
  pushRewardFeedback: (
    xpAdded: number,
    coinsAdded: number,
    streakBonusXp?: number,
    message?: string
  ) => void;
  therapistScopeIds: string[] | null | undefined;
  setSelectedPatientId: React.Dispatch<React.SetStateAction<string>>;
  setActiveSection: React.Dispatch<React.SetStateAction<NavSection>>;
  /** When set (patient portal), rehab completions call `complete_exercise_safe` instead of updating `exercise_plans` directly. */
  supabaseClient: SupabaseClient | null;
  patientPortalPatientId: string | null;
};

function randomPatientPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * תוכניות אימון, סשנים יומיים, השלמת תרגילים (כולל פידבק Guardi דרך pushRewardFeedback), פרהאב והצעות AI לתרגול.
 */
export function useExercisePlan(params: UseExercisePlanParams) {
  const {
    patients,
    allPatients,
    setAllPatients,
    exercisePlans,
    setExercisePlans,
    dailySessions,
    setDailySessions,
    clinicalTick,
    clinicalToday,
    aiSuggestions,
    setAiSuggestions,
    selfCareZonesByPatientId,
    setSelfCareZonesByPatientId,
    selfCareReportsByPatientId,
    setSelfCareReportsByPatientId,
    patientExerciseFinishReportsByPatientId,
    setPatientExerciseFinishReportsByPatientId,
    selfCareStrengthTierByPatientId,
    setSelfCareStrengthTierByPatientId,
    patientGearByPatientId,
    setPatientGearByPatientId,
    setExerciseSafetyLockedPatientIds,
    setSafetyAlerts,
    sendAiClinicalAlert,
    pushRewardFeedback,
    therapistScopeIds,
    setSelectedPatientId,
    setActiveSection,
    supabaseClient,
    patientPortalPatientId,
  } = params;
  // ── Exercise plan CRUD ─────────────────────────────────────────
  const getExercisePlan = useCallback(
    (patientId: string) => pickCanonicalExercisePlan(exercisePlans, patientId),
    [exercisePlans]
  );

  const addExerciseToPlan = useCallback((patientId: string, exercise: Exercise) => {
    const newEntry: PatientExercise = {
      ...exercise,
      videoUrl: exercise.videoUrl || DEFAULT_EXERCISE_DEMO_VIDEO_URL,
      id: `${patientId}-${exercise.id}-${Date.now()}`,
      patientSets: exercise.sets,
      patientReps: exercise.reps ?? 0,
      addedAt: new Date().toISOString(),
      isOptional: exercise.isOptional === true,
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
      updates: Partial<
        Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg' | 'isOptional'>
      >
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
      xpReward: number,
      options?: {
        skipPainHistory?: boolean;
        completionSource?: 'rehab' | 'self-care';
        sessionBodyArea?: BodyArea;
        /** 2nd+ optional pool exercise today — no XP/coins (anti-farming). */
        optionalPoolNoReward?: boolean;
      }
    ) => {
      const clinicalDay = getClinicalDate();
      const prior = dailySessions.find((s) => s.patientId === patientId && s.date === clinicalDay);
      const wasRepeatCompletion = prior?.completedIds.includes(exerciseId) ?? false;

      const patientBefore = allPatients.find((x) => x.id === patientId);
      if (!patientBefore) return;

      const pain = clampPain(painLevel);
      const effort = clampEffort(effortRating);
      const plan = pickCanonicalExercisePlan(exercisePlans, patientId);
      const totalInPlan = plan?.exercises.length ?? 0;
      const rehabEx = plan?.exercises.find((e) => e.id === exerciseId);
      const sessionZone = options?.sessionBodyArea ?? rehabEx?.targetArea ?? undefined;
      const isOptionalRehab =
        options?.completionSource === 'rehab' && rehabEx?.isOptional === true;
      const firstOfDay = !prior || prior.completedIds.length === 0;
      const clinicalYesterday = getClinicalYesterday();
      const clinicalTwoDaysAgo = addClinicalDays(clinicalDay, -2);
      const gearSnap = patientGearByPatientId[patientId] ?? defaultPatientGear();

      const { nextStreak, consumeStreakShield } = computeStreakAfterFirstDailyCompletion({
        firstOfDay,
        currentStreak: patientBefore.currentStreak,
        lastSessionDate: patientBefore.lastSessionDate,
        clinicalDay,
        clinicalYesterday,
        clinicalTwoDaysAgo,
        streakShieldCharges: gearSnap.streakShieldCharges,
      });

      const streakForXpMultiplier = firstOfDay ? nextStreak : patientBefore.currentStreak;
      const noOptionalPoolReward = options?.optionalPoolNoReward === true;
      const {
        xpGain,
        streakBonusXp,
        coinsGain,
        rewardMessage,
      } = noOptionalPoolReward
        ? {
            xpGain: 0,
            streakBonusXp: 0,
            coinsGain: 0,
            rewardMessage: undefined,
          }
        : isOptionalRehab
          ? computeOptionalRehabExerciseRewards({
              planXpReward: xpReward,
              streakForXpMultiplier,
              xpBoosterEquippedAndOwned:
                gearSnap.equippedPassiveId === 'xp_booster' &&
                gearSnap.ownedGearIds.includes('xp_booster'),
            })
          : computeExerciseCompletionRewards({
              planXpReward: xpReward,
              streakForXpMultiplier,
              xpBoosterEquippedAndOwned:
                gearSnap.equippedPassiveId === 'xp_booster' &&
                gearSnap.ownedGearIds.includes('xp_booster'),
            });

      if (xpGain > 0 || coinsGain > 0 || streakBonusXp > 0) {
        pushRewardFeedback(
          xpGain,
          coinsGain,
          streakBonusXp > 0 ? streakBonusXp : undefined,
          rewardMessage
        );
      }

      flushSync(() => {
        setDailySessions((prev) => {
          const existing = prev.find((s) => s.patientId === patientId && s.date === clinicalDay);
          if (!existing) {
            return [
              ...prev,
              {
                patientId,
                date: clinicalDay,
                completedIds: [exerciseId],
                sessionXp: xpGain,
              },
            ];
          }
          return prev.map((s) =>
            s.patientId === patientId && s.date === clinicalDay
              ? {
                  ...s,
                  completedIds: s.completedIds.includes(exerciseId)
                    ? s.completedIds
                    : [...s.completedIds, exerciseId],
                  sessionXp: s.sessionXp + xpGain,
                }
              : s
          );
        });
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

          const newPainHistory = options?.skipPainHistory
            ? p.analytics.painHistory
            : [...p.analytics.painHistory, painRecord];
          const averageOverallPain =
            newPainHistory.length === 0
              ? p.analytics.averageOverallPain
              : Math.round(
                  (newPainHistory.reduce((sum, r) => sum + r.painLevel, 0) / newPainHistory.length) *
                    10
                ) / 10;

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
                xpEarned: xpGain,
              },
            ];
          } else {
            const cur = sh[todayIdx];
            if (!wasRepeatCompletion) {
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
                      xpEarned: s.xpEarned + xpGain,
                    }
                  : s
              );
            } else {
              newSessionHistory = sh.map((s, i) =>
                i === todayIdx
                  ? {
                      ...s,
                      exercisesCompleted: cur.exercisesCompleted,
                      totalExercises: Math.max(s.totalExercises, totalInPlan || 1),
                      difficultyRating: Math.round((cur.difficultyRating + effort) / 2),
                      xpEarned: s.xpEarned + xpGain,
                    }
                  : s
              );
            }
          }

          const sessionDiffAvg =
            newSessionHistory.reduce((sum, s) => sum + s.difficultyRating, 0) /
            newSessionHistory.length;

          let { longestStreak, lastSessionDate } = p;
          let currentStreak = p.currentStreak;
          if (firstOfDay) {
            currentStreak = nextStreak;
            longestStreak = Math.max(longestStreak, currentStreak);
          }
          lastSessionDate = clinicalDay;

          const totalSessions = newDaySessionRow
            ? p.analytics.totalSessions + 1
            : p.analytics.totalSessions;

          const leveled = applyXpCoinsLevelUp(p, xpGain, coinsGain);

          return {
            ...leveled,
            hasRedFlag: p.hasRedFlag || triggersClinicalAlert,
            redFlagActive: p.redFlagActive || (pain >= 7 && sessionZone === p.primaryBodyArea),
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

      if (consumeStreakShield) {
        setPatientGearByPatientId((gPrev) => {
          const cur = gPrev[patientId] ?? defaultPatientGear();
          return {
            ...gPrev,
            [patientId]: {
              ...cur,
              streakShieldCharges: Math.max(0, cur.streakShieldCharges - 1),
            },
          };
        });
      }

      if (
        sessionZone &&
        sessionZone === patientBefore.primaryBodyArea &&
        pain >= 7
      ) {
        setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[PHYSIOSHIELD] עצירת אימון — כאב גבוה במוקד פגיעה';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `מוקד פגיעה ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `כאב דווח: ${pain}/10\n\n` +
          'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.';
        openClinicalMailto(email, subject, body);
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-primary-${Date.now()}`,
            patientId,
            reasonCode: 'PAIN_SURGE',
            reasonHebrew: 'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.',
          'high_priority'
        );
      }

      if (
        options?.completionSource === 'self-care' &&
        sessionZone &&
        isChainReactionZoneForPrimary(patientBefore.primaryBodyArea, sessionZone) &&
        pain >= 7
      ) {
        setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[PHYSIOSHIELD] עצירת בטיחות — תגובת שרשרת';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `אזור קליני ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `תרגיל כוח באזור שרשרת: ${bodyAreaLabels[sessionZone]}\n` +
          `כאב דווח: ${pain}/10\n\n` +
          'הסשן נעצר אוטומטית — יש להתייחס לפי פרוטוקול.';
        openClinicalMailto(email, subject, body);
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-chain-${Date.now()}`,
            patientId,
            reasonCode: 'CHAIN_REACTION',
            reasonHebrew: `כאב גבוה אחרי תרגול ב־${bodyAreaLabels[sessionZone]} (אזור שרשרת למוקד ${bodyAreaLabels[patientBefore.primaryBodyArea]})`,
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `עצירת בטיחות (שרשרת): כאב ${pain}/10 אחרי פעילות ב־${bodyAreaLabels[sessionZone]} ביחס למוקד ${bodyAreaLabels[patientBefore.primaryBodyArea]}. נשלח דוא״ל למטפל.`,
          'high_priority'
        );
      }

      if (pain >= 7) {
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[PHYSIOSHIELD] התראת כאב גבוהה';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `אזור תרגול: ${sessionZone ? bodyAreaLabels[sessionZone] : bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `מוקד פגיעה ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `כאב דווח: ${pain}/10\n` +
          `קושי דווח: ${effort}/5\n` +
          `תאריך קליני: ${clinicalDay}\n\n` +
          'נדרשת בדיקה קלינית ועדכון עומסים לפי שיקול מטפל.';
        openClinicalMailto(email, subject, body);
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
        const ex = plan?.exercises.find((e) => e.id === exerciseId);
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

      if (
        supabaseClient &&
        patientPortalPatientId &&
        patientId === patientPortalPatientId &&
        options?.completionSource === 'rehab' &&
        rehabEx
      ) {
        void completeExerciseSafe(supabaseClient, exerciseId, {
          pain_level: pain,
          effort_rating: effort,
          clinical_date: clinicalDay,
          optional_pool_no_reward: options?.optionalPoolNoReward ?? false,
          session_body_area: options?.sessionBodyArea ?? null,
        }).then((r) => {
          if (!r.ok && import.meta.env.DEV) {
            console.warn('[complete_exercise_safe]', r);
          }
        });
      }
    },
    [
      exercisePlans,
      dailySessions,
      sendAiClinicalAlert,
      clinicalTick,
      allPatients,
      pushRewardFeedback,
      patientGearByPatientId,
      setExerciseSafetyLockedPatientIds,
      supabaseClient,
      patientPortalPatientId,
    ]
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
          'בקשה שהתקבלה מהמטופל דרך עוזר PHYSIOSHIELD: דיווח קושי נמוך בימים האחרונים והצעה להעלות חזרות.',
        createdAt: new Date().toISOString(),
        status: 'awaiting_therapist',
        source: 'guardian_patient' as AiSuggestionSource,
      };
      setAiSuggestions((prev) => [...prev, newSug]);
    },
    []
  );

  const submitPatientAiPlanAdjustmentRequest = useCallback((suggestion: AiSuggestion) => {
    const entry: AiSuggestion = {
      ...suggestion,
      status: 'awaiting_therapist',
      source: (suggestion.source ?? 'gemini_portal') as AiSuggestionSource,
    };
    setAiSuggestions((prev) => {
      const filtered = prev.filter((x) => x.id !== entry.id);
      return [...filtered, entry];
    });
  }, []);

  const applyInitialClinicalProfile = useCallback(
    (
      patientId: string,
      primaryBodyArea: BodyArea,
      libraryExerciseIds: string[],
      extras?: InitialClinicalProfileExtras
    ) => {
      const lib = EXERCISE_LIBRARY.filter((e) => libraryExerciseIds.includes(e.id));
      const addedAt = new Date().toISOString();
      const newExercises: PatientExercise[] = lib.map((exercise, i) => ({
        ...exercise,
        id: `${patientId}-${exercise.id}-${addedAt}-${i}`,
        patientSets: exercise.sets,
        patientReps: exercise.reps ?? 0,
        addedAt,
        isOptional: false,
      }));

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const name = extras?.displayName?.trim() ? extras.displayName.trim() : p.name;
          const therapistNotes = extras?.intakeStory?.trim()
            ? extras.intakeStory.trim()
            : p.therapistNotes;
          const diagnosisFromAi = extras?.clinicalDiagnosis?.trim();
          const diagnosis =
            diagnosisFromAi && diagnosisFromAi.length > 0
              ? diagnosisFromAi
              : `מוקד טיפול: ${bodyAreaLabels[primaryBodyArea]}`;
          const geminiClinicalNarrative = extras?.geminiClinicalNarrative?.trim()
            ? extras.geminiClinicalNarrative.trim()
            : undefined;
          const injury =
            extras?.injuryHighlightSegments !== undefined
              ? [...extras.injuryHighlightSegments]
              : p.injuryHighlightSegments;
          const secondary =
            extras?.secondaryClinicalBodyAreas !== undefined
              ? [...extras.secondaryClinicalBodyAreas]
              : p.secondaryClinicalBodyAreas;
          const archive: PatientIntakeArchive | undefined = p.initialIntakeArchive
            ? p.initialIntakeArchive
            : {
                capturedAt: addedAt,
                primaryBodyArea,
                libraryExerciseIds: [...libraryExerciseIds],
                diagnosis,
                therapistNotes,
                ...(geminiClinicalNarrative != null ? { geminiClinicalNarrative } : {}),
                ...(extras?.displayName?.trim()
                  ? { displayName: extras.displayName.trim() }
                  : {}),
                extras: {
                  ...(extras?.displayName?.trim()
                    ? { displayName: extras.displayName.trim() }
                    : {}),
                  ...(extras?.intakeStory?.trim()
                    ? { intakeStory: extras.intakeStory.trim() }
                    : {}),
                  ...(extras?.injuryHighlightSegments
                    ? { injuryHighlightSegments: [...extras.injuryHighlightSegments] }
                    : {}),
                  ...(extras?.secondaryClinicalBodyAreas
                    ? {
                        secondaryClinicalBodyAreas: [...extras.secondaryClinicalBodyAreas],
                      }
                    : {}),
                  ...(extras?.clinicalDiagnosis?.trim()
                    ? { clinicalDiagnosis: extras.clinicalDiagnosis.trim() }
                    : {}),
                  ...(extras?.geminiClinicalNarrative?.trim()
                    ? { geminiClinicalNarrative: extras.geminiClinicalNarrative.trim() }
                    : {}),
                  ...(extras?.intakeRedFlag === true ? { intakeRedFlag: true } : {}),
                },
              };
          return {
            ...p,
            name,
            ...(extras?.displayName?.trim()
              ? { displayAlias: extras.displayName.trim() }
              : {}),
            primaryBodyArea,
            status: 'active',
            diagnosis,
            ...(geminiClinicalNarrative != null
              ? { geminiClinicalNarrative }
              : {}),
            therapistNotes,
            injuryHighlightSegments: injury,
            secondaryClinicalBodyAreas: secondary,
            hasRedFlag: p.hasRedFlag || !!extras?.intakeRedFlag,
            initialIntakeArchive: archive,
          };
        })
      );
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [...rest, { patientId, exercises: newExercises }];
      });
    },
    []
  );

  const createPatientWithAccess = useCallback(
    async (
      displayName: string,
      access: { portalUsername: string; password?: string }
    ): Promise<
      | { ok: true; loginId: string; password: string; patientId: string }
      | { ok: false; message: string }
    > => {
      const normalized = normalizePortalUsername(access.portalUsername);
      if (!isValidPortalUsername(normalized)) {
        return {
          ok: false,
          message: 'נא מזהה פורטל: 2–32 תווים (אנגלית ומספרים), לדוגמה JD.',
        };
      }
      if (allPatients.some((p) => normalizePortalUsername(p.portalUsername ?? '') === normalized)) {
        return { ok: false, message: 'מזהה הפורטל כבר בשימוש. בחרו רמז אחר (למשל JD2).' };
      }
      const snap = loadAuthSnapshot();
      if (snap.patientAccounts[normalized]) {
        return { ok: false, message: 'מזהה הפורטל תפוס בחשבון קיים.' };
      }

      let ownerTid = '';
      if (supabaseClient && isSupabaseAuthEnabled()) {
        const { data: gu } = await supabaseClient.auth.getUser();
        if (gu.user?.id) ownerTid = gu.user.id;
      } else if (therapistScopeIds?.length) {
        ownerTid = therapistScopeIds[0];
      }
      const name = displayName.trim() || 'מטופל חדש';
      const patientId = `patient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const password =
        access.password?.trim() && access.password.trim().length >= 6
          ? access.password.trim()
          : randomPatientPassword();

      const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
      if (isSupabaseAuthEnabled() && url && anonKey) {
        const su = await signUpPortalPatientOnCreate({
          url,
          anonKey,
          portalUsername: normalized,
          password,
          patientId,
        });
        if (!su.ok) {
          return { ok: false, message: su.message };
        }
      }

      const joinDate = new Date().toISOString().slice(0, 10);
      const newPatient: Patient = {
        id: patientId,
        therapistId: ownerTid,
        portalUsername: normalized,
        displayAlias: name !== 'מטופל חדש' ? name : undefined,
        name,
        age: 30,
        diagnosis: 'חדש — עדכנו אבחון ואזור גוף',
        primaryBodyArea: 'back_lower',
        status: 'pending',
        level: 1,
        xp: 0,
        xpForNextLevel: xpRequiredToReachNextLevel(1),
        currentStreak: 0,
        longestStreak: 0,
        joinDate,
        lastSessionDate: joinDate,
        pendingMessages: 0,
        hasRedFlag: false,
        redFlagActive: false,
        therapistNotes: '',
        coins: 0,
        clinicalTimeline: [],
        injuryHighlightSegments: [],
        secondaryClinicalBodyAreas: [],
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
      if (!isSupabaseAuthEnabled()) {
        addPatientAccount(normalized, patientId, password, ownerTid, { mustChangePassword: true });
      }
      setSelectedPatientId(patientId);
      setActiveSection('overview');
      return { ok: true, loginId: normalized, password, patientId };
    },
    [allPatients, therapistScopeIds]
  );

  const applyIntakeExercisePlan = useCallback(
    (patientId: string, exercises: Exercise[], primaryBodyArea: BodyArea) => {
      const addedAt = new Date().toISOString();
      const newExercises: PatientExercise[] = exercises.map((exercise, i) => ({
        ...exercise,
        id: `${patientId}-intake-${exercise.id}-${addedAt}-${i}`,
        patientSets: exercise.sets,
        patientReps: exercise.reps ?? 0,
        addedAt,
        isOptional: exercise.isOptional === true,
      }));
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [...rest, { patientId, exercises: newExercises }];
      });
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? {
                ...p,
                primaryBodyArea,
                status: p.status === 'pending' ? 'active' : p.status,
              }
            : p
        )
      );
    },
    []
  );

  const getSelfCareZones = useCallback(
    (patientId: string) => {
      const patient = allPatients.find((p) => p.id === patientId);
      const raw = selfCareZonesByPatientId[patientId] ?? [];
      if (!patient) return raw.filter(Boolean);
      const sec = patient.secondaryClinicalBodyAreas ?? [];
      return raw.filter(
        (a) => a && !bodyAreaBlocksSelfCare(a, patient.primaryBodyArea, sec)
      );
    },
    [allPatients, selfCareZonesByPatientId]
  );

  const toggleSelfCareZone = useCallback(
    (patientId: string, area: BodyArea) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (
        !patient ||
        bodyAreaBlocksSelfCare(area, patient.primaryBodyArea, patient.secondaryClinicalBodyAreas ?? [])
      ) {
        return;
      }
      setSelfCareZonesByPatientId((prev) => {
        const cur = prev[patientId] ?? [];
        const has = cur.includes(area);
        const next = has ? cur.filter((a) => a !== area) : [...cur, area];
        return { ...prev, [patientId]: next };
      });
    },
    [allPatients]
  );

  const logSelfCareSession = useCallback(
    (
      patientId: string,
      exerciseId: string,
      exerciseName: string,
      effortRating: 1 | 2 | 3 | 4 | 5
    ) => {
      const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const report: SelfCareSessionReport = {
        id,
        patientId,
        clinicalDate: clinicalToday,
        exerciseId,
        exerciseName,
        effortRating,
        loggedAt: new Date().toISOString(),
      };
      setSelfCareReportsByPatientId((prev) => ({
        ...prev,
        [patientId]: [...(prev[patientId] ?? []), report],
      }));
    },
    [clinicalToday]
  );

  const getSelfCareReportsForPatient = useCallback(
    (patientId: string) =>
      [...(selfCareReportsByPatientId[patientId] ?? [])].sort((a, b) =>
        b.loggedAt.localeCompare(a.loggedAt)
      ),
    [selfCareReportsByPatientId]
  );

  const getSelfCareReportsForClinicalDay = useCallback(
    (patientId: string, clinicalDate: string) =>
      (selfCareReportsByPatientId[patientId] ?? []).filter((r) => r.clinicalDate === clinicalDate),
    [selfCareReportsByPatientId]
  );

  const appendPatientExerciseFinishReport = useCallback(
    (
      patientId: string,
      entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
    ) => {
      const full: PatientExerciseFinishReport = {
        ...entry,
        id: `fin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        patientId,
        timestamp: new Date().toISOString(),
      };
      sendDataToTherapist(full);
      setPatientExerciseFinishReportsByPatientId((prev) => ({
        ...prev,
        [patientId]: [...(prev[patientId] ?? []), full],
      }));
    },
    []
  );

  const getPatientExerciseFinishReports = useCallback(
    (patientId: string) =>
      [...(patientExerciseFinishReportsByPatientId[patientId] ?? [])].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      ),
    [patientExerciseFinishReportsByPatientId]
  );

  const getSelfCareStrengthTier = useCallback(
    (patientId: string, area: BodyArea): 0 | 1 | 2 => {
      const t = selfCareStrengthTierByPatientId[patientId]?.[area];
      return t === 1 || t === 2 ? t : 0;
    },
    [selfCareStrengthTierByPatientId]
  );

  const setSelfCareStrengthTier = useCallback(
    (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => {
      setSelfCareStrengthTierByPatientId((prev) => ({
        ...prev,
        [patientId]: { ...(prev[patientId] ?? {}), [area]: tier },
      }));
    },
    []
  );

  const resetPatientExercisePlan = useCallback((patientId: string) => {
    setExercisePlans((prev) =>
      prev.some((ep) => ep.patientId === patientId)
        ? prev.map((ep) => (ep.patientId === patientId ? { ...ep, exercises: [] } : ep))
        : [...prev, { patientId, exercises: [] }]
    );
  }, []);

  const devMockSevenDayExerciseHistory = useCallback(
    (patientId: string) => {
      if (!canPilot11DebugMutatePatient(allPatients, patientId)) return;
      const plan = pickCanonicalExercisePlan(exercisePlans, patientId);
      const exId =
        plan?.exercises[0]?.id ??
        `${patientId}-dev-mock-${Math.random().toString(36).slice(2, 8)}`;
      const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addClinicalDays(clinicalToday, -i));
      const totalPlanned = Math.max(1, plan?.exercises.length ?? 1);

      setDailySessions((prev) => {
        const without = prev.filter(
          (s) => !(s.patientId === patientId && dates.includes(s.date))
        );
        const additions: DailySession[] = dates.map((date) => ({
          patientId,
          date,
          completedIds: [exId],
          sessionXp: 80,
        }));
        return [...without, ...additions];
      });

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const without = p.analytics.sessionHistory.filter((s) => !dates.includes(s.date));
          const rows: ExerciseSession[] = dates.map((date) => ({
            date,
            exercisesCompleted: totalPlanned,
            totalExercises: totalPlanned,
            difficultyRating: 3,
            xpEarned: 80,
          }));
          const sessionHistory = [...without, ...rows].sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          return {
            ...p,
            lastSessionDate: clinicalToday,
            analytics: {
              ...p.analytics,
              sessionHistory,
              totalSessions: sessionHistory.length,
            },
          };
        })
      );
    },
    [clinicalToday, exercisePlans, allPatients]
  );

  return {
    getExercisePlan,
    addExerciseToPlan,
    removeExerciseFromPlan,
    updateExerciseInPlan,
    getTodaySession,
    toggleExercise,
    submitExerciseReport,
    getPendingAiSuggestions,
    getAwaitingTherapistSuggestions,
    getTotalAwaitingTherapistCount,
    patientAgreeToAiSuggestion,
    patientDeclineAiSuggestion,
    therapistApproveAiSuggestion,
    therapistDeclineAiSuggestion,
    submitGuardianRepsIncreaseRequest,
    submitPatientAiPlanAdjustmentRequest,
    applyInitialClinicalProfile,
    createPatientWithAccess,
    applyIntakeExercisePlan,
    getSelfCareZones,
    toggleSelfCareZone,
    logSelfCareSession,
    getSelfCareReportsForPatient,
    getSelfCareReportsForClinicalDay,
    appendPatientExerciseFinishReport,
    getPatientExerciseFinishReports,
    getSelfCareStrengthTier,
    setSelfCareStrengthTier,
    resetPatientExercisePlan,
    devMockSevenDayExerciseHistory,
  };
}
