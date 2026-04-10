import type { Patient, PatientExercise } from '../../types';
import { bodyAreaLabels } from '../../types';
import {
  analyzePatientProgress,
  buildPatientProgressPayload,
  detectExerciseChangeIntent,
  evaluateExerciseChangeRequest,
} from '../../ai/patientProgressReasoning';

export type GuardianPendingOffer = {
  exerciseId: string;
  exerciseName: string;
  fromReps: number;
  toReps: number;
};

export type GuardianTherapistAlert = {
  detailHebrew?: string;
};

/** תשובה ל«איך אני מתקדם?» לפי כאב באזור העיקרי + רצף */
export function buildProgressAnswer(patient: Patient): string {
  const area = patient.primaryBodyArea;
  const areaLabel = bodyAreaLabels[area];
  const records = patient.analytics.painHistory.filter((r) => r.bodyArea === area);
  const streak = patient.currentStreak;

  if (records.length < 2) {
    return `יש לך רצף של ${streak} ימים עם תרגול — כל הכבוד! כשייצברו עוד דיווחי כאב ב${areaLabel}, אוכל לתאר מגמה מדויקת יותר.`;
  }

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeekAgo = new Date(now);
  twoWeekAgo.setDate(twoWeekAgo.getDate() - 14);

  const thisWeek = records.filter((r) => new Date(r.date) >= weekAgo);
  const prevWeek = records.filter(
    (r) => new Date(r.date) >= twoWeekAgo && new Date(r.date) < weekAgo
  );

  const avg = (arr: typeof records) =>
    arr.length === 0 ? null : arr.reduce((s, r) => s + r.painLevel, 0) / arr.length;

  const a1 = avg(thisWeek);
  const a0 = avg(prevWeek);

  if (a1 != null && a0 != null && a0 > 0) {
    const pct = Math.round((1 - a1 / a0) * 100);
    if (pct >= 15) {
      return `אני רואה שרמת הכאב שלך ב${areaLabel} ירדה ב-${pct}% השבוע, כל הכבוד! הרצף הנוכחי שלך: ${streak} ימים.`;
    }
    if (pct <= -10) {
      return `השבוע דיווחי הכאב ב${areaLabel} גבוהים יותר מהשבוע שעבר. כדאי להתאים עומס או לפנות למטפל. רצף תרגול: ${streak} ימים.`;
    }
  }

  const overall = records.length
    ? records.reduce((s, r) => s + r.painLevel, 0) / records.length
    : null;
  return `לפי הדיווחים באזור ${areaLabel}, הממוצע כ-${overall?.toFixed(1) ?? '—'}/10. רצף תרגול: ${streak} ימים — המשיכו בעקביות!`;
}

/** קושי מדווח < 2 בכל אחד מ־3 ימי האימון האחרונים → תרגיל עם חזרות מתאים */
export function getTooEasyExerciseOffer(
  patient: Patient,
  exercises: PatientExercise[]
): GuardianPendingOffer | null {
  const sh = patient.analytics.sessionHistory;
  if (sh.length < 3) return null;
  const last3 = sh.slice(-3);
  if (!last3.every((s) => s.difficultyRating < 2)) return null;

  const ex = exercises.find(
    (e) => (e.patientReps ?? 0) > 0 && (e.patientReps ?? 0) < 20 && !e.holdSeconds
  );
  if (!ex) return null;

  return {
    exerciseId: ex.id,
    exerciseName: ex.name,
    fromReps: ex.patientReps,
    toReps: 20,
  };
}

export function isGuardianOfferConfirmation(text: string): boolean {
  const t = text.trim();
  return /^(כן|בטח|בהחלט|שלח|כן\s*בבקשה|יאללה|אוקי|ok|yes)\b/i.test(t);
}

export type GuardianTurnResult = {
  reply: string;
  offer: GuardianPendingOffer | null;
  sendTherapistClinicalAlert?: GuardianTherapistAlert;
};

/**
 * סיבוב שיחה — משתמש ב-analyzePatientProgress כבקר עליון לפני המלצות עומס.
 */
export function buildGuardianTurn(
  question: string,
  patient: Patient,
  exerciseCount: number,
  exercises: PatientExercise[]
): GuardianTurnResult {
  const q = question.trim();
  const lower = q.toLowerCase();
  const hist = patient.analytics.painHistory;
  const lastPain = hist.length > 0 ? hist[hist.length - 1].painLevel : null;
  const avgPain =
    hist.length > 0
      ? Math.round((hist.reduce((s, r) => s + r.painLevel, 0) / hist.length) * 10) / 10
      : null;
  const areaLabel = bodyAreaLabels[patient.primaryBodyArea];

  const payload = buildPatientProgressPayload(patient, exercises);
  const analysis = analyzePatientProgress(payload);

  const handleExerciseChangeIntent = (): GuardianTurnResult => {
    const ev = evaluateExerciseChangeRequest(analysis, 'בקשה לשינוי בעומס או בתרגול');
    if (!ev.permitted) {
      return {
        reply: ev.patientMessageHebrew,
        offer: null,
        sendTherapistClinicalAlert: ev.fireTherapistAlert
          ? { detailHebrew: analysis.therapistAlertDetailHebrew }
          : undefined,
      };
    }
    return {
      reply:
        'לפי הניתוח שלי על הדיווחים האחרונים, אין סימן מיידי שמונע התקדמות — עדיין חובה לאשר כל שינוי עם המטפל. אפשר לשלוח בקשה דרך כפתורי ההצעה למטה או לשאול אותי שוב אחרי עוד דיווחים.',
      offer: null,
    };
  };

  const easyOffer = analysis.allowExerciseLoadIncrease ? getTooEasyExerciseOffer(patient, exercises) : null;

  const appendReasoning = (base: string): string =>
    `${base}\n\n(ניתוח קצר: ${analysis.relationshipSummaryHebrew})`;

  const appendEasy = (base: string): GuardianTurnResult => {
    if (!easyOffer) return { reply: appendReasoning(base), offer: null };
    const extra = `\n\nנראה שהתרגיל «${easyOffer.exerciseName}» קל יחסית (דיווח קושי נמוך ב־3 הימים האחרונים). הצעתי למטפל שלך להעלות ל־${easyOffer.toReps} חזרות. רוצה שאשלח לו בקשה?`;
    return { reply: appendReasoning(base) + extra, offer: easyOffer };
  };

  if (/איך\s*אני\s*מתקדמ|איך\s*מתקדמים|התקדמות\s*שלי|איך\s*התקדמות/i.test(q)) {
    return appendEasy(buildProgressAnswer(patient));
  }

  if (detectExerciseChangeIntent(q)) {
    return handleExerciseChangeIntent();
  }

  const mentionsPain6 =
    /כאב\s*[6שש]|6\s*\/\s*10|כאב\s*של\s*שש|vas\s*6|pain\s*6/i.test(q) ||
    (lower.includes('כאב') && /\b6\b/.test(q));

  if (mentionsPain6) {
    return {
      reply:
        'כאב ברמה 6 ומעלה נחשב בתוכנית שלנו כאב משמעותי. עצרו את התרגיל המעמיס, נוחו, ועדכנו את המטפל בהודעה או בדיווח הבא. ' +
        'אם הכאב חד, חזק מאוד, או מלווה בחולשה/חום/אובדן תחושה — פנו לרופא או למיון.',
      offer: null,
    };
  }

  if (/דגל\s*אדום|red\s*flag|התראה|מסוכן/i.test(q) || (lower.includes('כאב') && /חמור|גבוה|10|תשע|שמונה|7\b/.test(q))) {
    return {
      reply: patient.hasRedFlag
        ? 'מסומן אצלכם דגל אדום בגלל דיווח אחרון עם כאב או קושי גבוהים. אל תגבירו עומס בלי אישור מטפל; שלחו הודעה או המתינו להנחיה.'
        : 'דגל אדום מופעל כשמדווחים כאב 6+ או קושי 4+ אחרי תרגיל. אם זה קורה — עצרו, דווחו, והמטפל יקבל התראה.',
      offer: null,
    };
  }

  if (/כמה\s*תרגיל|מה\s*להיום|אילו\s*תרגיל|רשימה|plan/i.test(lower) || (q.includes('תרגיל') && /מה|כמה|איך מתחיל/i.test(q))) {
    const base =
      exerciseCount === 0
        ? 'כרגע אין תרגילים פעילים בתוכנית — המטפל יכול להוסיף תרגילים ממסך הניהול.'
        : `להיום יש לכם ${exerciseCount} תרגילים בתוכנית. עברו על הרשימה למטה, פתחו כל תרגיל לווידאו והנחיות, וסמנו כבוצע אחרי דיווח הכאב והמאמץ.`;
    return appendEasy(base);
  }

  if (/קל\s*לי|קלים|עומס\s*נמוך|לא\s*מאתגר/i.test(q)) {
    if (easyOffer) {
      const ev = evaluateExerciseChangeRequest(analysis, 'המטופל מרגיש שהתרגילים קלים');
      if (!ev.permitted) {
        return {
          reply: `${ev.patientMessageHebrew}\n\nלמרות התחושה שהכול «קל», הנתונים על הכאב לא תומכים כרגע בהגדלת עומס אוטומטית.`,
          offer: null,
          sendTherapistClinicalAlert: ev.fireTherapistAlert
            ? { detailHebrew: analysis.therapistAlertDetailHebrew }
            : undefined,
        };
      }
      return {
        reply:
          `לפי הדיווחים, נראה שהתרגיל «${easyOffer.exerciseName}» קטן עליך. הצעתי למטפל שלך להעלות ל־${easyOffer.toReps} חזרות. רוצה שאשלח לו בקשה?`,
        offer: easyOffer,
      };
    }
    return {
      reply: appendReasoning(
        'אם התרגילים מרגישים קלים אבל אין הצעת AI ספציפית, עדיין חשוב לאשר שינוי עם המטפל — הוא ישווה לניתוח הכאב שלך.'
      ),
      offer: null,
    };
  }

  if (/כאב|כואב|pain/i.test(q)) {
    if (lastPain != null) {
      return {
        reply: appendReasoning(
          `לפי הדיווח האחרון שלכם הכאב היה ${lastPain}/10` +
            (avgPain != null ? `, וממוצע כללי בערך ${avgPain}/10` : '') +
            `. אם הכאב עולה במהלך תרגיל — הפחיתו טווח או חזרות, ואם נשאר גבוה אחרי מנוחה — פנו למטפל. ` +
            `אזור העיקרי בתוכנית: ${areaLabel}.`
        ),
        offer: null,
      };
    }
    return {
      reply:
        'עדיין אין דיווחי כאב אחרי תרגילים — אחרי הסימון «כבוצע» תוכלו לראות כאן מגמות. עד אז, עקבו אחרי הנחיות המטפל ואל תדחפו דרך כאב חד.',
      offer: null,
    };
  }

  if (/חזרות|reps|סטים|sets|להגביר|להפחית|עומס/i.test(q)) {
    return handleExerciseChangeIntent();
  }

  if (/שלום|היי|מה\s*נשמע|עזרה|help/i.test(lower)) {
    return {
      reply: `שלום! אני עוזר Guardian לשאלות על כאב ותרגול (${areaLabel}). שאלו למשל «איך אני מתקדם?» או על רמות כאב. אני בודק את הדיווחים שלכם לפני שאמליץ על שינוי בעומס.`,
      offer: null,
    };
  }

  return {
    reply: appendReasoning(
      `לא בטוח שהבנתי. לפי הנתונים: רמה ${patient.level}, ` +
        (lastPain != null ? `כאב אחרון ${lastPain}/10` : 'אין עדיין דיווח כאב אחרון') +
        `, ${exerciseCount} תרגילים היום, רצף ${patient.currentStreak} ימים. נסו «איך אני מתקדם?» או שאלה על כאב.`
    ),
    offer: null,
  };
}
