import type { Patient, SafetyAlert } from '../types';
import { bodyAreaLabels } from '../types';

/**
 * Removes obvious PII patterns from free text before sending to an external model.
 * Does not guarantee zero residual identifiers (e.g. names embedded in prose).
 */
export function sanitizeFreeTextForClinicalAi(input: string): string {
  let s = input.trim();
  if (!s) return '';
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[הוסר-דוא״ל]');
  s = s.replace(/\b\d[\d\s\-–—]{7,}\d\b/g, '[הוסר-מספר]');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 280) {
    return `${s.slice(0, 277)}…`;
  }
  return s;
}

/**
 * De-identified clinical snapshot for therapist AI consultant (no names, IDs, emails, usernames).
 */
export function buildAnonymizedClinicalContextSnapshot(
  patient: Patient,
  safetyAlertsForPatient: SafetyAlert[],
  options?: { exerciseSafetyLocked?: boolean }
): string {
  const lines: string[] = [];
  lines.push('הקשר מנותק מזיהוי אישי: ללא שם, כינוי, ת״ז, דוא״ל, שם משתמש פורטל או מזהה מערכת.');
  lines.push(`גיל: ${patient.age}`);
  if (patient.clinicalSex === 'male') {
    lines.push('מין (קליני, אם הוזן): זכר');
  } else if (patient.clinicalSex === 'female') {
    lines.push('מין (קליני, אם הוזן): נקבה');
  } else {
    lines.push('מין (קליני): לא צוין במערכת');
  }

  const demo = sanitizeFreeTextForClinicalAi(patient.demographicsFreeText ?? '');
  if (demo) {
    lines.push(`תיאור דמוגרפי/תעסוקתי (מנוקה ממזהים טכניים): ${demo}`);
  } else {
    lines.push('תיאור דמוגרפי/תעסוקתי: לא הוזן טקסט במערכת.');
  }

  lines.push(`מוקד גוף עיקרי בתוכנית: ${bodyAreaLabels[patient.primaryBodyArea]}`);
  const injury = patient.injuryHighlightSegments ?? [];
  if (injury.length > 0) {
    lines.push(`אזורי הדגשה קלינית: ${injury.map((a) => bodyAreaLabels[a]).join(', ')}`);
  }
  const secondary = patient.secondaryClinicalBodyAreas ?? [];
  if (secondary.length > 0) {
    lines.push(`מוקדים משניים: ${secondary.map((a) => bodyAreaLabels[a]).join(', ')}`);
  }

  const avg = patient.analytics.averageOverallPain;
  lines.push(
    `ממוצע כאב כללי בדיווחים: ${
      Number.isFinite(avg) ? avg.toFixed(1) : '—'
    }/10`
  );

  const recentPain = patient.analytics.painHistory.slice(-8);
  if (recentPain.length > 0) {
    lines.push('דיווחי כאב אחרונים (רמה, אזור, תאריך):');
    for (const r of recentPain) {
      lines.push(`- ${r.painLevel}/10, ${bodyAreaLabels[r.bodyArea]}, ${r.date}`);
    }
  } else {
    lines.push('אין דיווחי כאב שמורים במערכת.');
  }

  lines.push(`דגל אדום פעיל במערכת: ${patient.hasRedFlag ? 'כן' : 'לא'}`);
  lines.push(`מצב נעילת תרגול (בטיחות): ${patient.redFlagActive ? 'כן — נעילה/התרעה' : 'לא'}`);
  if (options?.exerciseSafetyLocked) {
    lines.push('נעילת תרגילים פעילה במערכת (מצב חירום/בטיחות — הושבת תרגול בפורטל).');
  }
  lines.push(`סטטוס תוכנית: ${patient.status}`);

  if (patient.initialIntakeArchive?.extras?.intakeRedFlag) {
    lines.push('באינטייק ראשון סומן חשש/דגל אדום.');
  }

  const alerts = [...safetyAlertsForPatient].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (alerts.length > 0) {
    lines.push('התראות בטיחות אדומות אחרונות מהמערכת (ניסוח קליני):');
    for (const a of alerts.slice(0, 6)) {
      lines.push(`- (${a.severity}) ${a.reasonHebrew}`);
    }
  }

  return lines.join('\n');
}
