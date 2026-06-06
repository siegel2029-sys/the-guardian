import { memo, useCallback, useRef, useState } from 'react';
import type { Patient, PatientExercise } from '../../types';
import { usePatient } from '../../context/PatientContext';
import GuardianAssistantFAB, { type GuardianAssistantFABHandle } from './GuardianAssistantFAB';
import PatientPortalAiChatInput from './PatientPortalAiChatInput';

type Props = {
  patient: Patient;
  exercises: PatientExercise[];
  onPatientEmergencyText?: () => void;
};

/**
 * Floating AI Q&A entry point for the patient portal. All typing state stays inside
 * PatientPortalAiChatInput — this shell never lifts keystrokes to PatientDailyView.
 */
function PatientPortalHomeAiChatDock({
  patient,
  exercises,
  onPatientEmergencyText,
}: Props) {
  const { submitGuardianRepsIncreaseRequest, sendAiClinicalAlert } = usePatient();
  const guardianRef = useRef<GuardianAssistantFABHandle>(null);
  const [aiReplyLoading, setAiReplyLoading] = useState(false);

  const patientId = patient.id;
  const exerciseCount = exercises.length;

  const handleSubmitGuardianRepsRequest = useCallback(
    (exerciseId: string, exerciseName: string, fromReps: number, toReps: number) => {
      submitGuardianRepsIncreaseRequest(patientId, exerciseId, exerciseName, fromReps, toReps);
    },
    [patientId, submitGuardianRepsIncreaseRequest]
  );

  const handleTherapistClinicalAlert = useCallback(
    (detail?: string) => {
      sendAiClinicalAlert(patientId, detail);
    },
    [patientId, sendAiClinicalAlert]
  );

  const handleAiSend = useCallback((text: string) => {
    guardianRef.current?.sendPortalMessage(text);
  }, []);

  return (
    <>
      <div
        className="fixed z-[30] pointer-events-none"
        style={{
          bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
          left: 'max(12px, env(safe-area-inset-left, 0px))',
        }}
      >
        <PatientPortalAiChatInput
          variant="floating-fab"
          patientId={patientId}
          onSend={handleAiSend}
          replyLoading={aiReplyLoading}
        />
      </div>

      <GuardianAssistantFAB
        ref={guardianRef}
        patient={patient}
        exerciseCount={exerciseCount}
        exercises={exercises}
        variant="portal"
        portalSurface="inline"
        suppressInlineInput
        onReplyLoadingChange={setAiReplyLoading}
        onSubmitGuardianRepsRequest={handleSubmitGuardianRepsRequest}
        onTherapistClinicalAlert={handleTherapistClinicalAlert}
        onPatientEmergencyText={onPatientEmergencyText}
      />
    </>
  );
}

export default memo(PatientPortalHomeAiChatDock);
