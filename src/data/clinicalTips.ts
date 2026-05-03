/** הקשר גוף לסינון טיפים (מנוע PHYSIOSHIELD) */
export type TipBodyContext =
  | 'knee'
  | 'shoulder'
  | 'back'
  | 'hip'
  | 'ankle'
  | 'neck'
  | 'general';

/** טיפים קליניים + קישור placeholder + הקשר לאזור גוף */
export interface ClinicalTip {
  id: string;
  headline: string;
  explanation: string;
  articleTitle: string;
  articleUrl: string;
  /** איזה אזורי גוף הטיפ הכי רלוונטי אליהם; אם חסר — נחשב כ-general */
  bodyContexts?: TipBodyContext[];
}

export const CLINICAL_TIPS: ClinicalTip[] = [
  {
    id: 'tip-knee-progressive',
    headline: 'שיקום ברך: העלאת עומס הדרגתית חשובה לאחר ניתוח או פציעה.',
    explanation:
      'לאחר פגיעה בברך, הגדלת טווח תנועה ועומס צריכה להיות מדורגת. כאב עולה עם הפחתה למנוחה — סימן להתאים את התוכנית עם המטפל.',
    articleTitle: 'עקרונות טעינה מחדש בברך — מדריך (placeholder)',
    articleUrl: 'https://example.com/research/knee-rehab-placeholder',
    bodyContexts: ['knee'],
  },
  {
    id: 'tip-knee-ice',
    headline: 'כאב ברך אחרי תרגול: קרירה קצרה יכולה לעזור בשלב החריף.',
    explanation:
      'קרח מקומי 10–15 דקות (עם הגנה על העור) לפעמים מפחית נפיחות. אם הכאב חזק או נמשך — זה לא מחליף בדיקה מקצועית.',
    articleTitle: 'ניהול דלקת עדינה אחרי מאמץ בברך (placeholder)',
    articleUrl: 'https://example.com/research/knee-ice-placeholder',
    bodyContexts: ['knee'],
  },
  {
    id: 'tip-shoulder-scapular',
    headline: 'כתף: יציבות שכמית נותנת בסיס לתנועה בטוחה.',
    explanation:
      'תרגילי שליטה בשכמה מקדימים לעיתים חיזוק ממוקד בכתף. איכות תנועה חשובה יותר ממספר חזרות בתחילת הדרך.',
    articleTitle: 'שליטה שכמית בשיקום כתף (placeholder)',
    articleUrl: 'https://example.com/research/shoulder-scapula-placeholder',
    bodyContexts: ['shoulder'],
  },
  {
    id: 'tip-shoulder-rom',
    headline: 'הגבלת טווח בכתף — לא לדחוף דרך כאב חד.',
    explanation:
      'אם תנועה מסוימת מעלה כאב חד, עצרו לפני הקצה הזה והמשיכו בתרגילים שמותרים בתוכנית. המטפל יכול להתאים טווח.',
    articleTitle: 'טווח תנועה וכאב בכתף (placeholder)',
    articleUrl: 'https://example.com/research/shoulder-rom-placeholder',
    bodyContexts: ['shoulder'],
  },
  {
    id: 'tip-back-neutral',
    headline: 'גב: שמירה על «ניטרל» בעומסים קטנים מפחיתה עומס על הדיסקים.',
    explanation:
      'בתרגילי ליבה רבים מומלץ לשמור עקירה עדינה ולא «לקרוע» את הגב. נשיפה בשיא המאמץ עוזרת לשליטה.',
    articleTitle: 'מנח גב תחתון בתרגול ביתי (placeholder)',
    articleUrl: 'https://example.com/research/back-neutral-placeholder',
    bodyContexts: ['back'],
  },
  {
    id: 'tip-hip-mobility',
    headline: 'ירך ומפרק ירך: תנועתיות לפני חיזוק.',
    explanation:
      'לעיתים משחררים מעט את מפרק הירך לפני עומס — זה יכול לשפר ביצוע בלי להגדיל כאב. התאימו לפי הנחיות המטפל.',
    articleTitle: 'Mobility לפני strength בירך (placeholder)',
    articleUrl: 'https://example.com/research/hip-mobility-placeholder',
    bodyContexts: ['hip'],
  },
  {
    id: 'tip-ankle-weight',
    headline: 'קרסול: העברת משקל הדרגתית אחרי חבלה.',
    explanation:
      'החזרה לעומס מלא על הקרסול נעשית בשלבים. כאב קבוע עם נפיחות — סימן לעצור ולהתייעץ.',
    articleTitle: 'Protocol טעינה בקרסול (placeholder)',
    articleUrl: 'https://example.com/research/ankle-loading-placeholder',
    bodyContexts: ['ankle'],
  },
  {
    id: 'tip-neck-posture',
    headline: 'צוואר: הפסקות מתיחה בעבודה ממושכת מול מסך.',
    explanation:
      'שינויי מבט והנמכת כתפיים לסירוגין מפחיתים עומס על הצוואר. התאימו תרגילי חיזוק רק לפי הנחיה.',
    articleTitle: 'Ergonomics וצוואר (placeholder)',
    articleUrl: 'https://example.com/research/neck-ergo-placeholder',
    bodyContexts: ['neck'],
  },
  {
    id: 'tip-warmup',
    headline: 'חימום קצר לפני תרגילים מפחית סיכון לפציעה.',
    explanation:
      'הגדלת זרימת הדם לשרירים משפרת גמישות ומוכנות לעומס. אפשר להתחיל ב־3–5 דקות תנועה קלה לפני התוכנית.',
    articleTitle: 'חימום דינמי לפני פעילות (placeholder)',
    articleUrl: 'https://example.com/research/warmup-placeholder',
    bodyContexts: ['general'],
  },
  {
    id: 'tip-pain-scale',
    headline: 'סולם כאב 0–10 עוזר למטפל להבין את המצב שלכם.',
    explanation:
      'דיווח עקבי אחרי כל תרגיל מאפשר לזהות מגמות. כאב חד או חריג לעומת הבסיס שלכם — כדאי לעצור ולפנות לייעוץ.',
    articleTitle: 'מדידת כאב ב-VAS בשיקום אורתופדי (placeholder)',
    articleUrl: 'https://example.com/research/vas-placeholder',
    bodyContexts: ['general'],
  },
  {
    id: 'tip-breathing',
    headline: 'נשימה רגועה בזמן מאמץ מפחיתה מתח ומתח שרירי.',
    explanation:
      'נשיפה ארוכה בשיא המאמץ נפוצה בשיקום. זה לא מחליף הנחיה מקצועית אם מופיעה קוצר נשימה או סחרחורת.',
    articleTitle: 'נשימה ושליטה במאמץ בפיזיותרפיה (placeholder)',
    articleUrl: 'https://example.com/research/breathing-placeholder',
    bodyContexts: ['general'],
  },
  {
    id: 'tip-consistency',
    headline: 'עקביות חשובה יותר מעוצמה ביום אחד.',
    explanation:
      'מספר חזרות מתונות כל יום בונה סבולת טובה מסט אחד קשה בשבוע. התאימו את העומס להנחיות המטפל.',
    articleTitle: 'תדירות מול עצימות בתרגול ביתי (placeholder)',
    articleUrl: 'https://example.com/research/consistency-placeholder',
    bodyContexts: ['general'],
  },
  {
    id: 'tip-sleep',
    headline: 'שינה טובה תומכת בשיקום וברגישות לכאב.',
    explanation:
      'חוסר שינה עלול להעלות את תחושת הכאב הגלויה. שמרו על שגרה סדירה והתייעצו עם רופא אם השינה מופרעת לאורך זמן.',
    articleTitle: 'שינה, כאב ושיקום — סקירה (placeholder)',
    articleUrl: 'https://example.com/research/sleep-pain-placeholder',
    bodyContexts: ['general'],
  },
  {
    id: 'tip-hydration',
    headline: 'שתייה מספקת משפרת ביצועי שריר ומפרקים.',
    explanation:
      'הידרציה תומכת בזרימת דם ובריכוך רקמות. במיוחד בימים עם תרגול — שתו מים לפני ואחרי הסשן.',
    articleTitle: 'הידרציה ופעילות גופנית בשיקום (placeholder)',
    articleUrl: 'https://example.com/research/hydration-placeholder',
    bodyContexts: ['general'],
  },
];
