/**
 * סינון חירום קליני — כללים מבוססי מפתחות (לא LLM).
 * בטעות חיובית עדיפה על החמצת מצב מסכן חיים.
 */

export type EmergencySyndrome =
  | 'cauda_equina'
  | 'acute_coronary'
  | 'dvt'
  | 'stroke'
  | null;

export interface EmergencyScreenResult {
  isEmergency: boolean;
  syndrome: EmergencySyndrome;
  /** תווית קצרה לדשבורד (אנגלית קצרה) */
  reasonCode: string;
  /** הסבר קצר לצוות */
  reasonHebrew: string;
}

const NORMALIZE = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');

/** דפוסים: מחרוזת מנורמלת מכילה את אחת הקבוצות */
const PATTERNS: {
  syndrome: Exclude<EmergencySyndrome, null>;
  reasonCode: string;
  reasonHebrew: string;
  phrases: string[];
}[] = [
  {
    syndrome: 'cauda_equina',
    reasonCode: 'SUSPECTED_CAUDA_EQUINA',
    reasonHebrew: 'חשד לתסמונת סוס סוסה / דחיפות שתן–צואה / אובדן תחושה באזור אוכף',
    phrases: [
      'cauda equina',
      'saddle',
      'אוכף',
      'בריחת שתן',
      'בריחות שתן',
      'אובדן שליטה בשתן',
      'אובדן שליטה בצואה',
      'איבוד שליטה',
      'איבוד שליטה בשתן',
      'איבוד שליטה בצואה',
      'חוסר שליטה בשתן',
      'חוסר שליטה בצואה',
      'לא מצליח להחזיק שתן',
      'דליפת שתן',
      'דליפת צואה',
      'נימול במפשעה',
      'אין תחושה במפשעה',
      'תחושה במפשעה',
      'אנרגיה בשתייה',
      'שתרן',
      'שלשול בלתי נשלט',
      'כאב גב תחתון חד',
      'חולשה בשני הרגליים',
      'שתי רגליים חלשות',
    ],
  },
  {
    syndrome: 'acute_coronary',
    reasonCode: 'SUSPECTED_ACS',
    reasonHebrew: 'חשד לאירוע לב / כאב חזה עם קרינה',
    phrases: [
      'heart attack',
      'myocardial',
      'chest pain',
      'כאב חזה',
      'כאב בחזה',
      'לחץ בחזה',
      'דוחף בחזה',
      'מקרין לזרוע',
      'מקרין ליד',
      'כאב בזרוע שמאל',
      'כאב בזרוע ימין',
      'קוצר נשימה',
      'קוצר נשימה וכאב חזה',
      'זיעה קרה וחזה',
    ],
  },
  {
    syndrome: 'dvt',
    reasonCode: 'SUSPECTED_DVT',
    reasonHebrew: 'חשד לטרומבוזה ורידית / שוק נפוח וחם בצד אחד',
    phrases: [
      'dvt',
      'deep vein',
      'calf swelling',
      'שוק נפוח',
      'קרסול נפוח',
      'רגל נפוחה',
      'שוק חם',
      'רגל אחת נפוחה',
      'כאב בשוק',
      'אודם בשוק',
      'נפיחות בצד אחד',
    ],
  },
  {
    syndrome: 'stroke',
    reasonCode: 'SUSPECTED_STROKE',
    reasonHebrew: 'חשד לשבץ מוחי / חולשה פתאומית או דיבור מעורבב',
    phrases: [
      'stroke',
      'שבץ',
      'facial droop',
      'פנים צונחות',
      'חצי פנים',
      'לא מצליח לדבר',
      'דיבור מעורבב',
      'חולשה פתאומית',
      'חולשה בצד אחד',
      'חצי גוף חלש',
      'כפל בתמונה',
      'סחרחורת פתאומית חזקה',
      'חוסר יציבות פתאומי',
    ],
  },
];

export const EMERGENCY_STOP_MODAL_BODY =
  'עצור הכל! התסמינים שתיארת מחייבים בדיקה רפואית דחופה. אל תמשיך בתרגילים. אם מצבך מידרדר — התקשר למד״א.';

/**
 * סינון קלט טקסט (צ׳אט, הודעות, שדות חופשיים).
 */
export function screenPatientFreeTextForEmergency(raw: string): EmergencyScreenResult {
  const trimmed = raw.trim();
  if (trimmed.length < 6) {
    return { isEmergency: false, syndrome: null, reasonCode: '', reasonHebrew: '' };
  }
  const n = NORMALIZE(trimmed);

  for (const block of PATTERNS) {
    for (const phrase of block.phrases) {
      const p = NORMALIZE(phrase);
      if (p.length >= 3 && n.includes(p)) {
        return {
          isEmergency: true,
          syndrome: block.syndrome,
          reasonCode: block.reasonCode,
          reasonHebrew: block.reasonHebrew,
        };
      }
    }
  }

  return { isEmergency: false, syndrome: null, reasonCode: '', reasonHebrew: '' };
}

/** כאב דיווח ≥7 — טקסט להצגה למטופל + למטפל */
export const PAIN_SURGE_PATIENT_COPY =
  'נראה שהכאב גבוה מדי. עצור או הפחת מאמץ. המטפל קיבל התראה — הצעתי לו להוריד את העומס בכ־30% בתוכנית לאחר הערכה.';

export const DIFFICULTY_MAX_PATIENT_COPY =
  'דיווחת על מאמץ קשה מאוד. המטפל קיבל התראה — מומלץ להפחית חזרות או סטים עד לעדכון ממנו.';
