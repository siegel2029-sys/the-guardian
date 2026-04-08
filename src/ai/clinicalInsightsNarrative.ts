/**
 * ניסוח תובנות קליניות בעברית מנתונים מצטברים (ללא LLM חיצוני).
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import { bodyAreaLabels } from '../types';

export type ClinicalInsightsNarrative = {
  trendParagraph: string;
  selfCareAlerts: string[];
  redFlags: string[];
  recommendedActions: string[];
};

function fmtPct(n: number): string {
  return `${Math.round(Math.abs(n))}%`;
}

export function buildClinicalInsightsNarrative(
  agg: ClinicalInsightsAggregated,
  patientFirstName: string
): ClinicalInsightsNarrative {
  const areaLabel = bodyAreaLabels[agg.primaryBodyArea];
  const compliancePct =
    agg.compliance.rate != null ? Math.round(agg.compliance.rate * 100) : null;
  const effort = agg.avgEffortVas7d;

  let trendParagraph: string;
  const pt = agg.painTrendPercent;
  const improving = pt != null && pt >= 8;
  const worsening = pt != null && pt <= -8;
  const plateau =
    pt != null && pt > -8 && pt < 8;

  if (agg.painRecordsLast7ClinicalDays.length === 0 && (effort == null || Number.isNaN(effort))) {
    trendParagraph = `ל${patientFirstName} אין עדיין מספיק דיווחי כאב ומאמץ בחלון השבוע האחרון כדי לחשב מגמה אמינה. עודדו דיווח עקבי אחרי אימונים.`;
  } else if (improving) {
    const painBit =
      pt != null
        ? `ממוצע הכאב באזור ה${areaLabel} ירד בכ-${fmtPct(pt)} ביחס לתחילת החלון.`
        : `מגמת הכאב באזור ה${areaLabel} משתפרת.`;
    const effortBit =
      effort != null && effort >= 6.5
        ? ' לצד זה, דירוג המאמץ נשאר גבוה — כדאי לוודא שהעומס תואם את הסובלנות.'
        : effort != null && effort <= 4
          ? ' המאמץ המדווח נשאר בינוני־נמוך — התאמה סבירה לשלב התאוששות.'
          : '';
    trendParagraph = `${painBit}${effortBit}`;
  } else if (worsening) {
    trendParagraph = `בחלון 7 הימים האחרונים נרשמה עלייה של כ-${fmtPct(pt!)} בממוצע הכאב באזור ה${areaLabel}. מומלץ לבחון עומס, טכניקה והידבקות לתוכנית לפני העלאת נפח.`;
  } else if (plateau && effort != null && effort >= 6) {
    trendParagraph = `הכאב באזור ה${areaLabel} יציב יחסית (שינוי קטן בלבד), אך המאמץ המדווח נשאר גבוה — ייתכן פלטו או צורך בהתאמת משתני תרגול.`;
  } else if (plateau) {
    trendParagraph = `מגמת כאב באזור ה${areaLabel} שטוחה יחסית בשבוע האחרון; המשיכו במעקב צמוד לדיווחים כדי להחליט על צעד הבא.`;
  } else {
    trendParagraph = `הנתונים בחלון האחרון מצביעים על שילוב של כאב ומאמץ שדורש מעקב שגרתי באזור ה${areaLabel}.`;
  }

  const selfCareAlerts: string[] = [];
  for (const z of agg.offPlanSelfCareZones) {
    selfCareAlerts.push(
      `זוהה אימון עצמאי באזור ${bodyAreaLabels[z]} (נבחר ב-Avatar) שאינו חלק ממוקד התוכנית — בדקו עומס והימנעות מייגוע יתר.`
    );
  }
  if (agg.offPlanSelfCareReportsLast7d.length > 0 && agg.offPlanSelfCareZones.length === 0) {
    selfCareAlerts.push(
      'בוצעו תרגילי כוח עצמאיים באזורים שמחוץ למוקד התוכנית השבוע — וודאו התאמה קלינית ותעדו בהערכה.'
    );
  }

  const redFlags: string[] = [];
  if (agg.highPainWithStrongCompliance) {
    redFlags.push(
      'אי-עקביות פוטנציאלית: ממוצע כאב מורגש לצד שיעור השלמה גבוה מהתוכנית — ייתכן שהמטופל דוחף מעבר לסובלנות או שקיים פער בדיווח.'
    );
  }
  if (agg.highPainLowCompletionDays >= 2) {
    redFlags.push(
      `נרשמו ${agg.highPainLowCompletionDays} ימים עם כאב גבוה (≥7) לצד השלמה נמוכה — שקלו רגרסיה זמנית או בירור סיבתי.`
    );
  }
  if (
    compliancePct != null &&
    compliancePct < 42 &&
    agg.avgPain7dPrimary != null &&
    agg.avgPain7dPrimary >= 6
  ) {
    redFlags.push(
      'עמידה נמוכה בתוכנית יחד עם כאב ממוצע גבוה — חשוב לבחון חסמים, פחד מפעילות או צורך בהתאמת יעדים.'
    );
  }

  const pool: string[] = [];
  if (redFlags.length > 0) {
    pool.push('פתחו שיחה קצרה עם המטופל על התאמת עומס מול דיווחי כאב בפועל.');
  }
  if (agg.offPlanSelfCareZones.length > 0) {
    const zones = agg.offPlanSelfCareZones.map((z) => bodyAreaLabels[z]).join(', ');
    pool.push(`תאמו ציפיות לגבי אימון עצמאי באזורים: ${zones}.`);
  }
  if (
    improving &&
    compliancePct != null &&
    compliancePct >= 70 &&
    agg.avgPain7dPrimary != null &&
    agg.avgPain7dPrimary < 5
  ) {
    pool.push('ניתן לשקול, לאחר הערכה, העלאת עוצמה זהירה בתרגיל המרכזי בתוכנית (חזרות או עומס של כ־10–15%).');
  }
  if (worsening || (agg.avgPain7dPrimary != null && agg.avgPain7dPrimary >= 6)) {
    pool.push(`שאלו במפורש על כאב ב${areaLabel} והפנו לבדיקת טכניקה או רגרסיה זמנית.`);
  }
  pool.push('המשיכו לעדכן הערות קליניות לפי דיווחי המטופל בצ׳אט המהיר.');
  pool.push('עקבו אחרי המשך 3–5 ימי קליניים כדי לאשר כיוון טיפולי.');
  pool.push('שמרו על תדירות דיווח אחרי כל אימון.');

  const seen = new Set<string>();
  const recommendedActions: string[] = [];
  for (const s of pool) {
    if (seen.has(s)) continue;
    seen.add(s);
    recommendedActions.push(s);
    if (recommendedActions.length >= 3) break;
  }

  return {
    trendParagraph,
    selfCareAlerts,
    redFlags,
    recommendedActions,
  };
}
