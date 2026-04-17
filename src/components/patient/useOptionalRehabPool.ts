import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { BodyArea, PatientExercise, DailySession } from '../../types';
import type { StrengthExerciseLevelDef } from '../../data/strengthExerciseDatabase';
import type { GuardiTransientAppearance } from './GordyCompanion';
import {
  buildOptionalPool,
  computeOptionalCompletionsByAreaFromSession,
  countOptionalPoolCompletionsInSession,
  getNextOptionalPoolItem,
  getOptionalPoolExerciseId,
  getVisibleOptionalPoolItems,
} from '../../utils/optionalExerciseUnlock';

/** המתנה קצרה אחרי סיום תרגיל בחירה לפני הצגת הכרטיס הבא */
const OPTIONAL_REVEAL_MS = 300;

export type StrengthMissionRow = {
  kind: 'strength';
  area: BodyArea;
  exercise: StrengthExerciseLevelDef;
  strengthTier: 0 | 1 | 2;
};

export interface UseOptionalRehabPoolParams {
  optionalRehabExercises: PatientExercise[];
  strengthMissionRows: StrengthMissionRow[];
  completedIdsForUnlock: readonly string[];
  exercisesLocked: boolean;
  setGuardiTransient: Dispatch<SetStateAction<GuardiTransientAppearance | null>>;
  selectedPatientId: string | undefined;
  clinicalToday: string;
  dailySessions: DailySession[];
}

export interface UseOptionalRehabPoolResult {
  fullOptionalPool: ReturnType<typeof buildOptionalPool>;
  optionalPoolCompletionCount: number;
  optionalPoolRewardsAreZero: boolean;
  getNextOptionalAfterAddingId: (exerciseId: string) => ReturnType<typeof getNextOptionalPoolItem>;
  allOptionalPoolExerciseIdsDone: boolean;
  sessionNextOptionalPoolItem: ReturnType<typeof getVisibleOptionalPoolItems>[number] | null;
  optionalRevealHold: boolean;
  newlyUnlockedPoolKeys: Set<string>;
  optionalRehabDifficultyTiers: Record<string, 0 | 1 | 2>;
  setOptionalRehabDifficultyTiers: Dispatch<
    SetStateAction<Record<string, 0 | 1 | 2>>
  >;
  signalOptionalReveal: (hasNext: boolean) => void;
}

export function useOptionalRehabPool(
  params: UseOptionalRehabPoolParams
): UseOptionalRehabPoolResult {
  const {
    optionalRehabExercises,
    strengthMissionRows,
    completedIdsForUnlock,
    exercisesLocked,
    setGuardiTransient,
    selectedPatientId,
    clinicalToday,
    dailySessions,
  } = params;

  const [optionalRehabDifficultyTiers, setOptionalRehabDifficultyTiers] = useState<
    Record<string, 0 | 1 | 2>
  >({});

  useEffect(() => {
    setOptionalRehabDifficultyTiers({});
  }, [selectedPatientId]);

  const [newlyUnlockedPoolKeys, setNewlyUnlockedPoolKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [optionalRevealHold, setOptionalRevealHold] = useState(false);

  useEffect(() => {
    setNewlyUnlockedPoolKeys(new Set());
    setOptionalRevealHold(false);
  }, [selectedPatientId, clinicalToday]);

  const fullOptionalPool = useMemo(
    () => buildOptionalPool(optionalRehabExercises, strengthMissionRows),
    [optionalRehabExercises, strengthMissionRows]
  );

  const optionalCompletionsByArea = useMemo(
    () =>
      computeOptionalCompletionsByAreaFromSession(
        completedIdsForUnlock,
        optionalRehabExercises,
        strengthMissionRows
      ),
    [completedIdsForUnlock, optionalRehabExercises, strengthMissionRows]
  );

  const optionalPoolCompletionCount = useMemo(
    () => countOptionalPoolCompletionsInSession(completedIdsForUnlock, fullOptionalPool),
    [completedIdsForUnlock, fullOptionalPool]
  );

  const optionalPoolRewardsAreZero = optionalPoolCompletionCount >= 1;

  const visibleOptionalSlice = useMemo(
    () =>
      getVisibleOptionalPoolItems(
        fullOptionalPool,
        optionalCompletionsByArea,
        completedIdsForUnlock
      ),
    [
      fullOptionalPool,
      optionalCompletionsByArea,
      completedIdsForUnlock,
      dailySessions,
      clinicalToday,
      selectedPatientId,
    ]
  );

  const sessionNextOptionalPoolItem = visibleOptionalSlice[0] ?? null;

  const getNextOptionalAfterAddingId = useCallback(
    (exerciseId: string) => {
      const hypIds = completedIdsForUnlock.includes(exerciseId)
        ? [...completedIdsForUnlock]
        : [...completedIdsForUnlock, exerciseId];
      const hypArea = computeOptionalCompletionsByAreaFromSession(
        hypIds,
        optionalRehabExercises,
        strengthMissionRows
      );
      return getNextOptionalPoolItem(fullOptionalPool, hypArea, hypIds);
    },
    [
      completedIdsForUnlock,
      fullOptionalPool,
      optionalRehabExercises,
      strengthMissionRows,
    ]
  );

  const allOptionalPoolExerciseIdsDone = useMemo(() => {
    if (fullOptionalPool.length === 0) return true;
    const done = new Set(completedIdsForUnlock);
    return fullOptionalPool.every((p) => done.has(getOptionalPoolExerciseId(p)));
  }, [fullOptionalPool, completedIdsForUnlock]);

  const signalOptionalReveal = useCallback((hasNext: boolean) => {
    if (hasNext) setOptionalRevealHold(true);
  }, []);

  useEffect(() => {
    if (!optionalRevealHold || exercisesLocked) return;
    const poolKey = sessionNextOptionalPoolItem?.poolKey ?? null;
    const t = window.setTimeout(() => {
      setOptionalRevealHold(false);
      window.requestAnimationFrame(() => {
        if (poolKey) {
          setNewlyUnlockedPoolKeys(new Set([poolKey]));
          window.setTimeout(() => setNewlyUnlockedPoolKeys(new Set()), 2600);
          setGuardiTransient({
            key: `optional_unlock_${Date.now()}`,
            mood: 'joy',
            bubble: 'כל הכבוד! נפתח לך תרגיל נוסף לחיזוק אם תרצה.',
            until: Date.now() + 8500,
          });
        }
      });
    }, OPTIONAL_REVEAL_MS);
    return () => clearTimeout(t);
  }, [optionalRevealHold, sessionNextOptionalPoolItem?.poolKey, exercisesLocked, setGuardiTransient]);

  return {
    fullOptionalPool,
    optionalPoolCompletionCount,
    optionalPoolRewardsAreZero,
    getNextOptionalAfterAddingId,
    allOptionalPoolExerciseIdsDone,
    sessionNextOptionalPoolItem,
    optionalRevealHold,
    newlyUnlockedPoolKeys,
    optionalRehabDifficultyTiers,
    setOptionalRehabDifficultyTiers,
    signalOptionalReveal,
  };
}
