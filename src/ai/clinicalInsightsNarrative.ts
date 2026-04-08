/**
 * ניסוח אחיד: סיכום AI המצביע על הגרף + פעולות (ללא כפילות מול הנתונים המוצגים).
 */

import type { ClinicalInsightsAggregated, ClinicalDayPoint } from '../services/clinicalInsightsAggregation';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import { bodyAreaLabels } from '../types';

export type UnifiedClinicalNarrative = {
  graphAnchoredSummary: string;
  recommendedActions: string[];
};

function fmtPct(n: number): string {
  return `${Math.round(Math.abs(n))}%`;
}

function firstName(full: string): string {
  const p = full.trim().split(/\s+/);
  return p[0] ?? full;
}

function findExtremePainDay(series: ClinicalDayPoint[]): ClinicalDayPoint | null {
  let best: ClinicalDayPoint | null = null;
  for (const d of series) {
    if (d.pain == null) continue;
    if (!best || d.pain > (best.pain ?? -1)) best = d;
  }
  return best;
}

function findExtremeEffortDay(series: ClinicalDayPoint[]): ClinicalDayPoint | null {
  let best: ClinicalDayPoint | null = null;
  for (const d of series) {
    if (d.effort1to5 == null) continue;
    if (!best || d.effort1to5 > (best.effort1to5 ?? -1)) best = d;
  }
  return best;
}

/** מגמה ויזואלית בין חציון מוקדם למאוחר של נקודות הגרף (כאב בלבד) */
function painVisualTrend(series: ClinicalDayPoint[]): 'down' | 'up' | 'flat' | 'unknown' {
  const mid = Math.max(1, Math.floor(series.length / 2));
  const early = series.slice(0, mid).filter((d) => d.pain != null).map((d) => d.pain!);
  const late = series.slice(mid).filter((d) => d.pain != null).map((d) => d.pain!);
  if (early.length === 0 || late.length === 0) return 'unknown';
  const ae = early.reduce((a, b) => a + b, 0) / early.length;
  const al = late.reduce((a, b) => a + b, 0) / late.length;
  if (al < ae - 0.45) return 'down';
  if (al > ae + 0.45) return 'up';
  return 'flat';
}

export function buildUnifiedClinicalNarrative(
  agg: ClinicalInsightsAggregated,
  patientDisplayName: string,
  progressInsight: ClinicalProgressInsight | null
): UnifiedClinicalNarrative {
  const name = firstName(patientDisplayName);
  const areaLabel = bodyAreaLabels[agg.primaryBodyArea];
  const compliancePct =
    agg.compliance.rate != null ? Math.round(agg.compliance.rate * 100) : null;
  const pt = agg.painTrendPercent;
  const visual = painVisualTrend(agg.daySeries7);
  const maxPainDay = findExtremePainDay(agg.daySeries7);
  const maxEffDay = findExtremeEffortDay(agg.daySeries7);
  const sameDayPeak =
    maxPainDay &&
    maxEffDay &&
    maxPainDay.date === maxEffDay.date &&
    maxPainDay.pain != null &&
    maxPainDay.pain >= 5.5 &&
    maxEffDay.effort1to5 != null &&
    maxEffDay.effort1to5 >= 3.5;

  const effortAvg = agg.avgEffort1to5;

  const parts: string[] = [];
  parts.push(
    'בגרף למעלה מוצגים לאורך שבעת הימים הקליניים האחרונים שני מסלולים: כאב באזור המוקד (1–10) ומאמץ מדווח (1–5).'
  );

  const hasPainData = agg.daySeries7.some((d) => d.pain != null);
  const hasEffortData = agg.daySeries7.some((d) => d.effort1to5 != null);
  const hasPainRecords = agg.painRecordsLast7ClinicalDays.length > 0;

  if (!hasPainData && !hasEffortData) {
    parts.push(
      `כרגע אין מספיק נקודות בגרף כדי לנתח קורלציה עבור ${name} — עודדו דיווח אחרי אימונים כדי שהמסלולים יתמלאו.`
    );
  } else if (sameDayPeak && maxPainDay) {
    parts.push(
      `ניתן לראות בבירור שביום ${maxPainDay.weekdayHe} (${maxPainDay.label}) נרשמה נקודת שיא בכאב (${maxPainDay.pain!.toFixed(1)}/10) יחד עם מאמץ גבוה באותו יום (${maxEffDay!.effort1to5!.toFixed(1)}/5) — דפוס התואם עומס חריג או תגובה מאוחרת לאימון; כדאי לבחון מה בוצע באותו יום ואם יש צורך ברגרסיה זמנית.`
    );
  } else if (maxPainDay && maxPainDay.pain != null && maxPainDay.pain >= 6) {
    const effOnPeak =
      maxEffDay && maxEffDay.date === maxPainDay.date
        ? `מאמץ באותו יום: ${maxEffDay.effort1to5?.toFixed(1) ?? '—'}/5.`
        : maxEffDay
          ? `שיא המאמץ נרשם ב${maxEffDay.weekdayHe} (${maxEffDay.effort1to5?.toFixed(1)}/5), לא בהכרח באותו מועד כמו שיא הכאב.`
          : '';
    parts.push(
      `העקומה מדגישה את ${maxPainDay.weekdayHe} (${maxPainDay.label}) כנקודת כאב בולטת (${maxPainDay.pain.toFixed(1)}/10). ${effOnPeak}`
    );
  }

  const improvingRecord = pt != null && pt >= 8;
  const worseningRecord = pt != null && pt <= -8;
  const visDown = visual === 'down';
  const visUp = visual === 'up';

  if (hasPainData || hasPainRecords) {
    if (worseningRecord || visUp) {
      parts.push(
        pt != null
          ? `המסלול מראה החמרה: ממוצע הכאב ב${areaLabel} עלה בכ-${fmtPct(pt!)} ביחס לתחילת החלון.`
          : `הכאב בגרף עולה לכיוון ימים מאוחרים יותר בחלון.`
      );
      if (compliancePct != null) {
        parts.push(
          compliancePct >= 75
            ? `למרות עמידה גבוהה בתוכנית (כ-${compliancePct}%), העלייה בכאב מצביעה על אי-התאמה של עומס או טכניקה — לא על חוסר ביצוע.`
            : `עמידה של כ-${compliancePct}% מלמדת שייתכן גם פער התנהגותי; יש לשלב בירור עם בחינת פרוטוקול.`
        );
      }
    } else if (improvingRecord || (visDown && !worseningRecord)) {
      const complianceClause =
        compliancePct != null
          ? compliancePct >= 68
            ? `במקביל, שיעור העמידה בתוכנית בחלון היה כ-${compliancePct}% — כלומר ירידת הכאב מתרחשת כשהמטופל עדיין מבצע חלק ניכר מהנפח המתוכנן, ולא רק כתוצאה מ״הפחתת פעילות״ מלאה.`
            : `שיעור העמידה בתוכנית היה כ-${compliancePct}% — השיפור בכאב מגיע לצד השלמה חלקית יחסית; שקלו האם הנפח מתאים או שהמטופל מדווח על הקלה למרות פחות ביצועים.`
          : 'אין עדיין בסיס מלא לחישוב עמידה מול תוכנית — המשיכו לאסוף ימי קליניים עם תרגילים מתוכננים.';

      const effortClause =
        effortAvg != null
          ? `ממוצע המאמץ המדווח על פני הימים עם נתון עומד על כ-${effortAvg.toFixed(1)}/5 — ${effortAvg >= 4 ? 'רמת מאמץ גבוהה יחסית, כך שהמגמה בכאב כדאי שתיבחן גם מול איכות תנועה ומנוחה.' : 'מאמץ בינוני־נמוך יחסית, מה שמתיישב עם שיפור כאב ללא ״דחיפה״ קיצונית של עומס.'}`
          : '';

      const trendBit =
        pt != null
          ? `לפי דיווחי הכאב באזור ה${areaLabel}, הממוצע ירד בכ-${fmtPct(pt)} בין חלק מוקדם לחלק מאוחר של אותו חלון, כפי שניתן לעקוב אחרי צורת העקומה.`
          : `עקומת הכאב בגרף נוטה כלפי מטה לכיוון סוף השבוע הקליני.`;

      parts.push(`${trendBit} ${complianceClause} ${effortClause}`.trim());
    } else {
      parts.push(
        `מסלול הכאב בגרף יחסית שטוח באזור ה${areaLabel}; ${effortAvg != null && effortAvg >= 4 ? `ממוצע המאמץ (${effortAvg.toFixed(1)}/5) נשאר גבוה — ייתכן פלטו או צורך בשינוי משתנה תרגול.` : 'מומלץ להמשיך ולאסוף נקודות כדי להחליט אם מדובר בפלטו או בייצוב.'}`
      );
    }
  } else if (hasEffortData) {
    parts.push(
      effortAvg != null
        ? `בגרף מופיעים בעיקר נתוני מאמץ (ממוצע כ-${effortAvg.toFixed(1)}/5) ללא שכבת כאב — המשיכו לעודד דיווח כאב באזור ה${areaLabel} לאחר אימונים כדי לאפשר ניתוח משולב.`
        : 'יש נקודות מאמץ בגרף אך חסרה שכבת כאב — דיווח כאב יאפשר פרשנות קלינית מלאה יותר.'
    );
  }

  const extra: string[] = [];
  if (agg.offPlanSelfCareZones.length > 0) {
    const zones = agg.offPlanSelfCareZones.map((z) => bodyAreaLabels[z]).join(', ');
    extra.push(`מעבר לגרף: נבחרו באווטאר אזורי אימון עצמאי (${zones}) מחוץ למוקד התוכנית — שקלו התאמת הנחיה מול סיכון לייגוע.`);
  } else if (agg.offPlanSelfCareReportsLast7d.length > 0) {
    extra.push(
      'מעבר לגרף: רשומות self-care באזורים מחוץ למוקד התוכנית השבוע — כדאי לתאם ציפיות עם המטופל.'
    );
  }
  if (agg.highPainWithStrongCompliance) {
    extra.push(
      'מעבר לגרף: דפוס חריג של כאב מורגש לצד השלמה גבוהה מהתוכנית — ייתכן דחיפה מעבר לסובלנות או פער דיווח.'
    );
  }
  if (agg.highPainLowCompletionDays >= 2) {
    extra.push(
      `נרשמו ${agg.highPainLowCompletionDays} ימים עם כאב גבוה ושיעור השלמה נמוך — מתאים לבדיקת רגרסיה או חסם פעילות.`
    );
  }
  if (extra.length > 0) {
    parts.push(extra.join(' '));
  }

  const graphAnchoredSummary = parts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();

  const pool: string[] = [];
  if (progressInsight?.nextStepHe) {
    pool.push(progressInsight.nextStepHe);
  }
  if (agg.highPainWithStrongCompliance || agg.highPainLowCompletionDays >= 2) {
    pool.push('פתחו דיון קצר עם המטופל על התאמת עומס מול כאב בפועל, בהתבסס על המסלולים בגרף.');
  }
  if (agg.offPlanSelfCareZones.length > 0) {
    const zones = agg.offPlanSelfCareZones.map((z) => bodyAreaLabels[z]).join(', ');
    pool.push(`תאמו ציפיות לגבי אימון עצמאי באזורים: ${zones}.`);
  }
  if ((improvingRecord || visDown) && compliancePct != null && compliancePct >= 70 && agg.avgPain7dPrimary != null && agg.avgPain7dPrimary < 5) {
    pool.push('לאחר הערכה קלינית — ניתן לשקול העלאת עומס זהירה (כ־10–15%) במרכיב מרכזי בתוכנית.');
  }
  if (worseningRecord || visUp || (agg.avgPain7dPrimary != null && agg.avgPain7dPrimary >= 6)) {
    pool.push(`התמקדו בבירור כאב ב${areaLabel}, טכניקה ורגרסיה זמנית לפי הצורך.`);
  }
  pool.push('עדכנו הערות קליניות ועקבו אחרי 3–5 ימים נוספים לפני שינוי מהותי בפרוטוקול.');

  const seen = new Set<string>();
  const recommendedActions: string[] = [];
  for (const s of pool) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    recommendedActions.push(t);
    if (recommendedActions.length >= 3) break;
  }

  return { graphAnchoredSummary, recommendedActions };
}
