import type { BodyArea } from '../types';
import { bodyAreaLabels } from '../types';
import { getChainReactionZones } from '../body/chainReactionZones';

export interface ClinicalIntakeAdvice {
  protocolHe: string;
  exercisesHintHe: string;
  differentialHe: string;
  furtherTestsHe: string;
  chainZones: BodyArea[];
  chainWarningHe: string;
}

const PROTOCOLS: Partial<Record<BodyArea, Omit<ClinicalIntakeAdvice, 'chainZones' | 'chainWarningHe'>>> = {
  shoulder_right: {
    protocolHe:
      'פרוטוקול כתף: שלב חומרה → טווח תנועה סימטרי → ייצוב שרירי חוגר שכמי → התקדמות עומס מבוקרת.',
    exercisesHintHe:
      'התמקדו בתרגילי חיזוק רוטטור קאף, דחיפת חזה קלה, ומתיחות עדינות לפני עומס.',
    differentialHe:
      'הבחנה: תסמונת שקיעה לעומת דלקת בורסה, נקע AC, מחלת צוואר מופנית — לשאול על חרדות לילה וחולשה.',
    furtherTestsHe:
      'בדיקות להמלצה: נייטרליית Jobe / Hawkins, בדיקת Spurling אם כאב צווארי, הדמיה לפי סימפטומים.',
  },
  shoulder_left: {
    protocolHe:
      'פרוטוקול כתף: שלב חומרה → טווח תנועה סימטרי → ייצוב שרירי חוגר שכמי → התקדמות עומס מבוקרת.',
    exercisesHintHe:
      'התמקדו בתרגילי חיזוק רוטטור קאף, דחיפת חזה קלה, ומתיחות עדינות לפני עומס.',
    differentialHe:
      'הבחנה: תסמונת שקיעה לעומת דלקת בורסה, נקע AC, מחלת צוואר מופנית — לשאול על חרדות לילה וחולשה.',
    furtherTestsHe:
      'בדיקות להמלצה: נייטרליית Jobe / Hawkins, בדיקת Spurling אם כאב צווארי, הדמיה לפי סימפטומים.',
  },
  knee_right: {
    protocolHe: 'פרוטוקול ברך: שלב נפח וכאב → יציבות → שרשרת ירך–שוק → ריצה/קפיצה רק בסוף.',
    exercisesHintHe: 'VMO, סקוואט חלקי, לנג׳ים, יציבות על רגל אחת — בהדרגה.',
    differentialHe: 'הבחנה: מניסקוס מול PFPS מול ACL — היסטוריית פיבול, נעילה, נפיחות.',
    furtherTestsHe: 'Thessaly, drawer, Lachman, הליכה במדרגות — הדמיה לפי חשד.',
  },
  knee_left: {
    protocolHe: 'פרוטוקול ברך: שלב נפח וכאב → יציבות → שרשרת ירך–שוק → ריצה/קפיצה רק בסוף.',
    exercisesHintHe: 'VMO, סקוואט חלקי, לנג׳ים, יציבות על רגל אחת — בהדרגה.',
    differentialHe: 'הבחנה: מניסקוס מול PFPS מול ACL — היסטוריית פיבול, נעילה, נפיחות.',
    furtherTestsHe: 'Thessaly, drawer, Lachman, הדמיה לפי חשד.',
  },
  back_lower: {
    protocolHe: 'פרוטוקול גב תחתון: עקרונות מודעות לעומס, ליבה, היפ הינג׳, הימנעות מכפיפות מוקדמות.',
    exercisesHintHe: 'ציפור–כלב, גשר, dead bug, הליכה — לפני מתיחות אגרסיביות.',
    differentialHe: 'הבחנה: רדיקולופתיה מול מקור מפרקי–שרירי, סיכומי סקרינינג דגלים אדומים.',
    furtherTestsHe: 'SLR, מבחן פאסיבי ירך, בדיקת עצב שורש לפי צורך.',
  },
  neck: {
    protocolHe: 'פרוטוקול צוואר: טווח תנועה עדין, חיזוק מיישרים, ארגונומיה, ללא טרקציה עצמית אגרסיבית.',
    exercisesHintHe: 'סחיטות עדינות, חיזוק עמוק צווארי, יציבות כתפיים.',
    differentialHe: 'הבחנה: מקור צווארי מול כתף, חרדה, ורטיגו — דגלים עצביים.',
    furtherTestsHe: 'Spurling בזהירות, בדיקת עצבים, הדמיה לפי חשד.',
  },
};

const DEFAULT_ADVICE: Omit<ClinicalIntakeAdvice, 'chainZones' | 'chainWarningHe'> = {
  protocolHe:
    'פרוטוקול כללי: שלב חומרה → טווח תנועה בטוח → חיזוק איזומטרי → התקדמות עומס בהדרגה.',
  exercisesHintHe: 'בחרו מתוך הספרייה תרגילים שמכוונים לאזור המוקד; הימנעו מכאב חד בזמן ביצוע.',
  differentialHe:
    'שקלו מקור ראשוני מול משני (שרשרת קינמטית), דלקת, נזק מבני — לפי אנמנזה וסימנים אדומים.',
  furtherTestsHe: 'התאימו בדיקות קליניות והדמיה לפי פרוטוקול המוסד והחשד.',
};

export function getClinicalIntakeAdvice(primary: BodyArea): ClinicalIntakeAdvice {
  const base = PROTOCOLS[primary] ?? DEFAULT_ADVICE;
  const chainZones = getChainReactionZones(primary);
  const labels = chainZones.map((z) => bodyAreaLabels[z]).join(' · ');
  return {
    ...base,
    chainZones,
    chainWarningHe: labels
      ? `שים לב לתגובה באזורים אלו (שרשרת אפשרית ל־${bodyAreaLabels[primary]}): ${labels}.`
      : `שים לב לתגובה באזורים סמוכים ל־${bodyAreaLabels[primary]}.`,
  };
}
