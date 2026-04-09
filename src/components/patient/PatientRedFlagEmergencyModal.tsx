import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getTherapistAlertEmail, openClinicalMailto } from '../../utils/clinicalAlertEmail';
import { usePatient } from '../../context/PatientContext';

const SYMPTOMS: { id: string; label: string }[] = [
  { id: 'sharp_pain', label: 'כאב חריף או חד שלא הכרתי' },
  { id: 'numb', label: 'נימול, עקצוץ או חולשה בלתי מוסברת' },
  { id: 'swell', label: 'נפיחות, אדמומיות או שינוי צורה באזור' },
  { id: 'systemic', label: 'חום, צמרמורות או חשד לזיהום' },
  { id: 'breath', label: 'קוצר נשימה או כאב חזה' },
];

const AREA_CHOICES: BodyArea[] = [
  'neck',
  'shoulder_left',
  'shoulder_right',
  'upper_arm_left',
  'upper_arm_right',
  'forearm_left',
  'forearm_right',
  'chest',
  'abdomen',
  'back_upper',
  'back_lower',
  'hip_left',
  'hip_right',
  'thigh_left',
  'thigh_right',
  'shin_left',
  'shin_right',
  'knee_left',
  'knee_right',
  'ankle_left',
  'ankle_right',
  'wrist_left',
  'wrist_right',
  'elbow_left',
  'elbow_right',
];

export default function PatientRedFlagEmergencyModal({
  open,
  onClose,
  patientId,
  patientName,
  therapistId,
  defaultBodyArea,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  therapistId: string;
  defaultBodyArea: BodyArea;
}) {
  const { reportPatientUrgentRedFlag } = usePatient();
  const [segment, setSegment] = useState<BodyArea>(defaultBodyArea);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState('');

  useEffect(() => {
    if (!open) return;
    setSegment(defaultBodyArea);
    setPicked({});
    setFreeText('');
  }, [open, defaultBodyArea]);

  const symptomLine = useMemo(() => {
    const fromBoxes = SYMPTOMS.filter((s) => picked[s.id]).map((s) => s.label);
    const extra = freeText.trim();
    const parts = [...fromBoxes, ...(extra ? [extra] : [])];
    return parts.length > 0 ? parts.join('; ') : 'לא סומנו תסמינים ספציפיים';
  }, [picked, freeText]);

  if (!open) return null;

  const submit = () => {
    const to = getTherapistAlertEmail(therapistId);
    const subject = `[The Guardian] דגל אדום דחוף — ${patientName}`;
    const body =
      `דגל אדום דחוף מהפורטל\n\n` +
      `מטופל: ${patientName}\n` +
      `אזור: ${bodyAreaLabels[segment]}\n` +
      `תסמינים: ${symptomLine}\n\n` +
      `נא ליצור קשר בהקדם.\n` +
      `(הודעה נשלחה דרך דוא״ל — ללא חשיפת מספר טלפון אישי)`;
    openClinicalMailto(to, subject, body);
    const portalLine = `[דגל אדום — דוא״ל למטפל]\nאזור: ${bodyAreaLabels[segment]}\nתסמינים: ${symptomLine}`;
    reportPatientUrgentRedFlag(patientId, portalLine);
    onClose();
  };

  const toggle = (id: string) => {
    setPicked((p) => ({ ...p, [id]: !p[id] }));
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="redflag-emergency-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{
          borderColor: '#dc2626',
          background: 'linear-gradient(180deg, #fef2f2 0%, #ffffff 40%)',
        }}
        dir="rtl"
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 shrink-0"
          style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)' }}
        >
          <div className="flex items-center gap-2 min-w-0 text-white">
            <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.4} />
            <h2 id="redflag-emergency-title" className="text-sm sm:text-base font-black truncate">
              דיווח דחוף — Red Flag
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/90 hover:bg-white/15 shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 space-y-3 text-sm text-slate-800">
          <p className="text-xs text-red-950/90 leading-relaxed font-medium">
            אם יש חשד לחירום רפואי — התקשרו ל־101 או לחצו מוקד רפואי. כפתור זה פותח הודעת דוא״ל למטפל
            (ללא חשיפת מספר טלפון) ומסמן דגל אדום בפורטל.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">אזור בגוף</label>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as BodyArea)}
              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
            >
              {AREA_CHOICES.map((a) => (
                <option key={a} value={a}>
                  {bodyAreaLabels[a]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">סמנו מה רלוונטי</p>
            <ul className="space-y-2">
              {SYMPTOMS.map((s) => (
                <li key={s.id}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!picked[s.id]}
                      onChange={() => toggle(s.id)}
                      className="mt-1 rounded border-red-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm leading-snug">{s.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">הערות נוספות (אופציונלי)</label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none"
              placeholder="למשל: מתי התחיל, מה מחמיר…"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-red-100 shrink-0 flex flex-col gap-2 bg-white/90">
          <button
            type="button"
            onClick={submit}
            className="w-full py-3.5 rounded-2xl font-black text-white text-sm sm:text-base shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #b91c1c, #ef4444)',
              boxShadow: '0 10px 28px -8px rgba(220, 38, 38, 0.65)',
            }}
          >
            פתיחת דוא״ל למטפל + דגל אדום בפורטל
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
