import type {
  PatientClinicalIntakeMedicalHistory,
  PatientClinicalIntakeProfile,
  PatientMedicalProfileMetadata,
} from '../types';

/** תבנית אינטייק קליני מובנית — מוצגת כברירת מחדל בשדה הסיפור החופשי. */
export const CLINICAL_INTAKE_TEMPLATE_HE = `--- אנמנזה (סובייקטיבי) ---
תלונת המטופל ומקום הכאב: 

מנגנון הפציעה (טראומטי / עומס יתר הדרגתי): 

התנהגות הכאב (בוקר/לילה/במאמץ/במנוחה): 

גורמים מקלים / מחמירים: 

מחלות רקע (סוכרת, לחץ דם, לב, רקמת חיבור וכו'): ללא

תרופות קבועות: ללא

דגלים אדומים (נימול במפשעה, סוגרים, כאב לילי חריף שלא קשור בתנועה): ללא

--- בדיקה פיזיקלית (אובייקטיבי) ---
הסתכלות (נפיחות, שטפי דם, אטרופיה שרירית, צליעה/פיצוי): 

טווחי תנועה (ROM - אקטיבי מול פסיבי ותחושת סוף טווח): 

כוח שרירים (MMT 0-5 ומייצבים): 

בדיקות מיוחדות (Special Tests ספציפיים למפרק): 

מישוש (רגישות בסדק מפרק, גידים, נקודות הדק): 

--- תפקוד ומטרות ---
הגבלה תפקודית ביומיום/ספורט: 

מטרות המטופל מהשיקום: 

`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** חילוץ ערך שדה — תומך בשורה יחידה או בבלוק עד לשדה/כותרת הבאה. */
export function extractIntakeFieldBlock(text: string, labelPrefix: string): string | undefined {
  const inlineRe = new RegExp(
    `${escapeRegExp(labelPrefix)}[^:\\n]*:\\s*([^\\n]+)`,
    'i'
  );
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

/** ממיר medical_history לשדה legacy `medicalProfileMetadata`. */
export function medicalHistoryToProfileMetadata(
  history: PatientClinicalIntakeMedicalHistory | undefined
): PatientMedicalProfileMetadata | undefined {
  return normalizeMedicalHistory(history);
}

export function isClinicalIntakeProfileEmpty(
  profile: PatientClinicalIntakeProfile | undefined
): boolean {
  if (!profile) return true;
  return !(
    (profile.ranges?.length ?? 0) > 0 ||
    profile.muscle_strength?.trim() ||
    (profile.special_tests?.length ?? 0) > 0 ||
    profile.medical_history?.backgroundDiseases?.trim() ||
    profile.medical_history?.chronicMedications?.trim() ||
    (profile.goals?.length ?? 0) > 0
  );
}

/** חילוץ פרופיל אינטייק מובנה מטקסט תבנית (גיבוי מקומי). */
export function parseClinicalIntakeProfileFromStory(
  raw: string
): PatientClinicalIntakeProfile | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  const rangesRaw = extractIntakeFieldBlock(text, 'טווחי תנועה');
  const strengthRaw = extractIntakeFieldBlock(text, 'כוח שרירים');
  const testsRaw = extractIntakeFieldBlock(text, 'בדיקות מיוחדות');
  const goalsRaw = extractIntakeFieldBlock(text, 'מטרות המטופל');

  const medical_history = normalizeMedicalHistory({
    backgroundDiseases: extractIntakeFieldBlock(text, 'מחלות רקע'),
    chronicMedications: extractIntakeFieldBlock(text, 'תרופות קבועות'),
  });

  const profile: PatientClinicalIntakeProfile = {
    ...(rangesRaw ? { ranges: splitListValue(rangesRaw) } : {}),
    ...(strengthRaw ? { muscle_strength: strengthRaw } : {}),
    ...(testsRaw ? { special_tests: splitListValue(testsRaw) } : {}),
    ...(medical_history ? { medical_history } : {}),
    ...(goalsRaw ? { goals: splitListValue(goalsRaw) } : {}),
  };

  return isClinicalIntakeProfileEmpty(profile) ? undefined : profile;
}

/** @deprecated השתמשו ב־`parseClinicalIntakeProfileFromStory` */
export function parseMedicalProfileFromIntakeStory(
  raw: string
): PatientMedicalProfileMetadata | undefined {
  return medicalHistoryToProfileMetadata(
    parseClinicalIntakeProfileFromStory(raw)?.medical_history
  );
}
