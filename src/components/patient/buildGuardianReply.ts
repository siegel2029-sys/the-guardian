import type { Patient } from '../../types';
import { bodyAreaLabels } from '../../types';

/** תשובות כלליות בעברית לפי הקשר המטופל (ללא API חיצוני) */
export function buildGuardianReply(question: string, patient: Patient, exerciseCount: number): string {
  const q = question.trim();
  const lower = q.toLowerCase();
  const hist = patient.analytics.painHistory;
  const lastPain = hist.length > 0 ? hist[hist.length - 1].painLevel : null;
  const avgPain =
    hist.length > 0
      ? Math.round((hist.reduce((s, r) => s + r.painLevel, 0) / hist.length) * 10) / 10
      : null;
  const areaLabel = bodyAreaLabels[patient.primaryBodyArea];

  const mentionsPain6 =
    /כאב\s*[6שש]|6\s*\/\s*10|כאב\s*של\s*שש|vas\s*6|pain\s*6/i.test(q) ||
    (lower.includes('כאב') && /\b6\b/.test(q));

  if (mentionsPain6) {
    return (
      'כאב ברמה 6 ומעלה נחשב בתוכנית שלנו כאב משמעותי. עצרו את התרגיל המעמיס, נוחו, ועדכנו את המטפל בהודעה או בדיווח הבא. ' +
      'אם הכאב חד, חזק מאוד, או מלווה בחולשה/חום/אובדן תחושה — פנו לרופא או למיון.'
    );
  }

  if (/דגל\s*אדום|red\s*flag|התראה|מסוכן/i.test(q) || (lower.includes('כאב') && /חמור|גבוה|10|תשע|שמונה|7\b/.test(q))) {
    return patient.hasRedFlag
      ? 'מסומן אצלכם דגל אדום בגלל דיווח אחרון עם כאב או קושי גבוהים. אל תגבירו עומס בלי אישור מטפל; שלחו הודעה או המתינו להנחיה.'
      : 'דגל אדום מופעל כשמדווחים כאב 6+ או קושי 4+ אחרי תרגיל. אם זה קורה — עצרו, דווחו, והמטפל יקבל התראה.';
  }

  if (/כמה\s*תרגיל|מה\s*להיום|אילו\s*תרגיל|רשימה|plan/i.test(lower) || (q.includes('תרגיל') && /מה|כמה|איך מתחיל/i.test(q))) {
    return exerciseCount === 0
      ? 'כרגע אין תרגילים פעילים בתוכנית — המטפל יכול להוסיף תרגילים ממסך הניהול.'
      : `להיום יש לכם ${exerciseCount} תרגילים בתוכנית. עברו על הרשימה למטה, פתחו כל תרגיל לווידאו והנחיות, וסמנו כבוצע אחרי דיווח הכאב והמאמץ.`;
  }

  if (/כאב|כואב|pain/i.test(q)) {
    if (lastPain != null) {
      return (
        `לפי הדיווח האחרון שלכם הכאב היה ${lastPain}/10` +
        (avgPain != null ? `, וממוצע כללי בערך ${avgPain}/10` : '') +
        `. אם הכאב עולה במהלך תרגיל — הפחיתו טווח או חזרות, ואם נשאר גבוה אחרי מנוחה — פנו למטפל. ` +
        `אזור העיקרי בתוכנית: ${areaLabel}.`
      );
    }
    return `עדיין אין דיווחי כאב אחרי תרגילים — אחרי הסימון «כבוצע» תוכלו לראות כאן מגמות. עד אז, עקבו אחרי הנחיות המטפל ואל תדחפו דרך כאב חד.`;
  }

  if (/חזרות|reps|סטים|sets|להגביר|להפחית|עומס/i.test(q)) {
    return (
      'שינוי חזרות או סטים מוצע לפעמים כהצעת AI אחרי ניתוח הדיווחים שלכם. אם מופיעה כרטיסיית הצעה למטה — אפשר לאשר או לדחות; ' +
      'אחרת אל תשנו לבד בלי תיאום עם המטפל.'
    );
  }

  if (/שלום|היי|מה\s*נשמע|עזרה|help/i.test(lower)) {
    return `שלום! אני עוזר Guardian לשאלות על כאב ותרגול בהקשר התוכנית שלכם (${areaLabel}). שאלו למשל על רמות כאב או מה לעשות אם משהו מכאיב במהלך תרגיל.`;
  }

  return (
    `לא בטוח שהבנתי את השאלה. לפי הנתונים שלכם: רמה ${patient.level}, ` +
    (lastPain != null ? `כאב אחרון ${lastPain}/10` : 'עדיין אין דיווח כאב אחרון') +
    `, ${exerciseCount} תרגילים היום. נסו לשאול על כאב (למשל «כאב 6»), על המשימות להיום, או על הצעות AI לחזרות.`
  );
}
