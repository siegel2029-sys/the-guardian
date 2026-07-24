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
import { getTherapistAlertEmail, openClinicalMailto } from '../utils/clinicalAlertEmail';
import { medicalHistoryToProfileMetadata } from '../utils/clinicalIntakeTemplate';
import { normalizeClinicalIntakeProfileForStorage } from '../utils/clinicalIntakeProfilePersist';
import {
  normalizeEditableIntakeFields,
  type ClinicalIntakeEditableFields,
} from '../utils/clinicalIntakeEditableFields';
import { resolveIntakeVersionTimeline } from '../utils/clinicalIntakeVersions';
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
import { addPatientAccount } from '../context/authPersistence';
import {
  isSupabaseAuthEnabled,
  signUpPortalPatientOnCreate,
  normalizePortalUsername,
  isValidPortalUsername,
} from '../lib/patientPortalAuth';
import { mergeSessionCompletionByDateMaps, upsertPatientRecords, fetchActiveExercisePlanForPatient } from '../services/clinicalService';
import {
  upsertDailySessionRowMerged,
  persistPatientFinishReportToCloud,
} from '../services/exerciseService';
import { logSupabaseCallError } from '../lib/supabaseSessionGuard';
import { devError, devLog, redactId } from '../lib/safeLog';
import { defaultPatientGear, type PatientGearState } from '../context/patientGearUtils';
import { buildEmptySession, clampPain, clampEffort } from '../context/patientDomainHelpers';
import {
  MAX_EFFORT_ALERT_THRESHOLD,
  SAFETY_EFFORT_THRESHOLD,
} from '../utils/effortScale';
import {
  exercisePlanFromPatientCache,
  normalizeCachedPatientExercises,
  pickCanonicalExercisePlan,
} from '../utils/exercisePlanCanonical';
import { canPilot11DebugMutatePatient } from '../utils/pilot11GamificationDebug';
import { validateNewPassword } from '../lib/passwordPolicy';
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
  /** Persist patient payload after exercise (portal). */
  persistPatientPayloadToCloud?: (patient: Patient) => Promise<boolean>;
  onExerciseCloudSyncError?: (message: string) => void;
  getLatestPatient?: (patientId: string) => Patient | undefined;
  getLatestDailySession?: (patientId: string, date: string) => DailySession | undefined;
};

function randomPatientPassword(): string {
  // Must satisfy Supabase password policy: min 8 chars, letters + digits.
  const letters = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const chars = letters + digits;
  let s = letters[Math.floor(Math.random() * letters.length)];
  s += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
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
    clinicalTick: _clinicalTick,
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
    persistPatientPayloadToCloud,
    onExerciseCloudSyncError,
    getLatestPatient,
    getLatestDailySession,
  } = params;
  // ── Exercise plan CRUD ─────────────────────────────────────────
  const getExercisePlan = useCallback(
    (patientId: string) => {
      const fromPlans = pickCanonicalExercisePlan(exercisePlans, patientId);
      if (fromPlans && fromPlans.exercises.length > 0) {
        return {
          ...fromPlans,
          exercises: normalizeCachedPatientExercises(fromPlans.exercises),
        };
      }
      const patient =
        patients.find((p) => p.id === patientId) ??
        allPatients.find((p) => p.id === patientId);
      const fromCache = exercisePlanFromPatientCache(
        patientId,
        patient?._exercisePlanCache,
        {
          planRowId: fromPlans?.planRowId,
          versionNumber: fromPlans?.versionNumber,
          isActive: fromPlans?.isActive,
        }
      );
      if (fromCache) return fromCache;
      if (fromPlans) {
        return {
          ...fromPlans,
          exercises: normalizeCachedPatientExercises(fromPlans.exercises),
        };
      }
      return fromPlans;
    },
    [exercisePlans, patients, allPatients]
  );

  const replaceExercisePlanForPatient = useCallback(
    (patientId: string, exercises: PatientExercise[]) => {
      const normalized = normalizeCachedPatientExercises(exercises);
      setExercisePlans((prev) => {
        const existing = prev.find((ep) => ep.patientId === patientId);
        if (existing) {
          return prev.map((ep) =>
            ep.patientId === patientId ? { ...ep, exercises: normalized } : ep
          );
        }
        return [...prev, { patientId, exercises: normalized }];
      });
    },
    []
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
        Pick<
          PatientExercise,
          | 'patientReps'
          | 'patientSets'
          | 'patientWeightKg'
          | 'holdSeconds'
          | 'isOptional'
          | 'customInstructions'
          | 'instructions'
        >
      >
    ) => {
      setExercisePlans((prev) => {
        const slice = pickCanonicalExercisePlan(prev, patientId);
        if (slice && slice.exercises.length > 0) {
          return prev.map((ep) =>
            ep.patientId === patientId
              ? {
                  ...ep,
                  exercises: ep.exercises.map((e) =>
                    e.id === exerciseId ? { ...e, ...updates } : e
                  ),
                }
              : ep
          );
        }
        // No canonical slice (plan rendered from patients.payload._exercisePlanCache fallback):
        // seed it from the cache and apply the update, instead of silently dropping the edit.
        const patient =
          patients.find((p) => p.id === patientId) ??
          allPatients.find((p) => p.id === patientId);
        const seeded = exercisePlanFromPatientCache(patientId, patient?._exercisePlanCache, {
          planRowId: slice?.planRowId,
          versionNumber: slice?.versionNumber,
          isActive: slice?.isActive,
        });
        if (!seeded) return prev;
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [
          ...rest,
          {
            ...seeded,
            exercises: seeded.exercises.map((e) =>
              e.id === exerciseId ? { ...e, ...updates } : e
            ),
          },
        ];
      });
    },
    [patients, allPatients]
  );

  // ── Daily sessions ─────────────────────────────────────────────
  const getTodaySession = useCallback(
    (patientId: string): DailySession => {
      const cd = clinicalToday || getClinicalDate();
      return (
        dailySessions.find((s) => s.patientId === patientId && s.date === cd) ??
        buildEmptySession(patientId, cd)
      );
    },
    [dailySessions, clinicalToday]
  );

  const toggleExercise = useCallback(
    (patientId: string, exerciseId: string, xpReward: number) => {
      const cd = clinicalToday || getClinicalDate();
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
    [clinicalToday, setDailySessions]
  );

  const submitExerciseReport = useCallback(
    async (
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
        /** Supabase exercise_plans.id — sent to complete_exercise_safe when is_active row is missing */
        planRowId?: string;
        /** Portal uses patients.payload._exercisePlanCache when exercise_plans has no row */
        isManualPlan?: boolean;
      }
    ): Promise<boolean> => {
      const clinicalDay = clinicalToday || getClinicalDate();
      const prior = dailySessions.find((s) => s.patientId === patientId && s.date === clinicalDay);
      const wasRepeatCompletion = prior?.completedIds.includes(exerciseId) ?? false;

      const patientBefore = allPatients.find((x) => x.id === patientId);
      if (!patientBefore) return false;

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

        setAllPatients((prev) =>
          prev.map((p) => {
            if (p.id !== patientId) return p;

            // Clinical safety: red flag on elevated pain or reported exertion (1–10 RPE)
            const triggersClinicalAlert = pain >= 6 || effort >= SAFETY_EFFORT_THRESHOLD;
            const alertReasons: string[] = [];
            if (pain >= 6) alertReasons.push(`כאב ${pain}/10`);
            if (effort >= SAFETY_EFFORT_THRESHOLD) alertReasons.push(`מאמץ ${effort}/10`);

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
                  effortScale: 10,
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
                        effortScale: 10,
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
                        effortScale: 10,
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
            // TODO: Refactor Streaks/Gamification — migrate streak tracking to last_workout_at TIMESTAMPTZ instead of payload.lastSessionDate.
            lastSessionDate = clinicalDay;

            const totalSessions = newDaySessionRow
              ? p.analytics.totalSessions + 1
              : p.analytics.totalSessions;

            const leveled = applyXpCoinsLevelUp(p, xpGain, coinsGain);

            const prevDs = dailySessions.find(
              (s) => s.patientId === patientId && s.date === clinicalDay
            );
            const nextCompletedIds = prevDs
              ? prevDs.completedIds.includes(exerciseId)
                ? prevDs.completedIds
                : [...prevDs.completedIds, exerciseId]
              : [exerciseId];
            const nextDaySessionXp = (prevDs?.sessionXp ?? 0) + xpGain;

            const activityNowIso = new Date().toISOString();

            return {
              ...leveled,
              hasRedFlag: p.hasRedFlag || triggersClinicalAlert,
              redFlagActive: p.redFlagActive || (pain >= 7 && sessionZone === p.primaryBodyArea),
              lastSessionDate,
              lastWorkoutAt: activityNowIso,
              currentStreak,
              longestStreak,
              _sessionCompletionByDate: mergeSessionCompletionByDateMaps(p._sessionCompletionByDate, {
                [clinicalDay]: {
                  completedIds: nextCompletedIds,
                  sessionXp: nextDaySessionXp,
                },
              }),
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
      });

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
          `קושי דווח: ${effort}/10\n` +
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
      if (effort >= MAX_EFFORT_ALERT_THRESHOLD) {
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-eff-${Date.now()}`,
            patientId,
            reasonCode: 'DIFFICULTY_MAX',
            reasonHebrew: 'מאמץ מקסימלי בתרגיל (10/10)',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `דיווח לאחר תרגיל: קושי מאמץ ${effort}/10.\nמומלץ להפחית חזרות או סטים עד עדכון ממטפל.\nטקסט שהומלץ למטופל:\n${DIFFICULTY_MAX_PATIENT_COPY}`,
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
                  'דיווח מאמץ 10/10 — הצעה אוטומטית להפחתת חזרות; אשרו או התאימו ידנית.',
                createdAt: new Date().toISOString(),
                status: 'awaiting_therapist',
                source: 'system',
              },
            ]);
          }
        }
      }

      if (supabaseClient && patientPortalPatientId && patientId === patientPortalPatientId) {
        try {
          if (options?.completionSource === 'rehab' && rehabEx) {
            let resolvedPlanRowId = options?.planRowId ?? plan?.planRowId ?? null;
            if (!resolvedPlanRowId && supabaseClient) {
              const freshPlan = await fetchActiveExercisePlanForPatient(supabaseClient, patientId);
              if (freshPlan.ok && freshPlan.data?.planRowId) {
                resolvedPlanRowId = freshPlan.data.planRowId;
              }
            }

            const cacheFromPatient = patientBefore._exercisePlanCache;
            const exerciseInCache =
              Array.isArray(cacheFromPatient) &&
              cacheFromPatient.some((e) => e.id === exerciseId);
            const isManualPlan =
              !resolvedPlanRowId &&
              (options?.isManualPlan === true ||
                exerciseInCache ||
                (plan?.exercises.some((e) => e.id === exerciseId) ?? false));

            const rpcSessionData: Record<string, unknown> = {
              pain_level: pain,
              effort_rating: effort,
              clinical_date: clinicalDay,
              optional_pool_no_reward: options?.optionalPoolNoReward ?? false,
              session_body_area: options?.sessionBodyArea ?? null,
              plan_row_id: resolvedPlanRowId,
              patient_id: patientId,
            };
            if (isManualPlan) {
              rpcSessionData.is_manual_plan = true;
            }

            if (import.meta.env.DEV) {
              console.log('[complete_exercise_safe] Payload being sent to server:', {
                p_exercise_id: exerciseId,
                p_session_data: rpcSessionData,
                planRowIdFromOptions: options?.planRowId ?? null,
                planRowIdFromLocalPlan: plan?.planRowId ?? null,
                resolvedPlanRowId,
                isManualPlan,
                exerciseInCache,
              });
            }

            const rpc = await completeExerciseSafe(supabaseClient, exerciseId, rpcSessionData);
            if (!rpc.ok) {
              const detail = rpc.message ?? rpc.reason ?? 'complete_exercise_safe';
              console.error('EXERCISE_SAVE_FAIL_REASON', {
                scope: 'submitExerciseReport/complete_exercise_safe',
                reason: rpc.reason,
                message: rpc.message,
                exerciseIdPresent: Boolean(exerciseId),
                patientIdPresent: Boolean(patientId),
                planRowIdPresent: Boolean(resolvedPlanRowId),
              });
              onExerciseCloudSyncError?.(
                `לא נשמרה השלמת התרגיל בשרת. נסו שוב או פנו למטפל.\n\n${detail}`
              );
              return false;
            }
          }

          await new Promise<void>((resolve) => {
            queueMicrotask(() => resolve());
          });

          let latestSession = getLatestDailySession?.(patientId, clinicalDay);
          if (!latestSession) {
            const ids = prior?.completedIds ?? [];
            latestSession = {
              patientId,
              date: clinicalDay,
              completedIds: wasRepeatCompletion
                ? ids
                : ids.includes(exerciseId)
                  ? ids
                  : [...ids, exerciseId],
              sessionXp: (prior?.sessionXp ?? 0) + xpGain,
            };
          } else if (!wasRepeatCompletion && !latestSession.completedIds.includes(exerciseId)) {
            latestSession = {
              ...latestSession,
              completedIds: [...latestSession.completedIds, exerciseId],
              sessionXp: latestSession.sessionXp + xpGain,
            };
          }

          const sRes = await upsertDailySessionRowMerged(supabaseClient, latestSession, {
            therapistId: patientBefore.therapistId,
          });
          if (!sRes.ok) {
            console.error('EXERCISE_SAVE_FAIL_REASON', {
              scope: 'submitExerciseReport/session_history',
              message: sRes.message,
              patientIdPresent: Boolean(patientId),
              clinicalDay,
            });
            onExerciseCloudSyncError?.(`שמירת סשן יומי נכשלה: ${sRes.message}`);
            return false;
          }

          const latestPatient = getLatestPatient?.(patientId);
          if (latestPatient && persistPatientPayloadToCloud) {
            const saved = await persistPatientPayloadToCloud(latestPatient);
            if (!saved) {
              console.error('EXERCISE_SAVE_FAIL_REASON', {
                scope: 'submitExerciseReport/persistPatientPayloadToCloud',
                message: 'persistPatientPayloadToCloud returned false',
                patientIdPresent: Boolean(patientId),
                latestPatientIdPresent: Boolean(latestPatient.id),
              });
              onExerciseCloudSyncError?.(
                'התקדמותכם (נקודות ומטבעות) לא נשמרה לענן. בדקו חיבור או התחברו מחדש.'
              );
              return false;
            }
          }
        } catch (e) {
          console.error('EXERCISE_SAVE_FAIL_REASON', e);
          devError('[SYNC_ERROR] submitExerciseReport/portalCloud', {
            patientRef: redactId(patientId),
            exerciseRef: redactId(exerciseId),
            clinicalDay,
            message: e instanceof Error ? e.message : String(e),
          });
          logSupabaseCallError('submitExerciseReport/portalCloud', e, {
            patientId,
            exerciseId,
            clinicalDay,
          });
          onExerciseCloudSyncError?.(
            e instanceof Error
              ? `שגיאת סנכרון לענן: ${e.message}`
              : 'שגיאת סנכרון לענן — בדקו חיבור או התחברו מחדש.'
          );
          return false;
        }
      }

      return true;
    },
    [
      exercisePlans,
      dailySessions,
      sendAiClinicalAlert,
      clinicalToday,
      allPatients,
      pushRewardFeedback,
      patientGearByPatientId,
      setExerciseSafetyLockedPatientIds,
      supabaseClient,
      patientPortalPatientId,
      persistPatientPayloadToCloud,
      onExerciseCloudSyncError,
      getLatestPatient,
      getLatestDailySession,
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
      const found = aiSuggestions.find((s) => s.id === suggestionId);
      if (!found || found.status !== 'awaiting_therapist') return null;

      const updates: Partial<
        Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg' | 'holdSeconds'>
      > =
        found.field === 'reps'
          ? { patientReps: found.suggestedValue }
          : found.field === 'sets'
            ? { patientSets: found.suggestedValue }
            : found.field === 'holdSeconds'
              ? { holdSeconds: found.suggestedValue }
              : { patientWeightKg: found.suggestedValue };

      updateExerciseInPlan(found.patientId, found.exerciseId, updates);
      return { suggestion: found, appliedPlanUpdates: updates };
    },
    [aiSuggestions, updateExerciseInPlan]
  );

  const therapistDeclineAiSuggestion = useCallback(
    (suggestionId: string) => {
      const found = aiSuggestions.find((s) => s.id === suggestionId);
      if (!found || found.status !== 'awaiting_therapist') return null;
      return found;
    },
    [aiSuggestions]
  );

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

          const clinicalIntakeProfile = normalizeClinicalIntakeProfileForStorage(
            extras?.clinicalIntakeProfile
          );

          const medicalProfileMetadata =
            medicalHistoryToProfileMetadata(clinicalIntakeProfile?.medical_history) ??
            (extras?.medicalProfileMetadata &&
            (extras.medicalProfileMetadata.backgroundDiseases?.trim() ||
              extras.medicalProfileMetadata.chronicMedications?.trim())
              ? {
                  ...(extras.medicalProfileMetadata.backgroundDiseases?.trim()
                    ? {
                        backgroundDiseases:
                          extras.medicalProfileMetadata.backgroundDiseases.trim(),
                      }
                    : {}),
                  ...(extras.medicalProfileMetadata.chronicMedications?.trim()
                    ? {
                        chronicMedications:
                          extras.medicalProfileMetadata.chronicMedications.trim(),
                      }
                    : {}),
                }
              : undefined);
          const injury =
            extras?.injuryHighlightSegments !== undefined
              ? [...extras.injuryHighlightSegments]
              : p.injuryHighlightSegments;
          const secondary =
            extras?.secondaryClinicalBodyAreas !== undefined
              ? [...extras.secondaryClinicalBodyAreas]
              : p.secondaryClinicalBodyAreas;
          const archiveExtras = {
            ...p.initialIntakeArchive?.extras,
            ...(clinicalIntakeProfile ? { clinicalIntakeProfile } : {}),
            ...(medicalProfileMetadata ? { medicalProfileMetadata } : {}),
            ...(extras?.clinicalReasoningHe?.length
              ? { clinicalReasoningHe: [...extras.clinicalReasoningHe] }
              : {}),
            ...(extras?.clinicalIntakeAiInsights
              ? { clinicalIntakeAiInsights: { ...extras.clinicalIntakeAiInsights } }
              : {}),
            ...(extras?.intakeVasScore != null && Number.isFinite(extras.intakeVasScore)
              ? { intakeVasScore: extras.intakeVasScore }
              : {}),
          };
          const archive: PatientIntakeArchive | undefined = p.initialIntakeArchive
            ? {
                ...p.initialIntakeArchive,
                extras:
                  Object.keys(archiveExtras).length > 0 ? archiveExtras : p.initialIntakeArchive.extras,
              }
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
                  ...(clinicalIntakeProfile ? { clinicalIntakeProfile } : {}),
                  ...(medicalProfileMetadata ? { medicalProfileMetadata } : {}),
                  ...(extras?.clinicalReasoningHe?.length
                    ? { clinicalReasoningHe: [...extras.clinicalReasoningHe] }
                    : {}),
                  ...(extras?.clinicalIntakeAiInsights
                    ? { clinicalIntakeAiInsights: { ...extras.clinicalIntakeAiInsights } }
                    : {}),
                  ...(extras?.intakeVasScore != null && Number.isFinite(extras.intakeVasScore)
                    ? { intakeVasScore: extras.intakeVasScore }
                    : {}),
                },
              };
          const patientCore = {
            ...p,
            name,
            ...(extras?.displayName?.trim()
              ? { displayAlias: extras.displayName.trim() }
              : {}),
            primaryBodyArea,
            status: 'active' as const,
            diagnosis,
            ...(geminiClinicalNarrative != null
              ? { geminiClinicalNarrative }
              : {}),
            ...(clinicalIntakeProfile ? { clinicalIntakeProfile } : {}),
            ...(medicalProfileMetadata ? { medicalProfileMetadata } : {}),
            ...(extras?.clinicalReasoningHe?.length
              ? { clinicalReasoningHe: [...extras.clinicalReasoningHe] }
              : {}),
            ...(extras?.clinicalIntakeAiInsights
              ? { clinicalIntakeAiInsights: { ...extras.clinicalIntakeAiInsights } }
              : {}),
            ...(extras?.intakeVasScore != null && Number.isFinite(extras.intakeVasScore)
              ? { intakeVasScore: extras.intakeVasScore }
              : {}),
            ...(extras?.intakeStory?.trim()
              ? { intakeStory: extras.intakeStory.trim() }
              : {}),
            therapistNotes,
            injuryHighlightSegments: injury,
            secondaryClinicalBodyAreas: secondary,
            hasRedFlag: p.hasRedFlag || !!extras?.intakeRedFlag,
            initialIntakeArchive: archive,
            intakeStatus: 'complete' as const,
          };

          const hasProtocolFields =
            extras?.treatmentProtocol !== undefined ||
            Boolean(extras?.prognosisHypothesis?.trim()) ||
            (extras?.protocolTrackingState?.length ?? 0) > 0;

          if (!hasProtocolFields) {
            return patientCore;
          }

          const timeline = resolveIntakeVersionTimeline(patientCore);
          const initialIdx = timeline.findIndex((v) => v.immutable || v.kind === 'initial');
          const targetIdx = initialIdx >= 0 ? initialIdx : 0;
          const nextTimeline = [...timeline];
          nextTimeline[targetIdx] = {
            ...nextTimeline[targetIdx],
            fields: normalizeEditableIntakeFields({
              ...(nextTimeline[targetIdx].fields as Partial<ClinicalIntakeEditableFields>),
              ...(extras?.treatmentProtocol !== undefined
                ? { treatmentProtocol: extras.treatmentProtocol }
                : {}),
              ...(extras?.prognosisHypothesis?.trim()
                ? { prognosisHypothesis: extras.prognosisHypothesis.trim() }
                : {}),
              ...(extras?.protocolTrackingState?.length
                ? { protocolTrackingState: extras.protocolTrackingState }
                : {}),
            }),
          };

          return {
            ...patientCore,
            intakeVersionTimeline: nextTimeline,
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
      // Local-state and localStorage duplicate checks removed — the server (Supabase Auth) is the
      // authoritative source of truth. Local caches may be stale after deleting patients.

      let ownerTid = '';
      if (supabaseClient && isSupabaseAuthEnabled()) {
        const { data: gu } = await supabaseClient.auth.getUser();
        if (gu.user?.id) ownerTid = gu.user.id;
      } else if (therapistScopeIds?.length) {
        ownerTid = therapistScopeIds[0];
      }
      const name = displayName.trim() || 'מטופל חדש';
      const patientId = `patient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const trimmedAccessPassword = access.password?.trim() ?? '';
      if (trimmedAccessPassword.length > 0) {
        const passwordPolicyError = validateNewPassword(trimmedAccessPassword);
        if (passwordPolicyError) {
          return { ok: false, message: passwordPolicyError };
        }
      }
      const password =
        trimmedAccessPassword.length > 0 ? trimmedAccessPassword : randomPatientPassword();

      const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

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
        // Account/credentials exist at create time — status is active regardless of intake.
        status: 'active',
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
        intakeStatus: 'pending',
        analytics: {
          averageOverallPain: 0,
          painByArea: {},
          averageDifficulty: 0,
          totalSessions: 0,
          painHistory: [],
          sessionHistory: [],
        },
      };

      // Insert patients row BEFORE Auth signup so before-user-created + app_metadata
      // promotion can validate the clinic invite (patient_id) against a real row.
      if (isSupabaseAuthEnabled() && supabaseClient) {
        const upsertResult = await upsertPatientRecords(
          supabaseClient,
          [newPatient],
          new Date().toISOString()
        );
        if (!upsertResult.ok) {
          devError('[createPatientWithAccess] Failed to insert patient into DB', {
            message: upsertResult.message,
          });
          return { ok: false, message: `שגיאה בשמירת המטופל: ${upsertResult.message}` };
        }
      }

      // authUserId is the Supabase Auth UUID for the new portal account.
      // Written to patients.auth_user_id after signup so the patient can access data
      // without waiting for their first login.
      let newAuthUserId = '';
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
        newAuthUserId = su.authUserId;
        if (newAuthUserId && supabaseClient) {
          const linkResult = await upsertPatientRecords(
            supabaseClient,
            [newPatient],
            new Date().toISOString(),
            { authUserId: newAuthUserId }
          );
          if (!linkResult.ok) {
            devError('[createPatientWithAccess] Failed to link auth_user_id', {
              message: linkResult.message,
            });
            return { ok: false, message: `שגיאה בקישור חשבון הפורטל: ${linkResult.message}` };
          }
        }
        devLog('[createPatientWithAccess] Patient row created', {
          patientRef: redactId(patientId),
          authLinked: Boolean(newAuthUserId),
        });
      }

      setAllPatients((prev) => [...prev, newPatient]);
      setExercisePlans((prev) => [...prev, { patientId, exercises: [] }]);
      if (!isSupabaseAuthEnabled()) {
        addPatientAccount(normalized, patientId, password, ownerTid, { mustChangePassword: true });
      }
      setSelectedPatientId(patientId);
      setActiveSection('overview');
      return { ok: true, loginId: normalized, password, patientId };
    },
    [allPatients, therapistScopeIds, supabaseClient]
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
      const inj = patient.injuryHighlightSegments ?? [];
      return raw.filter((a) => a && !bodyAreaBlocksSelfCare(a, inj, sec));
    },
    [allPatients, selfCareZonesByPatientId]
  );

  const toggleSelfCareZone = useCallback(
    (patientId: string, area: BodyArea) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return;
      const inj = patient.injuryHighlightSegments ?? [];
      if (bodyAreaBlocksSelfCare(area, inj, patient.secondaryClinicalBodyAreas ?? [])) {
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
      effortRating: number
    ) => {
      const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const report: SelfCareSessionReport = {
        id,
        patientId,
        clinicalDate: clinicalToday,
        exerciseId,
        exerciseName,
        effortRating: clampEffort(effortRating),
        effortScale: 10,
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
    async (
      patientId: string,
      entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
    ): Promise<void> => {
      const full: PatientExerciseFinishReport = {
        ...entry,
        id: `fin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        patientId,
        timestamp: new Date().toISOString(),
      };

      const applyLocalAppend = () => {
        setPatientExerciseFinishReportsByPatientId((prev) => ({
          ...prev,
          [patientId]: [...(prev[patientId] ?? []), full],
        }));
        setDailySessions((prev) => {
          const idx = prev.findIndex(
            (s) => s.patientId === patientId && s.date === clinicalToday
          );
          if (idx < 0) {
            return [
              ...prev,
              {
                patientId,
                date: clinicalToday,
                completedIds: [full.exerciseId],
                sessionXp: 0,
              },
            ];
          }
          const s = prev[idx];
          if (s.completedIds.includes(full.exerciseId)) return prev;
          const next = [...prev];
          next[idx] = { ...s, completedIds: [...s.completedIds, full.exerciseId] };
          return next;
        });
        setAllPatients((prev) =>
          prev.map((p) => {
            if (p.id !== patientId) return p;
            const prevDay = p._sessionCompletionByDate?.[clinicalToday];
            const ids = new Set([...(prevDay?.completedIds ?? []), full.exerciseId]);
            return {
              ...p,
              _sessionCompletionByDate: mergeSessionCompletionByDateMaps(p._sessionCompletionByDate, {
                [clinicalToday]: {
                  completedIds: [...ids],
                  sessionXp: prevDay?.sessionXp ?? 0,
                },
              }),
            };
          })
        );
      };

      if (supabaseClient && patientPortalPatientId && patientId === patientPortalPatientId) {
        try {
          const pRow = allPatients.find((x) => x.id === patientId);
          const r = await persistPatientFinishReportToCloud(supabaseClient, full, {
            therapistId: pRow?.therapistId,
          });
          if (!r.ok) {
            onExerciseCloudSyncError?.(`דיווח הסיום לא נשמר לענן: ${r.message}`);
            // Still keep the report locally so effort/pain appear in history & charts
          }
        } catch (e) {
          devError('[SYNC_ERROR] appendPatientExerciseFinishReport', {
            patientRef: redactId(patientId),
            reportRef: redactId(full.id),
            message: e instanceof Error ? e.message : String(e),
          });
          logSupabaseCallError('appendPatientExerciseFinishReport', e, { patientId, reportId: full.id });
          onExerciseCloudSyncError?.(
            e instanceof Error
              ? `דיווח הסיום לא נשמר לענן: ${e.message}`
              : 'דיווח הסיום לא נשמר לענן.'
          );
          // Fall through to local append so UI still shows מאמץ / כאב
        }
      }

      applyLocalAppend();
    },
    [
      supabaseClient,
      patientPortalPatientId,
      onExerciseCloudSyncError,
      clinicalToday,
      setDailySessions,
      setAllPatients,
      allPatients,
    ]
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
    replaceExercisePlanForPatient,
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
