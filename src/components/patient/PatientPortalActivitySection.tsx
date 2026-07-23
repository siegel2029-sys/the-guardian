import type { Patient, PatientExercise, BodyArea } from '../../types';
import { PATIENT_REWARDS, exerciseBaseXp } from '../../config/patientRewards';
import { formatPatientRepsLabel } from '../../utils/patientExerciseRepsLabel';
import { displayPortalRehabExerciseTitle } from '../../utils/portalRehabExerciseTitle';
import ExerciseCard from './ExerciseCard';
import OptionalSection from './OptionalSection';
import type { UseOptionalRehabPoolResult } from './useOptionalRehabPool';
import type { ExerciseVideoModalState } from './usePatientTrainingOrchestration';
import type { AiLongitudinalGateResult } from '../../ai/aiProgramLongitudinalGate';

export interface PatientPortalActivitySectionProps {
  selectedPatient: Patient;
  trainingAiPlanModalOpen: boolean;
  aiProgramLongitudinalGate: AiLongitudinalGateResult | null;
  patientMustChangePassword: boolean;
  exercisesLocked: boolean;
  redFlagPortalLock: boolean;
  exerciseSafetyLocked: boolean;
  aiSteadyBannerDismissed: boolean;
  onDismissAiSteadyBanner: () => void;
  loadSafetyNudge: string | null;
  onDismissLoadSafetyNudge: () => void;
  exercises: PatientExercise[];
  selectedZones: BodyArea[];
  missionListHasAny: boolean;
  mandatoryRehabExercises: PatientExercise[];
  completedSet: Set<string>;
  optionalPool: UseOptionalRehabPoolResult;
  openExerciseTrainingModal: (modal: NonNullable<ExerciseVideoModalState>) => void;
  setSelfCareStrengthTier: (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => void;
}

/** טאב אימונים: משימות חובה + רשימת שיקום אופציונלי */
export default function PatientPortalActivitySection({
  selectedPatient,
  trainingAiPlanModalOpen,
  aiProgramLongitudinalGate,
  patientMustChangePassword,
  exercisesLocked,
  redFlagPortalLock,
  exerciseSafetyLocked,
  aiSteadyBannerDismissed,
  onDismissAiSteadyBanner,
  loadSafetyNudge,
  onDismissLoadSafetyNudge,
  exercises,
  selectedZones,
  missionListHasAny,
  mandatoryRehabExercises,
  completedSet,
  optionalPool,
  openExerciseTrainingModal,
  setSelfCareStrengthTier,
}: PatientPortalActivitySectionProps) {
  return (
    <>
      <div
        className={[
          'relative',
          trainingAiPlanModalOpen
            ? 'pointer-events-none select-none opacity-[0.35] motion-safe:transition-opacity motion-safe:duration-200'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={trainingAiPlanModalOpen || undefined}
      >
        <h1
          id="today-missions"
          className="text-lg font-bold text-slate-900 mb-2 tracking-tight scroll-mt-28 text-center"
        >
          תכנית השיקום (חובה)
        </h1>
        {aiProgramLongitudinalGate?.showSteadyProgress &&
          !patientMustChangePassword &&
          !exercisesLocked &&
          !aiSteadyBannerDismissed && (
            <div
              className="mb-4 rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/95 to-white px-4 py-3 shadow-sm"
              role="status"
            >
              <p className="text-sm font-bold text-teal-900">התקדמות יציבה</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                לפי נתוני הכאב, ההשלמה והתפקוד בימים האחרונים אין מגמה עקבית שמצדיקה הצעת שינוי תוכנית.
              </p>
              <button
                type="button"
                onClick={onDismissAiSteadyBanner}
                className="mt-2 text-xs font-semibold text-teal-800 underline"
              >
                סגירה
              </button>
            </div>
          )}
        {loadSafetyNudge && (
          <div
            className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed"
            role="status"
          >
            <p className="font-bold text-amber-900 mb-1">עדכון בטיחות</p>
            <p>{loadSafetyNudge}</p>
            <button
              type="button"
              onClick={onDismissLoadSafetyNudge}
              className="mt-2 text-xs font-semibold text-amber-800 underline"
            >
              סגירה
            </button>
          </div>
        )}

        {redFlagPortalLock && (
          <div
            className="mb-4 rounded-2xl border-2 border-red-600 bg-red-50 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm font-black text-red-950">תרגול נעול זמנית</p>
            <p className="text-xs text-red-900 mt-1 leading-relaxed">
              התרגילים נעולים זמנית עקב דיווח על כאב חריג. המטפל עודכן ויצור קשר בהקדם.
            </p>
          </div>
        )}

        {exerciseSafetyLocked && (
          <div
            className="mb-4 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm font-black text-red-950">תרגול נעול</p>
            <p className="text-xs text-red-900 mt-1 leading-relaxed">
              רשימת התרגילים חסומה עד שמטפל ישחרר לאחר בדיקה. אם יש חשש לחירום — התקשרו ל־101.
            </p>
          </div>
        )}

        {exercises.length === 0 && selectedZones.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-teal-200 p-8 text-center text-teal-800/80 text-sm"
            style={{ background: 'rgba(240, 253, 250, 0.6)' }}
          >
            אין תרגילים בתוכנית. המטפל יכול להוסיף תרגילים ממסך ניהול התוכנית, או לבחור אזורי כוח במפה.
          </div>
        ) : !missionListHasAny ? (
          <p className="text-sm text-slate-500 text-center py-6 leading-relaxed">
            אין תרגילי שיקום שמתאימים לאזור המוגדר. בחרו אזורים ירוקים לתרגילי כוח, או פנו למטפל לעדכון
            התוכנית.
          </p>
        ) : (
          <div
            className={`relative flex flex-col gap-4 ${exercisesLocked ? 'pointer-events-none select-none opacity-[0.38]' : ''}`}
          >
            {exercisesLocked && (
              <div
                className="absolute inset-0 z-10 rounded-2xl bg-red-950/5 pointer-events-none"
                aria-hidden
              />
            )}
            {mandatoryRehabExercises.length > 0 && (
              <section
                className="rounded-2xl border border-sky-200/85 bg-gradient-to-br from-sky-50/70 to-white px-3 pb-3 pt-2.5 shadow-sm"
                aria-label="תרגילי שיקום חובה"
              >
                <ul className="space-y-2 flex flex-col">
                  {mandatoryRehabExercises.map((ex, i) => {
                    const idx = i + 1;
                    const done = completedSet.has(ex.id);
                    const displaySets = ex.patientSets;
                    const repsShort = formatPatientRepsLabel({
                      reps: ex.patientReps,
                      holdSeconds: ex.holdSeconds,
                    });
                    const w = ex.patientWeightKg;
                    const weightLabel = w != null && w > 0 ? `${w} ק״ג` : undefined;
                    return (
                      <li key={`rehab-core-${ex.id}`} className="w-full">
                        <ExerciseCard
                          variant="rehab"
                          rehabTier="core"
                          index={idx}
                          isCompleted={done}
                          title={displayPortalRehabExerciseTitle(ex.name)}
                          setsLabel={String(displaySets)}
                          repsLabel={repsShort}
                          weightLabel={weightLabel}
                          xpReward={ex.xpReward}
                          videoUrl={ex.videoUrl ?? null}
                          onOpenTraining={() =>
                            openExerciseTrainingModal({
                              kind: 'rehab',
                              exercise: ex,
                              xpAward: exerciseBaseXp(ex.xpReward),
                              coinsAward: PATIENT_REWARDS.EXERCISE_COMPLETE.coins,
                            })
                          }
                          disabled={exercisesLocked}
                          typeKey={ex.type}
                          isCustomExercise={ex.isCustom}
                          rewardLabelXp={exerciseBaseXp(ex.xpReward)}
                          rewardLabelCoins={PATIENT_REWARDS.EXERCISE_COMPLETE.coins}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {selectedPatient && (
              <OptionalSection
                pool={optionalPool}
                selectedPatient={selectedPatient}
                exercisesLocked={exercisesLocked}
                openExerciseTrainingModal={openExerciseTrainingModal}
                setSelfCareStrengthTier={setSelfCareStrengthTier}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
