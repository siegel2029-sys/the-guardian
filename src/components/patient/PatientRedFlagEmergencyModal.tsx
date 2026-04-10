import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, X, Phone } from 'lucide-react';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getTherapistAlertEmail, openClinicalMailto } from '../../utils/clinicalAlertEmail';
import { usePatient } from '../../context/PatientContext';

/** תסמיני חירום קלאסיים (כולל חשד לקאודה אקווינה) — תזכורת + דיווח */
const EMERGENCY_SYMPTOMS: { id: string; label: string }[] = [
  {
    id: 'saddle_anesthesia',
    label:
      'נימול או הרדמה באזור הישבן, המפשעה או «אוכף הסוס» בין הרגליים (אנהסתזיה אוכפתית)',
  },
  {
    id: 'bladder_bowel',
    label: 'איבוד שליטה בשתן או בצואה, או שינוי פתאומי בריקון השלפוחית / המעיים',
  },
  {
    id: 'bilateral_leg_weakness',
    label: 'חולשה הולכת ומתגברת בשני הרגליים, או קושי מתפתח בהליכה / בירידה ממדרגות',
  },
  {
    id: 'severe_back_with_neuro',
    label: 'כאב גב תחתון חד או קיצוני יחד עם אחד מהתסמינים הנ״ל',
  },
];

const OTHER_SYMPTOMS: { id: string; label: string }[] = [
  { id: 'sharp_pain', label: 'כאב חריף או חד שלא הכרתי קודם' },
  { id: 'numb_limb', label: 'נימול, עקצוץ או חולשה בלתי מוסברת ביד או ברגל' },
  { id: 'swell', label: 'נפיחות, אדמומיות או שינוי צורה חד באזור' },
  { id: 'systemic', label: 'חום, צמרמורות או חשד לזיהום' },
  { id: 'breath', label: 'קוצר נשימה או כאב חזה' },
];

const ALL_SYMPTOM_IDS = [...EMERGENCY_SYMPTOMS, ...OTHER_SYMPTOMS].map((s) => s.id);

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
    const fromBoxes = ALL_SYMPTOM_IDS.filter((id) => picked[id])
      .map((id) => {
        const hit = [...EMERGENCY_SYMPTOMS, ...OTHER_SYMPTOMS].find((s) => s.id === id);
        return hit?.label ?? id;
      });
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

  const renderCheckboxList = (items: { id: string; label: string }[]) => (
    <ul className="space-y-2">
      {items.map((s) => (
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
  );

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

        <div className="px-4 py-3 overflow-y-auto flex-1 space-y-4 text-sm text-slate-800">
          <p className="text-xs text-red-950/95 leading-relaxed font-semibold">
            אם יש חשד לחירום רפואי מיידי — התקשרו ל־101 (מגן דוד אדום) או לפי הנחיית רופא. כאן ניתן גם
            לשלוח דוא״ל למטפל ולסמן דגל אדום בפורטל (ללא חשיפת מספר טלפון אישי).
          </p>

          <div
            className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-3 space-y-2"
            role="region"
            aria-label="תסמיני חירום"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-red-900">
              תסמיני חירום — יש לפעול במהירות
            </p>
            <ul className="text-xs text-red-950 leading-relaxed space-y-2 list-none">
              {EMERGENCY_SYMPTOMS.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span className="text-red-600 font-bold shrink-0" aria-hidden>
                    ·
                  </span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <a
              href="tel:101"
              className="w-full py-3.5 rounded-2xl font-black text-sm sm:text-base text-center text-white shadow-md flex items-center justify-center gap-2 no-underline"
              style={{
                background: 'linear-gradient(135deg, #991b1b, #dc2626)',
                boxShadow: '0 8px 24px -8px rgba(220, 38, 38, 0.55)',
              }}
            >
              <Phone className="w-5 h-5 shrink-0" strokeWidth={2.2} aria-hidden />
              התקשרות ל־101 — מגן דוד אדום
            </a>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">אזור בגוף (לדיווח למטפל)</label>
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
            <p className="text-xs font-bold text-slate-700 mb-2">סמנו מה רלוונטי לכם כרגע</p>
            <p className="text-[11px] text-slate-500 mb-2 leading-snug">תסמיני חירום (למעלה)</p>
            {renderCheckboxList(EMERGENCY_SYMPTOMS)}
            <p className="text-[11px] text-slate-500 mt-3 mb-2 leading-snug">תסמינים נוספים המחייבים התייעצות</p>
            {renderCheckboxList(OTHER_SYMPTOMS)}
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
