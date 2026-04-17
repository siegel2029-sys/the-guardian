import type { Dispatch, SetStateAction } from 'react';
import type { BodyArea, Patient, PatientExercise } from '../../types';
import type { StrengthExerciseLevelDef } from '../../data/strengthExerciseDatabase';
import ExerciseCard from './ExerciseCard';
import { formatTime } from '../dashboard/ManagePlanModal';
import { displayPortalRehabExerciseTitle } from '../../utils/portalRehabExerciseTitle';
import {
  PATIENT_REWARDS,
  exerciseBaseXp,
  optionalRehabHalfBaseXp,
  optionalRehabHalfCoins,
  halfDisplayXp,
  halfDisplayCoins,
  applyOptionalTierToHalfXp,
  applyOptionalTierToHalfCoins,
} from '../../config/patientRewards';
import type { UseOptionalRehabPoolResult } from './useOptionalRehabPool';

type ExerciseVideoModalState =
  | null
  | { kind: 'rehab'; exercise: PatientExercise; xpAward: number; coinsAward: number }
  | {
      kind: 'selfCare';
      bodyArea: BodyArea;
      exercise: StrengthExerciseLevelDef;
      xpAward: number;
      coinsAward: number;
    };

export interface OptionalSectionProps {
  pool: UseOptionalRehabPoolResult;
  selectedPatient: Patient;
  exercisesLocked: boolean;
  timerArmedExerciseIds: readonly string[];
  setExerciseVideoModal: Dispatch<SetStateAction<ExerciseVideoModalState>>;
  setReportFor: Dispatch<SetStateAction<PatientExercise | null>>;
  setSelfCareStrengthTier: (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => void;
}

export default function OptionalSection({
  pool,
  selectedPatient,
  exercisesLocked,
  timerArmedExerciseIds,
  setExerciseVideoModal,
  setReportFor,
  setSelfCareStrengthTier,
}: OptionalSectionProps) {
  const {
    fullOptionalPool,
    optionalPoolRewardsAreZero,
    allOptionalPoolExerciseIdsDone,
    sessionNextOptionalPoolItem,
    optionalRevealHold,
    newlyUnlockedPoolKeys,
    optionalRehabDifficultyTiers,
    setOptionalRehabDifficultyTiers,
  } = pool;

  if (fullOptionalPool.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/80 to-white p-3 shadow-sm"
      aria-labelledby="section-optional-rehab"
    >
      <div className="mb-2 px-0.5">
        <h2
          id="section-optional-rehab"
          className="text-sm font-medium text-slate-500 tracking-tight text-center"
        >
          תרגילים נוספים לבחירתך
        </h2>
      </div>
      {!sessionNextOptionalPoolItem ? (
        <p className="text-xs text-slate-500 text-center leading-relaxed px-1 py-2">
          {allOptionalPoolExerciseIdsDone
            ? 'כל הכבוד! סיימת את כל התרגילים הנוספים שבחרת להיום.'
            : 'כל הכבוד! ניצלת את מכסת 4 התרגילים הנוספים לכל אזור גוף לפי התוכנית.'}
        </p>
      ) : optionalRevealHold ? (
        <div
          className="min-h-[5.75rem] rounded-lg border border-dashed border-slate-200/90 bg-slate-50/80 motion-safe:animate-optional-interstitial flex items-center justify-center"
          aria-busy="true"
        />
      ) : (
        (() => {
          const item = sessionNextOptionalPoolItem!;
          const cardKey = item.poolKey;
          return (
            <ul className="space-y-2 flex flex-col">
              <li
                key={item.poolKey}
                className={`w-full ${
                  newlyUnlockedPoolKeys.has(item.poolKey) ? 'animate-optional-unlock' : ''
                }`}
              >
                {item.kind === 'rehab' ? (
                  <ExerciseCard
                    key={cardKey}
                    variant="rehab"
                    rehabTier="optional"
                    index={1}
                    isCompleted={false}
                    title={displayPortalRehabExerciseTitle(item.exercise.name)}
                    setsLabel={String(item.exercise.patientSets)}
                    repsLabel={
                      item.exercise.holdSeconds && item.exercise.patientReps === 0
                        ? formatTime(item.exercise.holdSeconds)
                        : item.exercise.holdSeconds && item.exercise.patientReps > 0
                          ? `${item.exercise.patientReps}+${formatTime(item.exercise.holdSeconds)}`
                          : `${item.exercise.patientReps}`
                    }
                    weightLabel={
                      item.exercise.patientWeightKg != null && item.exercise.patientWeightKg > 0
                        ? `${item.exercise.patientWeightKg} ק״ג`
                        : 'ללא משקל'
                    }
                    xpReward={item.exercise.xpReward}
                    videoUrl={item.exercise.videoUrl ?? null}
                    optionalRehabDifficultyTier={
                      optionalRehabDifficultyTiers[item.exercise.id] ?? 1
                    }
                    onOptionalRehabDifficultyTierChange={(newTier) =>
                      setOptionalRehabDifficultyTiers((prev) => ({
                        ...prev,
                        [item.exercise.id]: newTier,
                      }))
                    }
                    onOpenTraining={() => {
                      const ex = item.exercise;
                      const tier = optionalRehabDifficultyTiers[ex.id] ?? 1;
                      const baseHalfXp = optionalRehabHalfBaseXp(ex.xpReward);
                      const baseHalfCoins = optionalRehabHalfCoins();
                      const displayXp = optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfXp(baseHalfXp, tier);
                      const displayCoins = optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfCoins(baseHalfCoins, tier);
                      setExerciseVideoModal({
                        kind: 'rehab',
                        exercise: ex,
                        xpAward: displayXp,
                        coinsAward: displayCoins,
                      });
                    }}
                    onMarkComplete={() => setReportFor(item.exercise)}
                    markCompleteAllowed={timerArmedExerciseIds.includes(item.exercise.id)}
                    disabled={exercisesLocked}
                    typeKey={item.exercise.type}
                    isCustomExercise={item.exercise.isCustom}
                    rewardLabelXp={
                      optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfXp(
                            optionalRehabHalfBaseXp(item.exercise.xpReward),
                            optionalRehabDifficultyTiers[item.exercise.id] ?? 1
                          )
                    }
                    rewardLabelCoins={
                      optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfCoins(
                            optionalRehabHalfCoins(),
                            optionalRehabDifficultyTiers[item.exercise.id] ?? 1
                          )
                    }
                  />
                ) : (
                  <ExerciseCard
                    key={cardKey}
                    variant="selfCare"
                    index={1}
                    isCompleted={false}
                    title={item.exercise.name}
                    setsLabel={String(item.exercise.sets)}
                    repsLabel={
                      item.exercise.repsAreSeconds
                        ? `${item.exercise.reps} ש״`
                        : String(item.exercise.reps)
                    }
                    weightLabel={
                      item.strengthTier === 0
                        ? 'קל'
                        : item.strengthTier === 1
                          ? 'בינוני'
                          : 'קשה'
                    }
                    xpReward={Math.max(1, Math.floor(item.exercise.xpReward * 0.5))}
                    videoUrl={item.exercise.videoUrl}
                    selfCareStrengthTier={item.strengthTier}
                    onSelfCareStrengthTierChange={(tier) => {
                      setSelfCareStrengthTier(selectedPatient.id, item.area, tier);
                    }}
                    onOpenTraining={() => {
                      const ex = item.exercise;
                      const strengthTier = item.strengthTier;
                      const selfXp = Math.max(1, Math.floor(ex.xpReward * 0.5));
                      const fullCardXp = exerciseBaseXp(selfXp);
                      const baseHalfXp = halfDisplayXp(fullCardXp);
                      const baseHalfCoins = halfDisplayCoins(PATIENT_REWARDS.EXERCISE_COMPLETE.coins);
                      const displayXp = optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfXp(baseHalfXp, strengthTier);
                      const displayCoins = optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfCoins(baseHalfCoins, strengthTier);
                      setExerciseVideoModal({
                        kind: 'selfCare',
                        bodyArea: item.area,
                        exercise: ex,
                        xpAward: displayXp,
                        coinsAward: displayCoins,
                      });
                    }}
                    disabled={exercisesLocked}
                    rewardLabelXp={
                      optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfXp(
                            halfDisplayXp(
                              exerciseBaseXp(Math.max(1, Math.floor(item.exercise.xpReward * 0.5)))
                            ),
                            item.strengthTier
                          )
                    }
                    rewardLabelCoins={
                      optionalPoolRewardsAreZero
                        ? 0
                        : applyOptionalTierToHalfCoins(
                            halfDisplayCoins(PATIENT_REWARDS.EXERCISE_COMPLETE.coins),
                            item.strengthTier
                          )
                    }
                  />
                )}
              </li>
            </ul>
          );
        })()
      )}
    </section>
  );
}
