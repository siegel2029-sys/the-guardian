import { memo, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Patient } from '../../types';
import { getTherapistDisplayName } from '../../context/authPersistence';
import PatientPortalMessageFeed from './PatientPortalMessageFeed';
import PatientPortalMessagesUnreadBadge from './PatientPortalMessagesUnreadBadge';
import PatientPortalTherapistChatInput from './PatientPortalTherapistChatInput';

type Props = {
  patient: Patient;
  draftSeed?: string | null;
  onDraftSeedConsumed?: () => void;
};

function PatientPortalMessagesTab({
  patient,
  draftSeed,
  onDraftSeedConsumed,
}: Props) {
  const patientId = patient.id;
  const channelId = patientId;
  const therapistId = patient.therapistId?.trim() || undefined;

  const careGiverName = useMemo(() => {
    if (!therapistId) return 'המטפל';
    return getTherapistDisplayName(therapistId);
  }, [therapistId]);

  const careGiverShort = useMemo(() => {
    if (!careGiverName || careGiverName === 'המטפל') return careGiverName;
    return careGiverName.replace(/^ד"ר\s+/u, '').split(/\s+/)[0] || careGiverName;
  }, [careGiverName]);

  return (
    <section
      className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 w-full max-w-lg mx-auto"
      aria-label="מרכז הודעות"
    >
      <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-7 h-7 text-medical-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold text-slate-900">מרכז הודעות</p>
            <p className="text-sm text-slate-500 truncate">שיחה עם {careGiverName}</p>
          </div>
          <PatientPortalMessagesUnreadBadge patientId={patientId} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-slate-50/80">
        <PatientPortalMessageFeed patientId={patientId} careGiverName={careGiverName} />
      </div>

      <footer className="shrink-0 border-t-2 border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)] pointer-events-auto p-3 space-y-2">
        <p className="text-[11px] font-semibold text-teal-800 px-0.5">הודעה למטפל</p>
        <PatientPortalTherapistChatInput
          channelId={channelId}
          therapistId={therapistId}
          careGiverShort={careGiverShort}
          draftSeed={draftSeed}
          onDraftSeedConsumed={onDraftSeedConsumed}
        />
      </footer>
    </section>
  );
}

export default memo(PatientPortalMessagesTab);
