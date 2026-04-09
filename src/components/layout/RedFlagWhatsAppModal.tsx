import { useMemo, useState } from 'react';
import { X, MessageCircleWarning } from 'lucide-react';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { REDFLAG_WHATSAPP_E164 } from '../../config/redFlagContact';

const SYMPTOMS: { id: string; label: string }[] = [
  { id: 'pain_spike', label: 'החמרת כאב חדה' },
  { id: 'numbness', label: 'נימול / עקצוץ' },
  { id: 'weakness', label: 'חולשה בלתי מוסברת' },
  { id: 'fever', label: 'חום / דלקת' },
  { id: 'instability', label: 'ייצוב לקוי / נפילה' },
  { id: 'night_pain', label: 'כאב לילי קיצוני' },
  { id: 'swelling', label: 'נפיחות חדשה' },
  { id: 'other', label: 'אחר (פרט בהודעה)' },
];

const SEGMENT_OPTIONS = (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
  bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
);

function buildRedFlagMessage(segment: BodyArea, patientId: string, symptomLabels: string[]): string {
  const seg = bodyAreaLabels[segment];
  const sym = symptomLabels.length ? symptomLabels.join(', ') : 'לא צוין';
  return `שלום נדב, דגל אדום זוהה ב-${seg} של מטופל ${patientId}. סימפטום: ${sym}.`;
}

export default function RedFlagWhatsAppModal({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const [segment, setSegment] = useState<BodyArea>('back_lower');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const waUrl = useMemo(() => {
    const labels = SYMPTOMS.filter((s) => picked.has(s.id)).map((s) => s.label);
    const text = buildRedFlagMessage(segment, patientId, labels);
    const phone = REDFLAG_WHATSAPP_E164.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }, [segment, patientId, picked]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden bg-white"
        style={{ borderColor: '#fecaca' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-wa-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50/80">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircleWarning className="w-5 h-5 text-red-600 shrink-0" />
            <h2 id="rf-wa-title" className="text-sm font-black text-red-950 truncate">
              דגל אדום — WhatsApp לנדב
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-red-100"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[min(70vh,520px)] overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed">
            מטופל: <strong>{patientName}</strong> · מזהה: <code className="text-[11px] bg-slate-100 px-1 rounded">{patientId}</code>
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">מקטע גוף</label>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as BodyArea)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {SEGMENT_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {bodyAreaLabels[a]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700 mb-2">סימפטומים (סמן את הרלוונטיים)</p>
            <ul className="space-y-1.5">
              {SYMPTOMS.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={picked.has(s.id)}
                      onChange={() => {
                        setPicked((prev) => {
                          const n = new Set(prev);
                          if (n.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        });
                      }}
                      className="rounded border-slate-300"
                    />
                    {s.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">
            {buildRedFlagMessage(
              segment,
              patientId,
              SYMPTOMS.filter((s) => picked.has(s.id)).map((s) => s.label)
            )}
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
          >
            פתיחה ב־WhatsApp
          </a>
          <p className="text-[10px] text-slate-400 text-center">
            מספר יעד: {REDFLAG_WHATSAPP_E164} — ניתן לשינוי ב־VITE_REDFLAGS_WHATSAPP
          </p>
        </div>
      </div>
    </div>
  );
}
