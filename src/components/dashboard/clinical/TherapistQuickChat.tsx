import { useState, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { usePatient } from '../../../context/PatientContext';
import { waMeOpenUrl } from '../../../utils/whatsappLink';

/** צ׳אט מהיר — פנימי לפורטל או פתיחת WhatsApp עם תבנית */
export default function TherapistQuickChat({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const { sendTherapistReply, setPatientContactWhatsapp, patients } = usePatient();
  const patient = patients.find((p) => p.id === patientId);
  const [text, setText] = useState('');
  const [sendChannel, setSendChannel] = useState<'internal' | 'whatsapp'>('internal');
  const [waPhoneDraft, setWaPhoneDraft] = useState('');

  useEffect(() => {
    setWaPhoneDraft(patient?.contactWhatsappE164 ?? '');
  }, [patient?.contactWhatsappE164, patientId]);

  const waTemplatePrefix = `שלום ${patientName}, מהמטפל:\n\n`;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    if (sendChannel === 'internal') {
      sendTherapistReply(patientId, t);
      setText('');
      return;
    }
    const full = `${waTemplatePrefix}${t}`;
    const stored = patient?.contactWhatsappE164;
    const tryOpen = (digits: string) => {
      const url = waMeOpenUrl(digits, full);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return !!url;
    };
    if (stored && tryOpen(stored)) {
      setText('');
      return;
    }
    if (tryOpen(waPhoneDraft)) {
      if (waPhoneDraft.replace(/\D/g, '').length >= 9) {
        setPatientContactWhatsapp(patientId, waPhoneDraft);
      }
      setText('');
    }
  };

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
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          value={sendChannel}
          onChange={(e) => setSendChannel(e.target.value as 'internal' | 'whatsapp')}
          className="text-[11px] rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-800"
        >
          <option value="internal">פורטל פנימי</option>
          <option value="whatsapp">WhatsApp ישיר</option>
        </select>
      </div>
      {sendChannel === 'whatsapp' && (
        <div className="mb-2 space-y-1">
          <p className="text-[10px] text-slate-500 leading-snug">
            תבנית: «{waTemplatePrefix.trim()}» + הטקסט שלכם
          </p>
          <input
            type="tel"
            inputMode="numeric"
            value={waPhoneDraft}
            onChange={(e) => setWaPhoneDraft(e.target.value)}
            placeholder="מספר בינלאומי ללא +"
            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-mono"
          />
        </div>
      )}
      <p className="text-[11px] text-slate-500 mb-2">
        {sendChannel === 'internal'
          ? 'ההודעה נשמרת ומוצגת מיד במרכז ההודעות בפורטל המטופל.'
          : 'נפתח חלון WhatsApp; אם הוזן מספר — יישמר לפעם הבאה.'}
      </p>
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={
            sendChannel === 'internal'
              ? 'הקלדת הודעה קצרה למטופל…'
              : 'הנחיות לתרגיל / מעקב…'
          }
          className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="shrink-0 h-10 px-4 rounded-lg text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
        >
          <Send className="w-4 h-4" />
          שליחה
        </button>
      </div>
    </div>
  );
}
