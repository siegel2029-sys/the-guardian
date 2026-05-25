import { useState, useCallback } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { usePatient } from '../../../context/PatientContext';

/** צ׳אט מהיר — הודעות פנימיות לפורטל */
export default function TherapistQuickChat({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const { sendTherapistReply } = usePatient();
  const [text, setText] = useState('');

  const threadPatientId = patientId.trim();
  const canSend = Boolean(threadPatientId && text.trim().length > 0);

  const send = useCallback(() => {
    const t = text.trim();
    if (!t || !threadPatientId) return;
    if (import.meta.env.DEV) {
      console.log('[Chat UI] TherapistQuickChat send', { patientId: threadPatientId });
    }
    sendTherapistReply(threadPatientId, t);
    setText('');
  }, [text, threadPatientId, sendTherapistReply]);

  return (
    <div
      className="rounded-xl border bg-white p-4 shadow-sm"
      style={{ borderColor: '#bfdbfe' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-800">צ׳אט מהיר</h3>
        <span className="text-[11px] text-slate-500">ל־{patientName}</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        ההודעה נשמרת ומוצגת מיד במרכז ההודעות בפורטל המטופל.
      </p>
      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          aria-label="צ׳אט מהיר למטופל"
          placeholder="הקלדת הודעה קצרה למטופל…"
          className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          aria-disabled={!canSend}
          className={`shrink-0 h-10 px-4 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 ${
            canSend ? '' : 'opacity-40 cursor-not-allowed'
          }`}
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
        >
          <Send className="w-4 h-4" />
          שליחה
        </button>
      </form>
    </div>
  );
}
