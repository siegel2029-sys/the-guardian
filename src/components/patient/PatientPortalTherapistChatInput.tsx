import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';

/** מפתח קבוע — מונע איבוד פוקוס בעת רינדור מחדש של הורה */
export const PATIENT_PORTAL_THERAPIST_CHAT_INPUT_KEY = 'patient-portal-therapist-chat-input';

type Props = {
  /** מזהה ערוץ הצ'אט (patient_id ב־Supabase) */
  channelId: string;
  /** מזהה המטפל — נדרש לשליחה מוצלחת */
  therapistId?: string;
  careGiverShort: string;
  draftSeed?: string | null;
  onDraftSeedConsumed?: () => void;
};

function PatientPortalTherapistChatInput({
  channelId,
  therapistId,
  careGiverShort,
  draftSeed,
  onDraftSeedConsumed,
}: Props) {
  const { sendPatientMessage } = usePatient();
  const sendPatientMessageRef = useRef(sendPatientMessage);
  sendPatientMessageRef.current = sendPatientMessage;

  const [messageText, setMessageText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = Boolean(channelId.trim() && therapistId?.trim() && messageText.trim());

  useEffect(() => {
    if (!draftSeed?.trim()) return;
    setMessageText(draftSeed);
    onDraftSeedConsumed?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftSeed, onDraftSeedConsumed]);

  const handleSend = useCallback(() => {
    const text = messageText.trim();
    const pid = channelId.trim();
    const tid = therapistId?.trim();
    if (!text || !pid || !tid) return;
    sendPatientMessageRef.current(pid, text);
    setMessageText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [messageText, channelId, therapistId]);

  return (
    <div className="flex gap-2 items-end pointer-events-auto">
      <textarea
        key={PATIENT_PORTAL_THERAPIST_CHAT_INPUT_KEY}
        ref={inputRef}
        value={messageText}
        onChange={(e) => setMessageText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={
          therapistId?.trim()
            ? `הודעה ל־${careGiverShort}…`
            : 'ממתין לקישור מטפל…'
        }
        rows={2}
        disabled={!therapistId?.trim()}
        className="flex-1 resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-primary/30 bg-white touch-manipulation disabled:opacity-60"
        aria-label={`הודעה ל־${careGiverShort}`}
      />
      <button
        type="button"
        disabled={!canSend}
        onClick={handleSend}
        className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center text-white disabled:opacity-40 bg-medical-primary shadow-md touch-manipulation"
        aria-label="שלח הודעה למטפל"
      >
        <Send className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default memo(PatientPortalTherapistChatInput);
