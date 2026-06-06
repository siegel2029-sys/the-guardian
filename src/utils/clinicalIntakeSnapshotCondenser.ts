import type { BodyArea, Patient, PatientClinicalIntakeProfile } from '../types';
import { bodyAreaLabels } from '../types';
import { extractIntakeFieldBlock } from './clinicalIntakeTemplate';
import { isClinicalIntakeTextFieldAnswered, isClinicalIntakeNegativeAnswer } from './clinicalIntakeFieldAnswers';
import { buildClinicalIntakeProfileSlots } from './clinicalIntakeProfileDisplay';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';
import { extractHeuristicIntakeRedFlags } from './intakeRedFlagHeuristics';
import { stripLibraryExerciseIdsFromClinicalText } from './clinicalIntakeClinicalText';

export type CondensedIntakeSectionId =
  | 'diagnosis_status'
  | 'story_brief'
  | 'ai_brief'
  | 'key_impairments'
  | 'neurological_red_flags'
  | 'plan_goals';

export type BuildCondensedIntakeSnapshotOptions = {
  /** כאשר true — רק אנמנזה/AI/דגלים; מדדי ROM/כוח/מטרות מוצגים בטאבים נפרדים */
  narrativeOnly?: boolean;
};

export type CondensedIntakeSection = {
  id: CondensedIntakeSectionId;
  titleHe: string;
  /** פסקה אחת תמציתית — ללא רשימות ארוכות */
  text: string;
  /** מוצג באדום (דגלים / נוירו) */
  emphasis?: 'danger';
};

export type CondensedIntakeSnapshot = {
  sections: CondensedIntakeSection[];
  unexaminedLabels: string[];
  hasAnyContent: boolean;
};

export type CondensedIntakeSnapshotInput = {
  profile?: PatientClinicalIntakeProfile;
  diagnosis?: string;
  clinicalDiagnosis?: string;
  geminiClinicalNarrative?: string;
  intakeStory?: string;
  hasRedFlag?: boolean;
  intakeRedFlag?: boolean;
  primaryBodyArea?: BodyArea;
  /** כאב אחרון 0–10 (אופציונלי) */
  currentPainLevel?: number | null;
};

const UNEXAMINED_RE =
  /^(?:טרם|לא נבדק|לא נבחן|לא הוזן|לא הוגדר|אין נתונים|אין דיווח|—|-|\.)$/i;

const NEURO_KEYWORDS_RE =
  /זרמ|נימול|עקצ|חולשה מתקדמת|רדיקול|עצב|ברכיאל|אולנר|רדיאל|מדיאנ|ספינל|נוירו|תחושה מופחתת|paresthes/i;

const PAIN_IN_TEXT_RE = /כאב\s*(\d{1,2})\s*(?:\/\s*10|מתוך\s*10)?/i;

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isUnexaminedValue(v: string | undefined): boolean {
  const t = (v ?? '').trim();
  if (!t) return true;
  if (!isClinicalIntakeTextFieldAnswered(t)) return true;
  if (UNEXAMINED_RE.test(t)) return true;
  if (/טרם הוזן|טרם הוגדר|טרם הוזנו|טרם נבדק|לא נבדק|לא נבחן/i.test(t)) return true;
  return false;
}

function isLabelValueNoise(line: string): boolean {
  const colon = line.indexOf(':');
  if (colon < 0) return false;
  const value = line.slice(colon + 1).trim();
  if (!value) return true;
  if (isUnexaminedValue(value) || isClinicalIntakeNegativeAnswer(value)) return true;
  if (/^ל["״']?ר\.?$/i.test(value)) return true;
  return false;
}

function isMeaningfulClinicalLine(line: string): boolean {
  const t = line.trim();
  if (!t || isUnexaminedValue(t)) return false;
  if (isClinicalIntakeNegativeAnswer(t)) return false;
  if (isLabelValueNoise(t)) return false;
  if (/^ללא\b/i.test(t) && t.length < 24) return false;
  return true;
}

function sanitizeClinicalDisplayText(text: string): string {
  const stripped = stripLibraryExerciseIdsFromClinicalText(text);
  return stripped.replace(/\s+/g, ' ').trim();
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    const key = normKey(line);
    if (seen.has(key)) continue;
    if (out.some((prev) => normKey(prev).includes(key) || key.includes(normKey(prev)))) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function firstNonEmpty(...parts: (string | undefined)[]): string {
  for (const p of parts) {
    const t = p?.trim();
    if (t && !isUnexaminedValue(t)) return t;
  }
  return '';
}

function stripTemplateNoise(text: string): string {
  return sanitizeClinicalDisplayText(
    text
      .replace(/^---\s*.+?\s*---\s*/gm, '')
      .replace(/^\s*[-•]\s*/gm, '')
      .trim()
  );
}

const STORY_NARRATIVE_FIELD_LABELS = [
  'תלונת המטופל',
  'מנגנון הפציעה',
  'התנהגות הכאב',
  'גורמים מקלים',
  'הסתכלות',
  'מישוש',
  'הגבלה תפקודית',
] as const;

function compactFieldSnippet(raw: string | undefined, maxLen = 88): string {
  const t = sanitizeClinicalDisplayText(raw ?? '');
  if (!t || !isMeaningfulClinicalLine(t)) return '';
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function buildStoryBrief(story: string): string {
  const parts: string[] = [];
  for (const label of STORY_NARRATIVE_FIELD_LABELS) {
    const block = extractIntakeFieldBlock(story, label);
    const snippet = compactFieldSnippet(block);
    if (snippet) parts.push(snippet);
  }
  if (parts.length === 0) {
    const freeLines = story
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(isMeaningfulClinicalLine)
      .filter(
        (l) =>
          !/טווח(?:י)? תנועה|ROM|כוח שריר|MMT|בדיקות מיוחדות|מחלות רקע|תרופות קבועות|מטרות המטופל/i.test(
            l
          )
      )
      .slice(0, 3)
      .map((l) => compactFieldSnippet(l, 72));
    parts.push(...freeLines.filter(Boolean));
  }
  return dedupeLines(parts).join(' · ').slice(0, 300);
}

function buildAiBrief(narrative: string, diagnosisText: string): string {
  const clean = stripTemplateNoise(narrative);
  if (!clean) return '';

  const diagKey = normKey(diagnosisText).slice(0, 20);
  const lines: string[] = [];

  for (const line of clean.split(/\r?\n/)) {
    const t = line.trim();
    if (!isMeaningfulClinicalLine(t)) continue;
    const stripped = t.replace(/^(אבחנה|ליקויים|תוכנית|נוירולוגי|דגלים)[^:]*:\s*/i, '').trim();
    const body = stripped || t;
    if (diagKey && normKey(body).includes(diagKey)) continue;
    if (/ליקויים עיקריים|תוכנית ומטרות/i.test(t)) continue;
    lines.push(compactFieldSnippet(body, 120));
  }

  if (lines.length === 0 && isMeaningfulClinicalLine(clean) && !diagKey) {
    return compactFieldSnippet(clean, 220);
  }

  return dedupeLines(lines.filter(Boolean)).join(' · ').slice(0, 260);
}

function extractPainFromStory(story: string): number | null {
  const m = story.match(PAIN_IN_TEXT_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

function compactRomLine(raw: string): string {
  const t = raw.trim();
  if (!isMeaningfulClinicalLine(t)) return '';
  const pipe = t.indexOf('|');
  const base = pipe >= 0 ? t.slice(0, pipe).trim() : t;
  const colon = base.indexOf(':');
  if (colon >= 0) {
    const movement = base.slice(0, colon).trim();
    const value = base.slice(colon + 1).trim();
    if (!movement || isUnexaminedValue(value)) return '';
    const shortMove = movement.replace(/טווח(?:י)? תנועה|ROM/gi, '').trim();
    return value.includes('°') || /\d/.test(value)
      ? `${shortMove || movement} ${value}`.trim()
      : `${movement}: ${value}`;
  }
  return base;
}

function compactRomList(ranges: string[] | undefined): string {
  const parts = (ranges ?? [])
    .map(compactRomLine)
    .filter(Boolean);
  return dedupeLines(parts).join(', ');
}

function compactStrength(text: string | undefined): string {
  const raw = text?.trim() ?? '';
  if (!isMeaningfulClinicalLine(raw)) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(isMeaningfulClinicalLine);
  if (lines.length <= 2) return lines.join('; ');
  return lines.slice(0, 3).join('; ') + (lines.length > 3 ? '…' : '');
}

function compactGoals(goals: string[] | undefined, storyGoals?: string): string {
  const fromProfile = (goals ?? []).map((g) => g.trim()).filter(isMeaningfulClinicalLine);
  const fromStory = storyGoals
    ? storyGoals
        .split(/\r?\n|[;،]/)
        .map((s) => s.trim())
        .filter(isMeaningfulClinicalLine)
    : [];
  const merged = dedupeLines([...fromProfile, ...fromStory]);
  return merged.slice(0, 4).join(', ');
}

function extractRedFlagLines(
  story: string,
  narrative: string,
  heuristic: string[]
): string[] {
  const lines: string[] = [];
  const flagsBlock = extractIntakeFieldBlock(story, 'דגלים אדומים');
  if (flagsBlock && isMeaningfulClinicalLine(flagsBlock)) {
    lines.push(flagsBlock);
  }
  for (const block of [narrative, story]) {
    const flagSection = block.split(/\n(?=דגלים\s*:|דגלים אדומים)/i)[1];
    if (!flagSection) continue;
    for (const line of flagSection.split(/\r?\n/)) {
      const cleaned = line.replace(/^דגלים\s*:?\s*/i, '').replace(/^[•\-]\s*/, '').trim();
      if (isMeaningfulClinicalLine(cleaned)) lines.push(cleaned);
    }
  }
  for (const line of [...story.split(/\r?\n/), ...narrative.split(/\r?\n/)]) {
    const t = line.trim();
    if (NEURO_KEYWORDS_RE.test(t) && isMeaningfulClinicalLine(t)) lines.push(t);
  }
  lines.push(...heuristic.filter(isMeaningfulClinicalLine));
  return dedupeLines(lines);
}

function buildDiagnosisStatus(input: CondensedIntakeSnapshotInput, story: string): string {
  const diagnosis = firstNonEmpty(
    input.clinicalDiagnosis,
    input.diagnosis,
    input.geminiClinicalNarrative?.split(/\r?\n/)[0]
  );
  const complaint = extractIntakeFieldBlock(story, 'תלונת המטופל');
  const mechanism = extractIntakeFieldBlock(story, 'מנגנון הפציעה');

  const parts: string[] = [];
  if (diagnosis) parts.push(diagnosis);

  const complaintShort =
    complaint && !normKey(diagnosis).includes(normKey(complaint).slice(0, 24))
      ? complaint.replace(/\s+/g, ' ').slice(0, 120)
      : '';
  const mechanismShort =
    mechanism && isMeaningfulClinicalLine(mechanism) && !normKey(diagnosis).includes(normKey(mechanism).slice(0, 20))
      ? mechanism.replace(/\s+/g, ' ').slice(0, 80)
      : '';

  if (complaintShort && !parts.some((p) => normKey(p).includes(normKey(complaintShort).slice(0, 18)))) {
    parts.push(complaintShort);
  }
  if (mechanismShort) parts.push(`מנגנון: ${mechanismShort}`);

  if (parts.length === 0 && input.primaryBodyArea) {
    parts.push(`מוקד טיפול: ${bodyAreaLabels[input.primaryBodyArea]}`);
  }

  return dedupeLines(parts).join(' — ').slice(0, 280);
}

function buildKeyImpairments(
  input: CondensedIntakeSnapshotInput,
  story: string,
  profile: PatientClinicalIntakeProfile | undefined
): string {
  const chunks: string[] = [];

  const pain =
    input.currentPainLevel != null && input.currentPainLevel >= 0
      ? input.currentPainLevel
      : extractPainFromStory(story);
  if (pain != null) {
    const area = input.primaryBodyArea ? bodyAreaLabels[input.primaryBodyArea] : 'מוקד';
    chunks.push(`כאב ${pain}/10 ב${area}`);
  }

  const rom = compactRomList(profile?.ranges);
  if (rom) chunks.push(`הגבלת טווח (${rom})`);

  const strength = compactStrength(profile?.muscle_strength);
  if (strength) chunks.push(`כוח: ${strength}`);

  const tests = (profile?.special_tests ?? [])
    .map((t) => t.trim())
    .filter(isMeaningfulClinicalLine)
    .slice(0, 2);
  if (tests.length > 0) chunks.push(tests.join('; '));

  const limitation = extractIntakeFieldBlock(story, 'הגבלה תפקודית');
  if (limitation && isMeaningfulClinicalLine(limitation)) {
    const short = limitation.replace(/\s+/g, ' ').slice(0, 90);
    if (!chunks.some((c) => normKey(c).includes(normKey(short).slice(0, 16)))) {
      chunks.push(`תפקוד: ${short}`);
    }
  }

  return dedupeLines(chunks).join(', ').slice(0, 320);
}

function buildPlanGoals(
  input: CondensedIntakeSnapshotInput,
  story: string,
  profile: PatientClinicalIntakeProfile | undefined
): string {
  const storyGoals = extractIntakeFieldBlock(story, 'מטרות המטופל');
  const goals = compactGoals(profile?.goals, storyGoals);
  if (goals) return goals.slice(0, 280);

  const narrative = input.geminiClinicalNarrative ?? '';
  const planHints = narrative
    .split(/\r?\n/)
    .filter((l) => /מטר|תוכנית|שיקום|חיזוק|מתיח|טווח|יציבות|פרופר/i.test(l))
    .map((l) => l.replace(/^[•\-]\s*/, '').trim())
    .filter(isMeaningfulClinicalLine);
  return dedupeLines(planHints).join(', ').slice(0, 280);
}

function collectUnexaminedLabels(profile: PatientClinicalIntakeProfile | undefined): string[] {
  const slots = buildClinicalIntakeProfileSlots(profile);
  return slots.filter((s) => !s.hasData).map((s) => s.titleHe);
}

export function buildCondensedIntakeSnapshot(
  input: CondensedIntakeSnapshotInput,
  options?: BuildCondensedIntakeSnapshotOptions
): CondensedIntakeSnapshot {
  const narrativeOnly = options?.narrativeOnly ?? false;
  const story = stripTemplateNoise(input.intakeStory?.trim() ?? '');
  const narrative = stripTemplateNoise(input.geminiClinicalNarrative?.trim() ?? '');
  const profile = input.profile;

  const diagnosisText = sanitizeClinicalDisplayText(buildDiagnosisStatus(input, story));
  const impairmentsText = sanitizeClinicalDisplayText(
    buildKeyImpairments(input, story, profile)
  );
  const storyBrief = buildStoryBrief(story);
  const aiBrief = buildAiBrief(narrative, diagnosisText);
  const redLines = extractRedFlagLines(
    story,
    narrative,
    extractHeuristicIntakeRedFlags(`${story}\n${narrative}`)
  );
  if (input.hasRedFlag || input.intakeRedFlag) {
    redLines.push('דגל אדום פעיל במערכת');
  }
  const redText = sanitizeClinicalDisplayText(dedupeLines(redLines).join('; ').slice(0, 280));
  const planText = sanitizeClinicalDisplayText(buildPlanGoals(input, story, profile));

  const sections: CondensedIntakeSection[] = [];
  if (diagnosisText) {
    sections.push({
      id: 'diagnosis_status',
      titleHe: 'אבחנה ומצב',
      text: diagnosisText,
    });
  }

  if (narrativeOnly) {
    if (storyBrief) {
      sections.push({
        id: 'story_brief',
        titleHe: 'תמצית סיפור',
        text: storyBrief,
      });
    }
    if (aiBrief) {
      sections.push({
        id: 'ai_brief',
        titleHe: 'סיכום AI',
        text: aiBrief,
      });
    }
  } else {
    if (impairmentsText) {
      sections.push({
        id: 'key_impairments',
        titleHe: 'ליקויים עיקריים',
        text: impairmentsText,
      });
    }
  }

  if (redText) {
    sections.push({
      id: 'neurological_red_flags',
      titleHe: 'דגלים',
      text: redText,
      emphasis: 'danger',
    });
  }

  if (!narrativeOnly && planText) {
    sections.push({
      id: 'plan_goals',
      titleHe: 'תוכנית ומטרות',
      text: planText,
    });
  }

  return {
    sections,
    unexaminedLabels: narrativeOnly ? [] : collectUnexaminedLabels(profile),
    hasAnyContent: sections.length > 0,
  };
}

export function buildCondensedIntakeSnapshotFromPatient(
  patient: Patient,
  options?: BuildCondensedIntakeSnapshotOptions
): CondensedIntakeSnapshot {
  const profile = patient.clinicalIntakeProfile;
  const story = resolveCoreLegacyIntakeSummaryText(patient) ?? patient.intakeStory ?? '';
  const ex = patient.initialIntakeArchive?.extras;
  const painHistory = patient.analytics?.painHistory ?? [];
  const primaryPain = [...painHistory]
    .filter((r) => r.bodyArea === patient.primaryBodyArea)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const anyPain = [...painHistory].sort((a, b) => b.date.localeCompare(a.date))[0];

  return buildCondensedIntakeSnapshot(
    {
      profile,
      diagnosis: patient.diagnosis,
      clinicalDiagnosis: ex?.clinicalDiagnosis ?? patient.diagnosis,
      geminiClinicalNarrative:
        patient.geminiClinicalNarrative ??
        patient.initialIntakeArchive?.geminiClinicalNarrative ??
        ex?.geminiClinicalNarrative,
      intakeStory: story,
      hasRedFlag: patient.hasRedFlag,
      intakeRedFlag: ex?.intakeRedFlag,
      primaryBodyArea: patient.primaryBodyArea,
      currentPainLevel: primaryPain?.painLevel ?? anyPain?.painLevel ?? null,
    },
    options
  );
}

/** טקסט מובנה לשמירה ב־`geminiClinicalNarrative` — ארבעה מקטעים בלבד */
export function formatCondensedIntakeSnapshotAsNarrative(snapshot: CondensedIntakeSnapshot): string {
  return snapshot.sections
    .map((s) => `${s.titleHe}: ${s.text}`)
    .join('\n');
}
