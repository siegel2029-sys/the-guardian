import { memo, useMemo } from 'react';
import { usePatient } from '../../context/PatientContext';

type Props = {
  patientId: string;
};

function PatientPortalMessagesUnreadBadge({ patientId }: Props) {
  const { messages, getPatientMessages } = usePatient();

  const unreadForPatient = useMemo(() => {
    const portalMessages = getPatientMessages(patientId);
    return portalMessages.filter((m) => !m.isRead && !m.fromPatient).length;
  }, [patientId, getPatientMessages, messages]);

  if (unreadForPatient <= 0) return null;

  return (
    <span className="shrink-0 min-w-[1.75rem] h-8 px-2 rounded-full text-sm font-black flex items-center justify-center text-white bg-medical-primary">
      {unreadForPatient > 9 ? '9+' : unreadForPatient}
    </span>
  );
}

export default memo(PatientPortalMessagesUnreadBadge);
