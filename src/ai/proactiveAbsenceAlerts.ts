/**
 * Proactive absence detection — surfaces regression/support queue items when a patient
 * has had no portal activity or logged session for more than the clinical threshold.
 */

import type { AiSuggestion, ExercisePlan, Patient, SafetyAlert } from '../types';
import { getClinicalDate, clinicalDateToLocalMidnight } from '../utils/clinicalCalendar';
import { clinicalDayFromIso } from '../utils/patientPortalMeta';
import { pickCanonicalExercisePlan } from '../utils/exercisePlanCanonical';

export const PROLONGED_ABSENCE_THRESHOLD_DAYS = 5;

export const PROLONGED_ABSENCE_ALERT_ID = (patientId: string) => `absence-alert-${patientId}`;
export const PROLONGED_ABSENCE_SUGGESTION_ID = (patientId: string) => `absence-sug-${patientId}`;

function clinicalDaysBetween(earlierYmd: string, laterYmd: string): number {
  const diffMs =
    clinicalDateToLocalMidnight(laterYmd).getTime() -
    clinicalDateToLocalMidnight(earlierYmd).getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

/** Most recent clinical activity day from portal login, session history, or last session date. */
export function computeDaysSinceLastPatientActivity(
  patient: Patient,
  clinicalToday: string = getClinicalDate()
): number | null {
  const dayKeys: string[] = [];

  if (patient.lastActivityTimestamp?.trim()) {
    dayKeys.push(clinicalDayFromIso(patient.lastActivityTimestamp));
  }
  if (patient.lastSessionDate?.trim()) {
    dayKeys.push(patient.lastSessionDate.slice(0, 10));
  }
  for (const s of patient.analytics.sessionHistory) {
    const d = s.date?.slice(0, 10);
    if (d) dayKeys.push(d);
  }

  if (dayKeys.length === 0) {
    const join = patient.joinDate?.slice(0, 10);
    if (!join) return null;
    return clinicalDaysBetween(join, clinicalToday);
  }

  const mostRecent = dayKeys.sort((a, b) => b.localeCompare(a))[0];
  return clinicalDaysBetween(mostRecent, clinicalToday);
}

export function isProlongedAbsence(
  patient: Patient,
  clinicalToday: string,
  thresholdDays = PROLONGED_ABSENCE_THRESHOLD_DAYS
): boolean {
  const days = computeDaysSinceLastPatientActivity(patient, clinicalToday);
  return days != null && days > thresholdDays;
}

export function buildProlongedAbsenceQueueItems(
  patient: Patient,
  plan: ExercisePlan | undefined,
  daysSince: number
): { safetyAlert: SafetyAlert; aiSuggestion: AiSuggestion } {
  const ex =
    plan?.exercises.find((e) => (e.patientSets ?? e.sets ?? 0) > 0) ??
    plan?.exercises.find((e) => (e.patientReps ?? e.reps ?? 0) > 0) ??
    plan?.exercises[0];

  const field = ex && (ex.patientSets ?? ex.sets ?? 0) > 0 ? ('sets' as const) : ('reps' as const);
  const currentValue =
    ex == null
      ? 0
      : field === 'sets'
        ? (ex.patientSets ?? ex.sets ?? 1)
        : (ex.patientReps ?? ex.reps ?? 10);
  const suggestedValue =
    ex == null
      ? 0
      : field === 'sets'
        ? Math.max(1, currentValue - 1)
        : Math.max(1, Math.floor(currentValue * 0.7));

  const rationale =
    `חוסר פעילות ממושך (${daysSince} ימים קליניים ללא כניסה או דיווח אימון). ` +
    `מומלץ ליצור קשר יזום (הודעה / שיחה), להקל זמנית את נפח התוכנית, ולבחון מחדש מוטיבציה וחסמים לפני שהמטופל חוזר לפורטל. ` +
    `המלצה מבנית: ${field === 'sets' ? 'הפחתת סטים' : 'הפחתת חזרות'} לכניסה חוזרת עדינה.`;

  const now = new Date().toISOString();

  return {
    safetyAlert: {
      id: PROLONGED_ABSENCE_ALERT_ID(patient.id),
      patientId: patient.id,
      reasonCode: 'PROLONGED_ABSENCE_SUPPORT',
      reasonHebrew: `לא נרשמה פעילות ${daysSince} ימים — מומלץ יצירת קשר והקלה זמנית בתוכנית.`,
      severity: 'high_priority',
      createdAt: now,
    },
    aiSuggestion: {
      id: PROLONGED_ABSENCE_SUGGESTION_ID(patient.id),
      patientId: patient.id,
      exerciseId: ex?.id ?? 'plan-level',
      exerciseName: ex?.name ?? 'תוכנית כוללת',
      type: 'reduce_reps',
      field,
      currentValue,
      suggestedValue: ex ? suggestedValue : currentValue,
      reason: rationale,
      createdAt: now,
      status: 'awaiting_therapist',
      source: 'clinical_recommendation_engine',
    },
  };
}

export type ProactiveAbsenceMergeResult = {
  safetyAlerts: SafetyAlert[];
  aiSuggestions: AiSuggestion[];
  hasNewItems: boolean;
};

/**
 * Ensures prolonged-absence alert + recommendation exist for eligible patients.
 * Uses stable ids — will not duplicate if already queued (updates reason text only when days increase).
 */
export function mergeProactiveAbsenceIntoClinicalQueue(
  patients: Patient[],
  exercisePlans: ExercisePlan[],
  clinicalToday: string,
  existingAlerts: SafetyAlert[],
  existingSuggestions: AiSuggestion[]
): ProactiveAbsenceMergeResult {
  let safetyAlerts = [...existingAlerts];
  let aiSuggestions = [...existingSuggestions];
  let hasNewItems = false;

  for (const patient of patients) {
    if (patient.accountFrozen || patient.status === 'paused') continue;

    const days = computeDaysSinceLastPatientActivity(patient, clinicalToday);
    if (days == null || days <= PROLONGED_ABSENCE_THRESHOLD_DAYS) continue;

    const plan = pickCanonicalExercisePlan(exercisePlans, patient.id);
    const built = buildProlongedAbsenceQueueItems(patient, plan, days);
    const alertId = built.safetyAlert.id;
    const sugId = built.aiSuggestion.id;

    const hadAlert = safetyAlerts.some((a) => a.id === alertId);
    const hadSug = aiSuggestions.some((s) => s.id === sugId);

    if (!hadAlert) {
      safetyAlerts = [...safetyAlerts, built.safetyAlert];
      hasNewItems = true;
    } else {
      safetyAlerts = safetyAlerts.map((a) =>
        a.id === alertId
          ? {
              ...a,
              reasonHebrew: built.safetyAlert.reasonHebrew,
              createdAt: a.createdAt,
            }
          : a
      );
    }

    if (!hadSug) {
      aiSuggestions = [...aiSuggestions, built.aiSuggestion];
      hasNewItems = true;
    } else {
      aiSuggestions = aiSuggestions.map((s) =>
        s.id === sugId && (s.status === 'awaiting_therapist' || s.status === 'pending')
          ? { ...s, reason: built.aiSuggestion.reason, currentValue: built.aiSuggestion.currentValue, suggestedValue: built.aiSuggestion.suggestedValue }
          : s
      );
    }
  }

  return { safetyAlerts, aiSuggestions, hasNewItems };
}
