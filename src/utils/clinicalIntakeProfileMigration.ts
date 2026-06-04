import type {
  Patient,
  PatientClinicalIntakeMedicalHistory,
  PatientClinicalIntakeProfile,
  PatientMedicalProfileMetadata,
} from '../types';
import {
  isClinicalIntakeProfileEmpty,
  medicalHistoryToProfileMetadata,
  parseClinicalIntakeProfileFromStory,
} from './clinicalIntakeTemplate';

/** כותרות סטנדרטיות לחילוץ מטקסט legacy (תבנית + וריאציות). */
const LEGACY_INTAKE_HEADING_PREFIXES = {
  ranges: ['טווחי תנועה', 'ROM'],
  strength: ['כוח שרירים', 'MMT'],
  special_tests: ['בדיקות מיוחדות', 'Special Tests'],
  backgroundDiseases: ['מחלות רקע'],
  chronicMedications: ['תרופות קבועות'],
  goals: ['מטרות המטופל', 'מטרות שיקום', 'מטרות המטופל מהשיקום'],
} as const;

export type ClinicalIntakeProfileMigrationResult = {
  patient: Patient;
  migrated: boolean;
  /** שדות שנוספו ממקור legacy (לדיבוג) */
  filledFields: string[];
};

export type BatchClinicalIntakeProfileMigrationResult = {
  patients: Patient[];
  migratedPatientIds: string[];
  errors: { patientId: string; message: string }[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringList(v: unknown, maxLen = 24): string[] {
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return [];
    return t
      .split(/\r?\n|[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, maxLen);
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxLen);
}

function splitListValue(value: string): string[] {
  return value
    .split(/\r?\n|[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeMedicalHistory(
  raw: PatientClinicalIntakeMedicalHistory | undefined
): PatientClinicalIntakeMedicalHistory | undefined {
  if (!raw) return undefined;
  const backgroundDiseases = raw.backgroundDiseases?.trim();
  const chronicMedications = raw.chronicMedications?.trim();
  if (!backgroundDiseases && !chronicMedications) return undefined;
  return {
    ...(backgroundDiseases ? { backgroundDiseases } : {}),
    ...(chronicMedications ? { chronicMedications } : {}),
  };
}

/** חילוץ ערך שדה — שורה יחידה או בלוק עד לשדה/כותרת הבאה. */
function extractIntakeFieldBlock(text: string, labelPrefix: string): string | undefined {
  const inlineRe = new RegExp(`${escapeRegExp(labelPrefix)}[^:\\n]*:\\s*([^\\n]+)`, 'i');
  const inline = text.match(inlineRe);
  if (inline?.[1]?.trim()) {
    return inline[1].trim();
  }

  const blockRe = new RegExp(
    `${escapeRegExp(labelPrefix)}[^:\\n]*:\\s*(?:\\r?\\n)([\\s\\S]*?)(?=\\r?\\n(?:---|\\S[^\\n]{2,}[^\\n]*:)\\s*(?:\\r?\\n|$)|$)`,
    'i'
  );
  const block = text.match(blockRe);
  const value = block?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function extractFromHeadingPrefixes(text: string, prefixes: readonly string[]): string | undefined {
  for (const prefix of prefixes) {
    const value = extractIntakeFieldBlock(text, prefix);
    if (value) return value;
  }
  return undefined;
}

/** סריקת שורות עם כותרות inline (למשל clinicalReasoningHe). */
function parseInlineHeadingSegments(text: string): PatientClinicalIntakeProfile {
  const profile: PatientClinicalIntakeProfile = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const cleaned = line.replace(/^[\s•\-–—*]+/, '').trim();
    if (!cleaned) continue;

    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.ranges) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.ranges = [...(profile.ranges ?? []), ...splitListValue(m[1])];
        continue;
      }
    }
    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.strength) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.muscle_strength = m[1].trim();
        continue;
      }
    }
    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.special_tests) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.special_tests = [...(profile.special_tests ?? []), ...splitListValue(m[1])];
        continue;
      }
    }
    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.backgroundDiseases) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.medical_history = {
          ...(profile.medical_history ?? {}),
          backgroundDiseases: m[1].trim(),
        };
        continue;
      }
    }
    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.chronicMedications) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.medical_history = {
          ...(profile.medical_history ?? {}),
          chronicMedications: m[1].trim(),
        };
        continue;
      }
    }
    for (const prefix of LEGACY_INTAKE_HEADING_PREFIXES.goals) {
      const m = cleaned.match(new RegExp(`^${escapeRegExp(prefix)}[^:]*:\\s*(.+)$`, 'i'));
      if (m?.[1]?.trim()) {
        profile.goals = [...(profile.goals ?? []), ...splitListValue(m[1])];
      }
    }
  }

  return profile;
}

/** חילוץ מורחב — תבנית מלאה + כותרות חלופיות + שורות inline. */
export function parseClinicalIntakeProfileFromLegacyText(
  raw: string
): PatientClinicalIntakeProfile | undefined {
  try {
    const text = raw.trim();
    if (!text) return undefined;

    const fromTemplate = parseClinicalIntakeProfileFromStory(text) ?? {};
    const fromHeadings: PatientClinicalIntakeProfile = {
      ...(extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.ranges)
        ? { ranges: splitListValue(extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.ranges)!) }
        : {}),
      ...(extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.strength)
        ? { muscle_strength: extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.strength) }
        : {}),
      ...(extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.special_tests)
        ? {
            special_tests: splitListValue(
              extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.special_tests)!
            ),
          }
        : {}),
      ...(normalizeMedicalHistory({
        backgroundDiseases: extractFromHeadingPrefixes(
          text,
          LEGACY_INTAKE_HEADING_PREFIXES.backgroundDiseases
        ),
        chronicMedications: extractFromHeadingPrefixes(
          text,
          LEGACY_INTAKE_HEADING_PREFIXES.chronicMedications
        ),
      })
        ? {
            medical_history: normalizeMedicalHistory({
              backgroundDiseases: extractFromHeadingPrefixes(
                text,
                LEGACY_INTAKE_HEADING_PREFIXES.backgroundDiseases
              ),
              chronicMedications: extractFromHeadingPrefixes(
                text,
                LEGACY_INTAKE_HEADING_PREFIXES.chronicMedications
              ),
            }),
          }
        : {}),
      ...(extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.goals)
        ? {
            goals: splitListValue(
              extractFromHeadingPrefixes(text, LEGACY_INTAKE_HEADING_PREFIXES.goals)!
            ),
          }
        : {}),
    };
    const fromInline = parseInlineHeadingSegments(text);

    const merged = mergeClinicalIntakeProfilesGapFill(fromTemplate, fromHeadings, fromInline);
    return isClinicalIntakeProfileEmpty(merged) ? undefined : merged;
  } catch {
    return undefined;
  }
}

function dedupeStrings(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length > 0 ? out : undefined;
}

/** ממלא שדות חסרים בלבד — לא דורס ערכים קיימים. */
export function mergeClinicalIntakeProfilesGapFill(
  ...sources: (PatientClinicalIntakeProfile | undefined | null)[]
): PatientClinicalIntakeProfile {
  const out: PatientClinicalIntakeProfile = {};
  for (const src of sources) {
    if (!src) continue;
    if (!(out.ranges?.length ?? 0) && src.ranges?.length) {
      out.ranges = dedupeStrings(src.ranges);
    }
    if (!out.muscle_strength?.trim() && src.muscle_strength?.trim()) {
      out.muscle_strength = src.muscle_strength.trim();
    }
    if (!(out.special_tests?.length ?? 0) && src.special_tests?.length) {
      out.special_tests = dedupeStrings(src.special_tests);
    }
    if (!(out.goals?.length ?? 0) && src.goals?.length) {
      out.goals = dedupeStrings(src.goals);
    }
    out.medical_history = {
      ...(out.medical_history ?? {}),
    };
    const bg = src.medical_history?.backgroundDiseases?.trim();
    const meds = src.medical_history?.chronicMedications?.trim();
    if (!out.medical_history.backgroundDiseases?.trim() && bg) {
      out.medical_history.backgroundDiseases = bg;
    }
    if (!out.medical_history.chronicMedications?.trim() && meds) {
      out.medical_history.chronicMedications = meds;
    }
    if (
      !out.medical_history.backgroundDiseases?.trim() &&
      !out.medical_history.chronicMedications?.trim()
    ) {
      delete out.medical_history;
    }
  }
  return out;
}

function profileFromMedicalMetadata(
  meta: PatientMedicalProfileMetadata | undefined
): PatientClinicalIntakeProfile | undefined {
  if (!meta) return undefined;
  const medical_history = normalizeMedicalHistory(meta);
  return medical_history ? { medical_history } : undefined;
}

function readLegacyClinicalReasoningHe(patient: Patient): string[] {
  try {
    const typed = patient.clinicalReasoningHe;
    if (Array.isArray(typed)) {
      return asStringList(typed, 32);
    }
    const raw = (patient as unknown as Record<string, unknown>).clinicalReasoningHe;
    return asStringList(raw, 32);
  } catch {
    return [];
  }
}

function patientPayloadRecord(patient: Patient): Record<string, unknown> {
  return patient as unknown as Record<string, unknown>;
}

function readLegacyPayloadString(
  source: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!source) return undefined;
  const raw = source[key];
  return asTrimmedString(typeof raw === 'string' ? raw : undefined) || undefined;
}

/**
 * מפתחות payload ישנים/חלופיים לסיכום האינטייק הגולמי (לפני `clinicalIntakeProfile`).
 * הסדר קובע עדיפות בין alias-ים — לא בין מקורות שונים.
 */
const LEGACY_INTAKE_SUMMARY_PAYLOAD_KEYS = [
  'intakeSummary',
  'intakeText',
  'clinicalSummaryHe',
  'clinicalIntakeStory',
  'initialIntakeStory',
  'intake_summary',
  'clinicalSummary',
] as const;

/**
 * מקור אמת לטקסט האינטייק הגולמי — שדה `intakeStory` / ארכיון / alias-ים ב-payload.
 * מוחזר לפני narrative/reasoning כדי לחלץ ROM/MMT/בדיקות מהתבנית המקורית.
 */
export function resolveCoreLegacyIntakeSummaryText(patient: Patient): string | undefined {
  try {
    const root = patientPayloadRecord(patient);
    const archiveExtras = patient.initialIntakeArchive?.extras;
    const archiveExtrasRecord = archiveExtras as unknown as Record<string, unknown> | undefined;

    const candidates: string[] = [];
    const pushCandidate = (text: string | undefined) => {
      const t = asTrimmedString(text);
      if (t) candidates.push(t);
    };

    // 1. שם השדה המקורי מאשף האינטייק — root payload
    pushCandidate(patient.intakeStory);
    pushCandidate(readLegacyPayloadString(root, 'intakeStory'));

    // 2. עותק בארכיון האינטייק הראשון
    pushCandidate(archiveExtras?.intakeStory);
    pushCandidate(readLegacyPayloadString(archiveExtrasRecord, 'intakeStory'));

    // 3. צילום הערות בארכיון (לעיתים היחיד שנשמר)
    pushCandidate(patient.initialIntakeArchive?.therapistNotes);

    // 4. alias-ים היסטוריים ב-payload root + בארכיון
    for (const key of LEGACY_INTAKE_SUMMARY_PAYLOAD_KEYS) {
      pushCandidate(readLegacyPayloadString(root, key));
      pushCandidate(readLegacyPayloadString(archiveExtrasRecord, key));
    }

    // 5. therapistNotes — mirror נפוץ; עלול להיות ריק אחרי redaction מקומי
    pushCandidate(patient.therapistNotes);

    const seen = new Set<string>();
    for (const text of candidates) {
      if (seen.has(text)) continue;
      seen.add(text);
      return text;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function pushUniqueText(parts: string[], seen: Set<string>, value?: string | null): void {
  const t = asTrimmedString(value);
  if (!t || seen.has(t)) return;
  seen.add(t);
  parts.push(t);
}

/**
 * אוסף מקורות משלימים (AI narrative, reasoning) — לא כולל את סיכום האינטייק הגולmi.
 */
function collectSupplementaryLegacyClinicalIntakeTexts(
  patient: Patient,
  opts?: { excludeText?: string }
): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  const exclude = asTrimmedString(opts?.excludeText);

  try {
    pushUniqueText(parts, seen, patient.geminiClinicalNarrative);
    pushUniqueText(parts, seen, patient.initialIntakeArchive?.geminiClinicalNarrative);
    pushUniqueText(parts, seen, patient.initialIntakeArchive?.extras?.geminiClinicalNarrative);

    const reasoning = readLegacyClinicalReasoningHe(patient);
    if (reasoning.length > 0) {
      pushUniqueText(parts, seen, reasoning.join('\n'));
    }

    const archiveReasoning = patient.initialIntakeArchive?.extras?.clinicalReasoningHe;
    if (Array.isArray(archiveReasoning) && archiveReasoning.length > 0) {
      pushUniqueText(
        parts,
        seen,
        archiveReasoning
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
          .join('\n')
      );
    }

    if (exclude) {
      return parts.filter((t) => t !== exclude);
    }
  } catch {
    /* defensive */
  }

  return parts;
}

/**
 * אוסף את כל מקורות הטקסט הישנים — סיכום האינטייק הגולמי ראשון בשרשרת.
 */
export function collectLegacyClinicalIntakeTexts(patient: Patient): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();

  try {
    const core = resolveCoreLegacyIntakeSummaryText(patient);
    pushUniqueText(parts, seen, core);

    // מקורות נוספים שעשויים להכיל כותרות (אם core לא כיסה הכל)
    pushUniqueText(parts, seen, patient.therapistNotes);
    pushUniqueText(parts, seen, patient.initialIntakeArchive?.therapistNotes);
    pushUniqueText(parts, seen, patient.initialIntakeArchive?.extras?.intakeStory);
    pushUniqueText(parts, seen, patient.intakeStory);

    for (const text of collectSupplementaryLegacyClinicalIntakeTexts(patient, { excludeText: core })) {
      pushUniqueText(parts, seen, text);
    }
  } catch {
    /* defensive — return what we collected */
  }

  return parts;
}

/** מפענח את כל מקורות ה-legacy לפרופיל אחד (מילוי חסרים בין מקורות). */
export function parseClinicalIntakeProfileFromLegacySources(
  patient: Patient
): PatientClinicalIntakeProfile | undefined {
  try {
    let merged: PatientClinicalIntakeProfile = {};

    const coreSummary = resolveCoreLegacyIntakeSummaryText(patient);
    if (coreSummary) {
      const fromCore = parseClinicalIntakeProfileFromLegacyText(coreSummary);
      if (fromCore) {
        merged = mergeClinicalIntakeProfilesGapFill(merged, fromCore);
      }
    }

    for (const text of collectLegacyClinicalIntakeTexts(patient)) {
      if (text === coreSummary) continue;
      const parsed = parseClinicalIntakeProfileFromLegacyText(text);
      if (parsed) {
        merged = mergeClinicalIntakeProfilesGapFill(merged, parsed);
      }
    }
    merged = mergeClinicalIntakeProfilesGapFill(
      merged,
      profileFromMedicalMetadata(patient.medicalProfileMetadata),
      profileFromMedicalMetadata(patient.initialIntakeArchive?.extras?.medicalProfileMetadata)
    );
    return isClinicalIntakeProfileEmpty(merged) ? undefined : merged;
  } catch {
    return undefined;
  }
}

function listFields(profile: PatientClinicalIntakeProfile | undefined): string[] {
  if (!profile) return [];
  const fields: string[] = [];
  if ((profile.ranges?.length ?? 0) > 0) fields.push('ranges');
  if (profile.muscle_strength?.trim()) fields.push('muscle_strength');
  if ((profile.special_tests?.length ?? 0) > 0) fields.push('special_tests');
  if (profile.medical_history?.backgroundDiseases?.trim()) fields.push('backgroundDiseases');
  if (profile.medical_history?.chronicMedications?.trim()) fields.push('chronicMedications');
  if ((profile.goals?.length ?? 0) > 0) fields.push('goals');
  return fields;
}

/** האם יש נתוני legacy שלא משולבים בפרופיל השמור. */
export function patientNeedsClinicalIntakeProfileMigration(patient: Patient): boolean {
  try {
    const legacy = parseClinicalIntakeProfileFromLegacySources(patient);
    if (isClinicalIntakeProfileEmpty(legacy)) return false;

    const existing = patient.clinicalIntakeProfile;
    if (isClinicalIntakeProfileEmpty(existing)) return true;

    const merged = mergeClinicalIntakeProfilesGapFill(existing, legacy);
    const before = listFields(existing).sort().join('|');
    const after = listFields(merged).sort().join('|');
    return before !== after;
  } catch {
    return false;
  }
}

/**
 * מיזוג לתצוגה: structured profile גובר; legacy ממלא חסרים בלבד.
 */
export function resolveClinicalIntakeProfileForDisplay(
  patient: Patient
): PatientClinicalIntakeProfile | undefined {
  try {
    const fromLegacy = parseClinicalIntakeProfileFromLegacySources(patient);
    const fromArchive = patient.initialIntakeArchive?.extras?.clinicalIntakeProfile;
    const fromPatient = patient.clinicalIntakeProfile;

    const merged = mergeClinicalIntakeProfilesGapFill(
      fromPatient,
      fromArchive,
      fromLegacy
    );
    return isClinicalIntakeProfileEmpty(merged) ? undefined : merged;
  } catch {
    return undefined;
  }
}

/**
 * מיגרציה בזיכרון — כותבת `clinicalIntakeProfile` + mirror ל-`medicalProfileMetadata`.
 * לא משנה שום דבר אם אין מה לשדרג.
 */
export function migratePatientClinicalIntakeProfile(
  patient: Patient
): ClinicalIntakeProfileMigrationResult {
  const empty: ClinicalIntakeProfileMigrationResult = {
    patient,
    migrated: false,
    filledFields: [],
  };
  try {
    if (!patientNeedsClinicalIntakeProfileMigration(patient)) {
      return empty;
    }

    const legacy = parseClinicalIntakeProfileFromLegacySources(patient);
    if (isClinicalIntakeProfileEmpty(legacy)) {
      return empty;
    }

    const beforeFields = listFields(patient.clinicalIntakeProfile);
    const clinicalIntakeProfile = mergeClinicalIntakeProfilesGapFill(
      patient.clinicalIntakeProfile,
      patient.initialIntakeArchive?.extras?.clinicalIntakeProfile,
      legacy
    );
    if (isClinicalIntakeProfileEmpty(clinicalIntakeProfile)) {
      return empty;
    }

    const afterFields = listFields(clinicalIntakeProfile);
    const filledFields = afterFields.filter((f) => !beforeFields.includes(f));
    const medicalProfileMetadata =
      medicalHistoryToProfileMetadata(clinicalIntakeProfile.medical_history) ??
      patient.medicalProfileMetadata;

    return {
      patient: {
        ...patient,
        clinicalIntakeProfile,
        ...(medicalProfileMetadata ? { medicalProfileMetadata } : {}),
      },
      migrated: true,
      filledFields,
    };
  } catch {
    return empty;
  }
}

/** מיגרציה אצווה — בטוחה; שגיאות per-patient לא עוצרות את השאר. */
export function migratePatientsClinicalIntakeProfiles(
  patients: Patient[]
): BatchClinicalIntakeProfileMigrationResult {
  const migratedPatientIds: string[] = [];
  const errors: { patientId: string; message: string }[] = [];
  const out: Patient[] = [];

  for (const patient of patients) {
    try {
      const { patient: next, migrated } = migratePatientClinicalIntakeProfile(patient);
      out.push(next);
      if (migrated) migratedPatientIds.push(patient.id);
    } catch (e) {
      out.push(patient);
      errors.push({
        patientId: patient.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { patients: out, migratedPatientIds, errors };
}
