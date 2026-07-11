import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, X, Phone } from 'lucide-react';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getTherapistAlertEmail, openClinicalMailto } from '../../utils/clinicalAlertEmail';
import { usePatient } from '../../context/PatientContext';

type SymptomItem = {
  id: string;
  /** כותרת תסמין — מוצגת ב־bold */
  title: string;
  /** הסבר + פעולה — מוצג במשקל רגיל */
  detail: string;
};

function symptomReportLabel(s: SymptomItem): string {
  return `${s.title} ${s.detail}`.trim();
}

/** סכנה מיידית – פנייה דחופה למיון (101) */
const EMERGENCY_SYMPTOMS: SymptomItem[] = [
  {
    id: 'saddle_anesthesia',
    title: 'חוסר תחושה או "הירדמות" חדשה באזור המפשעה והישבן:',
    detail:
      'תחושה של "הרדמה מקומית", או אובדן שליטה פתאומי על שתן וצואה. פעולה: חובה לעצור מיד ולפנות לחדר מיון.',
  },
  {
    id: 'drop_foot_collapse',
    title: 'חולשה מוטורית פתאומית ומשמעותית:',
    detail:
      'חוסר יכולת פתאומית להרים את כף הרגל מהרצפה (Drop Foot) או "קריסה" פתאומית וחדשה של הברך/הרגל ללא התראה. פעולה: פנייה מיידית למיון / בדיקת רופא.',
  },
  {
    id: 'neuro_systemic',
    title: 'כאב המלווה בסחרחורת קשה, בחילה גוברת או ראייה כפולה:',
    detail:
      'קושי בדיבור/בליעה (במיוחד לאחר תנועות צוואר). פעולה: פנייה מיידית לחדר מיון.',
  },
  {
    id: 'chest_breath',
    title: 'כאב לוחץ או שורף בחזה, קוצר נשימה חריג או הזעה קרה:',
    detail: 'מופיע בזמן התרגול ולא חולף במנוחה. פעולה: התקשרות מיידית למד"א (101).',
  },
  {
    id: 'dvt_calf',
    title: 'נפיחות אדומית, חמה, נוקשה וכואבת מאוד בשוק של רגל אחת:',
    detail: 'פעולה: פנייה דחופה לרופא/מיון (לשלילת פקק דם בווריד).',
  },
  {
    id: 'extreme_sudden_other',
    title: 'כל תסמין קיצוני או חריג המופיע בפתאומיות:',
    detail:
      'כל תחושה קשה, כאב עז או שינוי גופני מהיר שאינו מופיע ברשימה ומקשה על התפקוד הרגיל או על ההתנהלות. פעולה: לעצור את התרגול מיד ולפנות לבירור רפואי או למוקד חירום בהתאם לחומרת המצב.',
  },
];

/** אזהרת שיקום – עצור את התרגול ופנה למטפל/רופא */
const OTHER_SYMPTOMS: SymptomItem[] = [
  {
    id: 'night_pain',
    title: 'כאב לילי חדש וקבוע:',
    detail:
      'כאב חזק ופועם שאינו משתנה בשום תנוחה שבה שוכבים, ומעיר באופן קבוע משינה. פעולה: להפסיק תרגול ולפנות לבירור מול הפיזיותרפיסט או הרופא המטפל.',
  },
  {
    id: 'limb_color_temp',
    title: 'שינוי קיצוני בצבע או בטמפרטורה של הגפה:',
    detail:
      'הגפה המטופלת הופכת פתאום לחיוורת מאוד, כחולה, או קרה באופן משמעותי בהשוואה לצד השני. פעולה: פנייה לרופא לשלילת בעיה באספקת הדם.',
  },
  {
    id: 'fever_chills',
    title: 'כאב חדש המלווה בחום גוף וצמרמורות:',
    detail:
      'עליית חום ללא הסבר (ללא מחלת רקע או שפעת) יחד עם כאב במפרק/שריר. פעולה: בדיקה רפואית לשלילת זיהום.',
  },
  {
    id: 'severe_pain_unrelieved',
    title: 'כאב חד וגובר בעוצמה גבוהה (8/10 ומעלה) שלא נרגע:',
    detail:
      'כאב חריג שמופיע בתרגיל ולא שוכך גם לאחר 30 דקות של מנוחה מוחלטת. פעולה: לעצור את התוכנית ולעדכן את הפיזיותרפיסט.',
  },
  {
    id: 'true_mechanical_lock',
    title: 'נעילה מכאנית אמיתית של המפרק:',
    detail:
      'מצב חדש בו המפרק נתקע לחלוטין ואין אפשרות ליישר או לכופף אותו לא בכוח ולא בשחרור. פעולה: לא להפעיל כוח! לפנות לבדיקה.',
  },
];

const ALL_SYMPTOMS = [...EMERGENCY_SYMPTOMS, ...OTHER_SYMPTOMS];
const ALL_SYMPTOM_IDS = ALL_SYMPTOMS.map((s) => s.id);

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
  /** אזור פעיל נוכחי — נשלח בדוח ללא בחירה ידנית */
  defaultBodyArea?: BodyArea | null;
}) {
  const { reportPatientUrgentRedFlag } = usePatient();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked({});
    setFreeText('');
  }, [open]);

  const areaLabel =
    defaultBodyArea && bodyAreaLabels[defaultBodyArea]
      ? bodyAreaLabels[defaultBodyArea]
      : 'לא צוין';

  const symptomLine = useMemo(() => {
    const fromBoxes = ALL_SYMPTOM_IDS.filter((id) => picked[id]).map((id) => {
      const hit = ALL_SYMPTOMS.find((s) => s.id === id);
      return hit ? symptomReportLabel(hit) : id;
    });
    const extra = freeText.trim();
    const parts = [...fromBoxes, ...(extra ? [extra] : [])];
    return parts.length > 0 ? parts.join('; ') : 'לא סומנו תסמינים ספציפיים';
  }, [picked, freeText]);

  if (!open) return null;

  const submit = () => {
    const to = getTherapistAlertEmail(therapistId);
    const subject = `[PHYSIOSHIELD] דגל אדום דחוף — ${patientName}`;
    const body =
      `דגל אדום דחוף מהפורטל\n\n` +
      `מטופל: ${patientName}\n` +
      `אזור: ${areaLabel}\n` +
      `תסמינים: ${symptomLine}\n\n` +
      `נא ליצור קשר בהקדם.\n` +
      `(הודעה נשלחה דרך דוא״ל — ללא חשיפת מספר טלפון אישי)`;
    openClinicalMailto(to, subject, body);
    const portalLine = `[דגל אדום — דוא״ל למטפל]\nאזור: ${areaLabel}\nתסמינים: ${symptomLine}`;
    reportPatientUrgentRedFlag(patientId, portalLine);
    onClose();
  };

  const toggle = (id: string) => {
    setPicked((p) => ({ ...p, [id]: !p[id] }));
  };

  const renderCheckboxList = (items: SymptomItem[]) => (
    <ul className="space-y-3">
      {items.map((s) => (
        <li key={s.id}>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!picked[s.id]}
              onChange={() => toggle(s.id)}
              className="mt-1 rounded border-red-300 text-red-600 focus:ring-red-500 shrink-0"
              aria-label={s.title}
            />
            <span className="text-sm leading-snug">
              <span className="font-bold text-gray-900">{s.title} </span>
              <span className="text-gray-600 font-normal">{s.detail}</span>
            </span>
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
            <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.4} aria-hidden="true" />
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
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0 space-y-4 text-sm text-slate-800">
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3"
            role="note"
            aria-label="הבהרה חשובה לגבי דגלים אדומים"
          >
            <p className="text-xs text-amber-950 leading-relaxed font-bold">
              ⚠️ שים לב: הסימנים הבאים מהווים &apos;דגל אדום&apos; אך ורק אם מדובר בתסמינים חדשים,
              פתאומיים, או כאלו שאינם מוכרים לך מתוכנית הטיפול והשיקום הנוכחית שלך. אם הופיע תסמין
              חדש וחריג שלא חווית בעבר, יש לפעול לפי ההנחיות הבאות:
            </p>
          </div>

          <div
            className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-3 space-y-3"
            role="group"
            aria-labelledby="redflag-cat1-title"
          >
            <p id="redflag-cat1-title" className="text-[11px] font-black tracking-wide text-red-900">
              סכנה מיידית – פנייה דחופה למיון (101)
            </p>
            {renderCheckboxList(EMERGENCY_SYMPTOMS)}
          </div>

          <div
            className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3 space-y-3"
            role="group"
            aria-labelledby="redflag-cat2-title"
          >
            <p id="redflag-cat2-title" className="text-[11px] font-black tracking-wide text-amber-950">
              אזהרת שיקום – עצור את התרגול ופנה למטפל/רופא
            </p>
            {renderCheckboxList(OTHER_SYMPTOMS)}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="redflag-notes">
              הערות נוספות (אופציונלי)
            </label>
            <textarea
              id="redflag-notes"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none"
              placeholder="למשל: מתי התחיל, מה מחמיר…"
            />
          </div>
        </div>

        <div className="shrink-0 p-4 bg-white border-t border-gray-100 flex flex-col gap-2">
          <a
            href="tel:101"
            className="w-full py-3.5 rounded-2xl font-black text-sm sm:text-base text-center text-white shadow-md flex items-center justify-center gap-2 no-underline"
            style={{
              background: 'linear-gradient(135deg, #991b1b, #dc2626)',
              boxShadow: '0 8px 24px -8px rgba(220, 38, 38, 0.55)',
            }}
          >
            <Phone className="w-5 h-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            התקשרות ל־101 — מגן דוד אדום
          </a>
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
