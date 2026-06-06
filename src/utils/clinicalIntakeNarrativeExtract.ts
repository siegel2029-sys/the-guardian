import type { PatientClinicalIntakeProfile } from '../types';
import { stripLibraryExerciseIdsFromClinicalText } from './clinicalIntakeClinicalText';
import { extractIntakeFieldBlock } from './clinicalIntakeTemplate';
import { isClinicalIntakeNegativeAnswer, isClinicalIntakeTextFieldAnswered } from './clinicalIntakeFieldAnswers';

/** Subjective / narrative template fields — belong in case story only. */
const NARRATIVE_FIELD_LABELS = [
  'תלונת המטופל',
  'מנגנון הפציעה',
  'התנהגות הכאב',
  'גורמים מקלים',
  'הגבלה תפקודית',
] as const;

/** Objective exam fields — routed to structured profile slots, not narrative. */
const OBJECTIVE_FIELD_LABELS = [
  'הסתכלות',
  'טווחי תנועה',
  'כוח שרירים',
  'בדיקות מיוחדות',
  'מישוש',
] as const;

const PORTAL_ID_SUFFIX_RE = /\n*\[מזהה פורטל קבוע[^\]]*\]\s*$/;
const SECTION_HEADER_RE = /^---\s*.+?\s*---\s*$/;

function sanitizeText(raw: string): string {
  return stripLibraryExerciseIdsFromClinicalText(raw.trim());
}

function isMeaningfulValue(raw: string | undefined): boolean {
  const t = sanitizeText(raw ?? '');
  if (!t || !isClinicalIntakeTextFieldAnswered(t)) return false;
  if (isClinicalIntakeNegativeAnswer(t)) return false;
  if (/^(?:טרם|לא נבדק|לא נבחן|—|-|\.)$/i.test(t)) return false;
  return true;
}

/** Remove portal/debug suffixes from clinical text. */
export function stripIntakeSystemArtifacts(text: string): string {
  return sanitizeText(text.replace(PORTAL_ID_SUFFIX_RE, ''));
}

function extractAnamnesisSection(raw: string): string | undefined {
  const text = raw.trim();
  if (!text.includes('---')) return undefined;
  const startMatch = text.match(/---\s*אנמנזה[^-\n]*---/i);
  if (!startMatch || startMatch.index == null) return undefined;
  const afterStart = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = afterStart.match(/\r?\n---\s*בדיקה\s*פיזיקלית/i);
  const body = endMatch ? afterStart.slice(0, endMatch.index) : afterStart;
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatLabeledBlock(label: string, value: string): string {
  const clean = sanitizeText(value);
  if (!clean) return '';
  return `${label}: ${clean}`;
}

/**
 * Extract narrative-only case story from full intake text.
 * Objective metrics (ROM, strength, tests) are excluded — use `parseClinicalIntakeProfileFromStory`.
 */
export function extractNarrativeCaseStory(raw: string): string {
  const text = stripIntakeSystemArtifacts(raw);
  if (!text) return '';

  const parts: string[] = [];

  for (const label of NARRATIVE_FIELD_LABELS) {
    const block = extractIntakeFieldBlock(text, label);
    if (block && isMeaningfulValue(block)) {
      const formatted = formatLabeledBlock(label, block);
      if (formatted) parts.push(formatted);
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  const anamnesis = extractAnamnesisSection(text);
  if (anamnesis) {
    const lines = anamnesis
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !SECTION_HEADER_RE.test(l));
    const filtered = lines.filter((line) => {
      const lower = line.toLowerCase();
      return !OBJECTIVE_FIELD_LABELS.some((label) => lower.startsWith(label.toLowerCase()));
    });
    if (filtered.length > 0) {
      return filtered.map(sanitizeText).filter(Boolean).join('\n');
    }
  }

  const withoutObjective = text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t || SECTION_HEADER_RE.test(t)) return false;
      if (/^---\s*בדיקה\s*פיזיקלית/i.test(t)) return false;
      return !OBJECTIVE_FIELD_LABELS.some((label) =>
        t.toLowerCase().startsWith(`${label.toLowerCase()}:`)
      );
    })
    .join('\n')
    .trim();

  return sanitizeText(withoutObjective);
}

/** Flatten objective profile fields into comparable text lines for dedup. */
export function flattenObjectiveProfileContext(
  profile: PatientClinicalIntakeProfile | undefined
): string[] {
  if (!profile) return [];
  const lines: string[] = [];
  for (const r of profile.ranges ?? []) {
    const t = sanitizeText(r);
    if (t) lines.push(t);
  }
  if (profile.muscle_strength?.trim()) {
    lines.push(sanitizeText(profile.muscle_strength));
  }
  for (const t of profile.special_tests ?? []) {
    const s = sanitizeText(t);
    if (s) lines.push(s);
  }
  return lines;
}

function normalizeForCompare(s: string): string {
  return sanitizeText(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapRatio(line: string, context: string): number {
  const lineTokens = normalizeForCompare(line).split(' ').filter((w) => w.length > 2);
  if (lineTokens.length === 0) return 0;
  const ctxNorm = normalizeForCompare(context);
  let overlap = 0;
  for (const t of lineTokens) {
    if (ctxNorm.includes(t)) overlap++;
  }
  return overlap / lineTokens.length;
}

/**
 * Drop AI lines that repeat therapist narrative or objective findings.
 */
export function pruneRedundantAiLine(line: string, therapistContext: string[]): boolean {
  const norm = normalizeForCompare(line);
  if (!norm || norm.length < 6) return false;

  for (const ctx of therapistContext) {
    const normCtx = normalizeForCompare(ctx);
    if (!normCtx) continue;
    if (normCtx.includes(norm) || norm.includes(normCtx)) return true;
    if (tokenOverlapRatio(line, ctx) >= 0.72) return true;
  }
  return false;
}

export function pruneAiInsightList(lines: string[], therapistContext: string[]): string[] {
  return lines
    .map((l) => sanitizeText(l))
    .filter(Boolean)
    .filter((line) => !pruneRedundantAiLine(line, therapistContext));
}

export type AiInsightLists = {
  differentialDiagnosis: string[];
  clinicalConclusionsHe: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  redFlags: string[];
};

export function buildTherapistContextForPruning(
  narrative: string,
  profile?: PatientClinicalIntakeProfile
): string[] {
  const ctx: string[] = [];
  if (narrative.trim()) ctx.push(narrative);
  ctx.push(...flattenObjectiveProfileContext(profile));
  for (const label of [...NARRATIVE_FIELD_LABELS, ...OBJECTIVE_FIELD_LABELS]) {
    const block = extractIntakeFieldBlock(narrative, label);
    if (block && isMeaningfulValue(block)) ctx.push(block);
  }
  return ctx.filter(Boolean);
}

/** Prune all AI insight lists against therapist-entered narrative + objective data. */
export function pruneAiInsightLists(
  lists: AiInsightLists,
  opts: { narrative: string; profile?: PatientClinicalIntakeProfile }
): AiInsightLists {
  const context = buildTherapistContextForPruning(opts.narrative, opts.profile);
  return {
    differentialDiagnosis: pruneAiInsightList(lists.differentialDiagnosis, context),
    clinicalConclusionsHe: pruneAiInsightList(lists.clinicalConclusionsHe, context),
    precautionsHe: pruneAiInsightList(lists.precautionsHe, context),
    recommendedTestsHe: pruneAiInsightList(lists.recommendedTestsHe, context),
    redFlags: pruneAiInsightList(lists.redFlags, context),
  };
}
