import { Settings } from 'lucide-react';
import type { Patient, PatientExerciseFinishReport, BodyArea } from '../../types';
import type { PatientPasswordChangeResult } from '../../context/authPersistence';
import type { ExerciseTrainingFeedbackPayload } from './ExerciseTrainingFeedbackModal';
import ExerciseVideoTimerModal from './ExerciseVideoTimerModal';
import ExerciseTrainingFeedbackModal from './ExerciseTrainingFeedbackModal';
import EmergencyStopModal from './EmergencyStopModal';
import PainAnalyticsModal from './PainAnalyticsModal';
import PatientRedFlagEmergencyModal from './PatientRedFlagEmergencyModal';
import PatientPortalSettingsModal from './PatientPortalSettingsModal';
import { patientFacingExerciseInstructions } from '../../utils/patientFacingExerciseInstructions';
import { formatPatientRepsLabel } from '../../utils/patientExerciseRepsLabel';
import type {
  ExerciseVideoModalState,
  PendingTrainingSession,
} from './usePatientTrainingOrchestration';

export interface PatientDailyViewModalsProps {
  selectedPatient: Patient;
  portalPatientLabel: string;
  clinicalToday: string;
  sessionRole: string | null | undefined;
  patientMustChangePassword: boolean;
  showPortalFrozenOverlay: boolean;

  redFlagOpen: boolean;
  onCloseRedFlag: () => void;

  painAnalyticsOpen: boolean;
  onClosePainAnalytics: () => void;
  finishReports: PatientExerciseFinishReport[];

  exerciseVideoModal: ExerciseVideoModalState;
  onClearTrainingSession: () => void;
  onFinishPractice: () => void;

  pendingTrainingSession: PendingTrainingSession | null;
  trainingFeedbackOpen: boolean;
  trainingSubmitError: string | null;
  onCloseTrainingFeedback: () => void;
  onSubmitTrainingFeedback: (payload: ExerciseTrainingFeedbackPayload) => Promise<boolean>;

  emergencyModalOpen: boolean;
  latestEmergencyReason: string | undefined;
  onAcknowledgeEmergency: () => void;
  onOpenTherapistMessageFromEmergency: () => void;

  pwCurrent: string;
  pwNew: string;
  pwConfirm: string;
  pwFormError: string | null;
  onPwCurrentChange: (v: string) => void;
  onPwNewChange: (v: string) => void;
  onPwConfirmChange: (v: string) => void;
  onSubmitPasswordChange: () => void;

  onNavigateToMessages: () => void;
  onLogout: () => void;

  settingsModalOpen: boolean;
  onCloseSettings: () => void;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => Promise<PatientPasswordChangeResult>;
}

/** ערימת מודאלים של פורטל המטופל — props בלבד, ללא שליפת נתונים */
export default function PatientDailyViewModals({
  selectedPatient,
  portalPatientLabel,
  clinicalToday,
  sessionRole,
  patientMustChangePassword,
  showPortalFrozenOverlay,
  redFlagOpen,
  onCloseRedFlag,
  painAnalyticsOpen,
  onClosePainAnalytics,
  finishReports,
  exerciseVideoModal,
  onClearTrainingSession,
  onFinishPractice,
  pendingTrainingSession,
  trainingFeedbackOpen,
  trainingSubmitError,
  onCloseTrainingFeedback,
  onSubmitTrainingFeedback,
  emergencyModalOpen,
  latestEmergencyReason,
  onAcknowledgeEmergency,
  onOpenTherapistMessageFromEmergency,
  pwCurrent,
  pwNew,
  pwConfirm,
  pwFormError,
  onPwCurrentChange,
  onPwNewChange,
  onPwConfirmChange,
  onSubmitPasswordChange,
  onNavigateToMessages,
  onLogout,
  settingsModalOpen,
  onCloseSettings,
  completePatientPasswordChange,
}: PatientDailyViewModalsProps) {
  return (
    <>
      <PatientRedFlagEmergencyModal
        open={redFlagOpen}
        onClose={onCloseRedFlag}
        patientId={selectedPatient.id}
        patientName={portalPatientLabel}
        therapistId={selectedPatient.therapistId}
        defaultBodyArea={selectedPatient.primaryBodyArea as BodyArea}
      />

      <PainAnalyticsModal
        open={painAnalyticsOpen}
        onClose={onClosePainAnalytics}
        patient={selectedPatient}
        finishReports={finishReports}
        clinicalToday={clinicalToday}
      />

      {exerciseVideoModal != null && (
        <ExerciseVideoTimerModal
          key={`${exerciseVideoModal.kind}-${exerciseVideoModal.exercise.id}-${
            exerciseVideoModal.kind === 'selfCare' ? exerciseVideoModal.bodyArea : 'rehab'
          }`}
          open
          title={exerciseVideoModal.exercise.name}
          videoUrl={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.videoUrl ?? ''
              : exerciseVideoModal.exercise.videoUrl
          }
          description={patientFacingExerciseInstructions(exerciseVideoModal.exercise)}
          targetSets={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.patientSets
              : exerciseVideoModal.exercise.sets
          }
          repsLabel={
            exerciseVideoModal.kind === 'rehab'
              ? formatPatientRepsLabel({
                  reps: exerciseVideoModal.exercise.patientReps,
                  holdSeconds: exerciseVideoModal.exercise.holdSeconds,
                })
              : formatPatientRepsLabel({
                  reps: exerciseVideoModal.exercise.reps,
                  repsAreSeconds: exerciseVideoModal.exercise.repsAreSeconds,
                })
          }
          holdSeconds={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.holdSeconds ?? 0
              : exerciseVideoModal.exercise.repsAreSeconds
                ? exerciseVideoModal.exercise.reps
                : 0
          }
          isTimeBased={
            exerciseVideoModal.kind === 'rehab'
              ? Boolean(
                  exerciseVideoModal.exercise.holdSeconds &&
                    exerciseVideoModal.exercise.patientReps === 0
                )
              : Boolean(exerciseVideoModal.exercise.repsAreSeconds)
          }
          targetArea={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.targetArea
              : exerciseVideoModal.bodyArea
          }
          muscleGroup={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.muscleGroup
              : undefined
          }
          variant={exerciseVideoModal.kind === 'rehab' ? 'rehab' : 'selfCare'}
          xpAward={exerciseVideoModal.xpAward}
          coinsAward={exerciseVideoModal.coinsAward}
          primeSeconds={30}
          onClose={onClearTrainingSession}
          onFinishPractice={onFinishPractice}
        />
      )}

      {pendingTrainingSession != null && (
        <ExerciseTrainingFeedbackModal
          open={trainingFeedbackOpen}
          submitError={trainingSubmitError}
          onClose={onCloseTrainingFeedback}
          onSubmit={onSubmitTrainingFeedback}
        />
      )}

      <EmergencyStopModal
        open={emergencyModalOpen}
        syndromeDetailHebrew={latestEmergencyReason}
        onAcknowledge={onAcknowledgeEmergency}
        onOpenTherapistMessage={onOpenTherapistMessageFromEmergency}
      />

      {sessionRole === 'patient' && patientMustChangePassword && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 118, 110, 0.35)' }}
          dir="rtl"
        >
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl p-6"
            style={{ background: '#ffffff', borderColor: '#99f6e4' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pw-gate-title"
          >
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-6 h-6 text-teal-600" strokeWidth={2} aria-hidden />
              <h2 id="pw-gate-title" className="text-lg font-bold text-slate-800">
                עדכון סיסמה נדרש
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              זו הכניסה הראשונה שלך לפורטל. לבטיחות, בחר סיסמה אישית חדשה (לפחות 8 תווים, אותיות ומספרים).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה נוכחית</label>
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => onPwCurrentChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה חדשה</label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => onPwNewChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">אימות סיסמה</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => onPwConfirmChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {pwFormError && <p className="mt-3 text-sm text-red-600">{pwFormError}</p>}
            <button
              type="button"
              onClick={() => void onSubmitPasswordChange()}
              className="mt-5 w-full py-3 rounded-2xl font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
            >
              שמירה והמשך
            </button>
          </div>
        </div>
      )}

      {sessionRole === 'patient' && showPortalFrozenOverlay && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-[3px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="portal-frozen-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 text-center">
            <h2 id="portal-frozen-title" className="text-lg font-black text-slate-900 mb-3">
              החשבון הוקפא
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              החשבון שלך הוקפא זמנית על ידי המטפל. כל הנתונים שלך שמורים במערכת, אך הגישה לתוכנית האימונים חסומה
              כרגע.
            </p>
            <button
              type="button"
              className="w-full py-3.5 rounded-xl font-bold text-white mb-3 shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
              onClick={onNavigateToMessages}
            >
              צור קשר עם המטפל
            </button>
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              onClick={onLogout}
            >
              התנתקות
            </button>
          </div>
        </div>
      )}

      {sessionRole === 'patient' && !patientMustChangePassword && (
        <PatientPortalSettingsModal
          open={settingsModalOpen}
          onClose={onCloseSettings}
          patient={selectedPatient}
          completePatientPasswordChange={completePatientPasswordChange}
        />
      )}
    </>
  );
}
