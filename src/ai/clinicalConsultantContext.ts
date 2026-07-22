import type { Patient, PatientIntakeArchive, SafetyAlert } from '../types';
import { bodyAreaLabels } from '../types';
import { resolvePatientClinicalIntakeProfile } from '../utils/clinicalIntakeProfileDisplay';

/** Escape a literal string for use in RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Initials / short label for Gemini proxy de-identification (never send full name as the label).
 */
export function patientInitialsFromName(name: string | undefined | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '[Patient]';
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (parts.length === 1) {
    return first.length <= 2 ? first : `${first.slice(0, 1)}.`;
  }
  return `${first.slice(0, 1)}.${last.slice(0, 1)}.`;
}

type PatientPhiSource = Pick<Patient, 'name' | 'displayAlias' | 'portalUsername'> & {
  initialIntakeArchive?: PatientIntakeArchive;
};

/** Known name / alias / username tokens to scrub from prompts (longest first). */
export function collectPatientPhiTokens(patient: PatientPhiSource): string[] {
  const tokens = new Set<string>();
  const add = (raw?: string | null) => {
    const t = raw?.trim();
    if (!t || t.length < 2) return;
    tokens.add(t);
    for (const part of t.split(/[\s,;|/]+/)) {
      const p = part.trim();
      if (p.length >= 2) tokens.add(p);
    }
  };
  add(patient.name);
  add(patient.displayAlias);
  add(patient.portalUsername);
  add(patient.initialIntakeArchive?.displayName);
  add(patient.initialIntakeArchive?.extras?.displayName);
  return [...tokens].sort((a, b) => b.length - a.length);
}

/** Email / phone pattern scrub without length truncation (for longer clinical notes). */
export function scrubPhiPatterns(input: string): string {
  let s = input.trim();
  if (!s) return '';
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[הוסר-דוא״ל]');
  s = s.replace(/\b\d[\d\s\-–—]{7,}\d\b/g, '[הוסר-מספר]');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Replace known patient identifiers, then scrub email/phone patterns.
 * Does not truncate — use `sanitizeFreeTextForClinicalAi` for short snapshot fields.
 */
export function scrubKnownPatientPhi(
  input: string,
  patientOrTokens: PatientPhiSource | string[],
  placeholder = '[Patient]'
): string {
  const tokens = Array.isArray(patientOrTokens)
    ? [...patientOrTokens].sort((a, b) => b.length - a.length)
    : collectPatientPhiTokens(patientOrTokens);
  let s = scrubPhiPatterns(input);
  for (const token of tokens) {
    s = s.replace(new RegExp(escapeRegExp(token), 'gi'), placeholder);
  }
  return s;
}

/**
 * Removes obvious PII patterns from free text before sending to an external model.
 * Does not guarantee zero residual identifiers (e.g. unknown names embedded in prose).
 */
export function sanitizeFreeTextForClinicalAi(
  input: string,
  options?: { maxLen?: number; knownTokens?: string[]; placeholder?: string }
): string {
  const maxLen = options?.maxLen ?? 280;
  const placeholder = options?.placeholder ?? '[Patient]';
  let s = scrubPhiPatterns(input);
  if (!s) return '';
  if (options?.knownTokens?.length) {
    s = scrubKnownPatientPhi(s, options.knownTokens, placeholder);
  }
  if (s.length > maxLen) {
    return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
  }
  return s;
}

/** Strip display names and other identifiers from intake archive before Gemini. */
export function redactIntakeArchiveForAi(arch: PatientIntakeArchive): Record<string, unknown> {
  const { displayName: _dn, extras, ...rest } = arch;
  const {
    displayName: _extrasDn,
    intakeStory,
    clinicalDiagnosis,
    geminiClinicalNarrative,
    ...safeExtras
  } = extras ?? {};
  return {
    ...rest,
    diagnosis: scrubPhiPatterns(rest.diagnosis ?? ''),
    therapistNotes: scrubPhiPatterns(rest.therapistNotes ?? ''),
    geminiClinicalNarrative: rest.geminiClinicalNarrative
      ? scrubPhiPatterns(rest.geminiClinicalNarrative)
      : undefined,
    extras: {
      ...safeExtras,
      intakeStory: intakeStory ? scrubPhiPatterns(intakeStory) : undefined,
      clinicalDiagnosis: clinicalDiagnosis ? scrubPhiPatterns(clinicalDiagnosis) : undefined,
      geminiClinicalNarrative: geminiClinicalNarrative
        ? scrubPhiPatterns(geminiClinicalNarrative)
        : undefined,
    },
  };
}

/**
 * De-identified clinical snapshot for therapist AI consultant (no names, IDs, emails, usernames).
 */
export function buildAnonymizedClinicalContextSnapshot(
  patient: Patient,
  safetyAlertsForPatient: SafetyAlert[],
  options?: { exerciseSafetyLocked?: boolean }
): string {
  const knownTokens = collectPatientPhiTokens(patient);
  const scrub = (s: string) => sanitizeFreeTextForClinicalAi(s, { knownTokens });

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

  const demo = scrub(patient.demographicsFreeText ?? '');
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

  const intakeProfile = resolvePatientClinicalIntakeProfile(patient);
  const bg =
    intakeProfile?.medical_history?.backgroundDiseases?.trim() ??
    patient.medicalProfileMetadata?.backgroundDiseases?.trim();
  const meds =
    intakeProfile?.medical_history?.chronicMedications?.trim() ??
    patient.medicalProfileMetadata?.chronicMedications?.trim();
  if (bg) {
    lines.push(`מחלות רקע (מאינטייק): ${scrub(bg)}`);
  }
  if (meds) {
    lines.push(`תרופות קבועות (מאינטייק): ${scrub(meds)}`);
  }

  const rom = intakeProfile?.ranges ?? [];
  if (rom.length > 0) {
    lines.push(`טווחי תנועה (ROM): ${rom.map((r) => scrub(r)).join('; ')}`);
  }
  const strength = intakeProfile?.muscle_strength?.trim();
  if (strength) {
    lines.push(`כוח שרירים: ${scrub(strength)}`);
  }
  const tests = intakeProfile?.special_tests ?? [];
  if (tests.length > 0) {
    lines.push(`בדיקות מיוחדות: ${tests.map((t) => scrub(t)).join('; ')}`);
  }
  const goals = intakeProfile?.goals ?? [];
  if (goals.length > 0) {
    lines.push(`מטרות שיקום: ${goals.map((g) => scrub(g)).join('; ')}`);
  }

  const alerts = [...safetyAlertsForPatient].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (alerts.length > 0) {
    lines.push('התראות בטיחות אדומות אחרונות מהמערכת (ניסוח קליני):');
    for (const a of alerts.slice(0, 6)) {
      lines.push(`- (${a.severity}) ${scrub(a.reasonHebrew)}`);
    }
  }

  return lines.join('\n');
}
