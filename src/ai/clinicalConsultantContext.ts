import type { Patient, PatientIntakeArchive, SafetyAlert } from '../types';
import { buildClinicalPromptContext } from './buildClinicalPromptContext';

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
 * Delegates to the shared prompt-context builder (`therapistConsult` mode).
 */
export function buildAnonymizedClinicalContextSnapshot(
  patient: Patient,
  safetyAlertsForPatient: SafetyAlert[],
  options?: { exerciseSafetyLocked?: boolean }
): string {
  return buildClinicalPromptContext({
    mode: 'therapistConsult',
    patient,
    safetyAlertsForPatient,
    exerciseSafetyLocked: options?.exerciseSafetyLocked,
  }).text;
}
