import type { ClinicalIntakeAiInsights, Patient } from '../types';
import { stripLibraryExerciseIdsFromClinicalText } from './clinicalIntakeClinicalText';
import { extractIntakeFieldBlock } from './clinicalIntakeTemplate';
import { isClinicalIntakeTextFieldAnswered, isClinicalIntakeNegativeAnswer } from './clinicalIntakeFieldAnswers';
import { extractHeuristicIntakeRedFlags } from './intakeRedFlagHeuristics';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';

export type ClinicalIntakeInsightsDisplay = {
  diagnosis: string;
  differentialDiagnosis: string[];
  clinicalConclusions: string[];
  precautions: string[];
  redFlags: string[];
  redFlagAnalysis: string;
  recommendedTests: string[];
  storySummary: string;
  supplementalNarrative: string[];
  hasAnyInsights: boolean;
};

function sanitizeLine(raw: string): string {
  return stripLibraryExerciseIdsFromClinicalText(raw.trim());
}

function isDisplayableLine(raw: string): boolean {
  const t = sanitizeLine(raw);
  if (!t || !isClinicalIntakeTextFieldAnswered(t)) return false;
  if (isClinicalIntakeNegativeAnswer(t)) return false;
  if (/^(?:טרם|לא נבדק|לא נבחן|—|-|\.)$/i.test(t)) return false;
  if (/^lib-[a-z]{2}-\d{2}$/i.test(t)) return false;
  return true;
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = sanitizeLine(raw);
    if (!line || !isDisplayableLine(line)) continue;
    const key = line.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function toBulletList(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•\-–]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 1) return dedupeLines(lines);
  return dedupeLines(
    trimmed.split(/[;،]|(?:\s*·\s*)/).map((s) => s.trim())
  );
}

function mergeInsights(
  ...sources: (ClinicalIntakeAiInsights | undefined)[]
): ClinicalIntakeAiInsights {
  const out: ClinicalIntakeAiInsights = {};
  for (const src of sources) {
    if (!src) continue;
    if (src.differentialDiagnosis?.length) {
      out.differentialDiagnosis = dedupeLines([
        ...(out.differentialDiagnosis ?? []),
        ...src.differentialDiagnosis,
      ]);
    }
    if (src.precautionsHe?.length) {
      out.precautionsHe = dedupeLines([...(out.precautionsHe ?? []), ...src.precautionsHe]);
    }
    if (src.recommendedTestsHe?.length) {
      out.recommendedTestsHe = dedupeLines([
        ...(out.recommendedTestsHe ?? []),
        ...src.recommendedTestsHe,
      ]);
    }
    if (src.redFlags?.length) {
      out.redFlags = dedupeLines([...(out.redFlags ?? []), ...src.redFlags]);
    }
    if (src.redFlagAnalysis?.trim()) {
      out.redFlagAnalysis = src.redFlagAnalysis.trim();
    }
    if (src.clinicalConclusionsHe?.length) {
      out.clinicalConclusionsHe = dedupeLines([
        ...(out.clinicalConclusionsHe ?? []),
        ...src.clinicalConclusionsHe,
      ]);
    }
  }
  return out;
}

const NARRATIVE_SECTION_MAP: Record<string, keyof ClinicalIntakeAiInsights | 'diagnosis' | 'story'> =
  {
    'אבחנה ומצב': 'diagnosis',
    'אבחנה': 'diagnosis',
    'תמצית סיפור': 'story',
    'סיכום ai': 'clinicalConclusionsHe',
    'סיכום AI': 'clinicalConclusionsHe',
    'מסקנות קליניות': 'clinicalConclusionsHe',
    'נימוק קליני': 'clinicalConclusionsHe',
    'אבחנה מבדלת': 'differentialDiagnosis',
    'ממה להיזהר': 'precautionsHe',
    'נקודות דגש': 'precautionsHe',
    'ממה להיזהר / נקודות דגש': 'precautionsHe',
    'דגלים': 'redFlags',
    'דגלים אדומים': 'redFlags',
    'נוירולוגי / דגלים': 'redFlags',
    'בדיקות מומלצות': 'recommendedTestsHe',
    'המלצות': 'recommendedTestsHe',
    'תוכנית ומטרות': 'clinicalConclusionsHe',
  };

function parseStructuredNarrative(narrative: string): {
  insights: ClinicalIntakeAiInsights;
  diagnosis: string;
  storySummary: string;
  supplemental: string[];
} {
  const insights: ClinicalIntakeAiInsights = {};
  let diagnosis = '';
  let storySummary = '';
  const supplemental: string[] = [];

  const clean = sanitizeLine(narrative);
  if (!clean) {
    return { insights, diagnosis, storySummary, supplemental };
  }

  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentKey: keyof ClinicalIntakeAiInsights | 'diagnosis' | 'story' | null = null;
  const buffers: string[] = [];

  const flush = () => {
    if (!currentKey || buffers.length === 0) return;
    const text = buffers.join('\n').trim();
    buffers.length = 0;
    if (!text) return;

    if (currentKey === 'diagnosis') {
      diagnosis = diagnosis ? `${diagnosis}\n${text}` : text;
      return;
    }
    if (currentKey === 'story') {
      storySummary = storySummary ? `${storySummary}\n${text}` : text;
      return;
    }

    const bullets = toBulletList(text);
    const existing = (insights[currentKey] as string[] | undefined) ?? [];
    insights[currentKey] = dedupeLines([...existing, ...bullets]) as never;
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      const heading = line.slice(0, colonIdx).trim();
      const mapped = NARRATIVE_SECTION_MAP[heading] ?? NARRATIVE_SECTION_MAP[heading.toLowerCase()];
      const inlineBody = line.slice(colonIdx + 1).trim();
      if (mapped) {
        flush();
        currentKey = mapped;
        if (inlineBody) buffers.push(inlineBody);
        continue;
      }
    }
    if (currentKey) {
      buffers.push(line);
    } else if (isDisplayableLine(line)) {
      supplemental.push(line);
    }
  }
  flush();

  return { insights, diagnosis, storySummary, supplemental };
}

function firstNonEmpty(...parts: (string | undefined)[]): string {
  for (const p of parts) {
    const t = sanitizeLine(p ?? '');
    if (t && isDisplayableLine(t)) return t;
  }
  return '';
}

export function buildClinicalIntakeInsightsDisplay(patient: Patient): ClinicalIntakeInsightsDisplay {
  const ex = patient.initialIntakeArchive?.extras;
  const story =
    resolveCoreLegacyIntakeSummaryText(patient) ?? patient.intakeStory ?? ex?.intakeStory ?? '';

  const narrative = firstNonEmpty(
    patient.geminiClinicalNarrative,
    patient.initialIntakeArchive?.geminiClinicalNarrative,
    ex?.geminiClinicalNarrative
  );

  const parsed = parseStructuredNarrative(narrative);
  const mergedInsights = mergeInsights(
    patient.clinicalIntakeAiInsights,
    ex?.clinicalIntakeAiInsights,
    parsed.insights
  );

  const reasoning = dedupeLines([
    ...(patient.clinicalReasoningHe ?? []),
    ...(ex?.clinicalReasoningHe ?? []),
    ...(mergedInsights.clinicalConclusionsHe ?? []),
  ]);

  const storySummary =
    parsed.storySummary ||
    sanitizeLine(
      [
        extractIntakeFieldBlock(story, 'תלונת המטופל'),
        extractIntakeFieldBlock(story, 'מנגנון הפציעה'),
        extractIntakeFieldBlock(story, 'התנהגות הכאב'),
      ]
        .filter((line): line is string => Boolean(line && isDisplayableLine(line)))
        .join(' · ')
    );

  const heuristicRed = extractHeuristicIntakeRedFlags(`${story}\n${narrative}`);

  const differentialDiagnosis = dedupeLines([
    ...(mergedInsights.differentialDiagnosis ?? []),
    ...toBulletList(extractIntakeFieldBlock(story, 'אבחנה מבדלת') ?? ''),
  ]);

  const precautions = dedupeLines([
    ...(mergedInsights.precautionsHe ?? []),
    ...toBulletList(extractIntakeFieldBlock(story, 'ממה להיזהר') ?? ''),
    ...toBulletList(extractIntakeFieldBlock(story, 'נקודות דגש') ?? ''),
  ]);

  const redFlags = dedupeLines([
    ...(mergedInsights.redFlags ?? []),
    ...toBulletList(extractIntakeFieldBlock(story, 'דגלים אדומים') ?? ''),
    ...heuristicRed,
    ...(patient.hasRedFlag || ex?.intakeRedFlag ? ['דגל אדום פעיל במערכת'] : []),
  ]);

  const recommendedTests = dedupeLines([
    ...(mergedInsights.recommendedTestsHe ?? []),
    ...toBulletList(extractIntakeFieldBlock(story, 'בדיקות מומלצות') ?? ''),
  ]);

  const diagnosis = firstNonEmpty(
    parsed.diagnosis,
    ex?.clinicalDiagnosis,
    patient.diagnosis,
    narrative.split(/\r?\n/)[0]
  );

  const clinicalConclusions = reasoning.length > 0 ? reasoning : parsed.supplemental;

  const display: ClinicalIntakeInsightsDisplay = {
    diagnosis,
    differentialDiagnosis,
    clinicalConclusions,
    precautions,
    redFlags,
    redFlagAnalysis: sanitizeLine(mergedInsights.redFlagAnalysis ?? ''),
    recommendedTests,
    storySummary,
    supplementalNarrative: parsed.supplemental.filter(
      (line) => !clinicalConclusions.includes(line)
    ),
    hasAnyInsights: Boolean(
      diagnosis ||
        differentialDiagnosis.length ||
        clinicalConclusions.length ||
        precautions.length ||
        redFlags.length ||
        recommendedTests.length ||
        storySummary
    ),
  };

  return display;
}

/** נרטיב מלא לשמירה — שומר עומק קליני (לא תמצית מקוצרת) */
export function formatClinicalIntakeInsightsNarrative(input: {
  diagnosis: string;
  differentialDiagnosis: string[];
  clinicalConclusions: string[];
  precautions: string[];
  redFlags: string[];
  recommendedTests: string[];
  storySummary?: string;
}): string {
  const sections: string[] = [];
  const pushSection = (title: string, lines: string[]) => {
    const clean = dedupeLines(lines);
    if (clean.length === 0) return;
    sections.push(`${title}:\n${clean.map((l) => `• ${l}`).join('\n')}`);
  };

  if (input.diagnosis.trim()) {
    sections.push(`אבחנה ומצב:\n${sanitizeLine(input.diagnosis)}`);
  }
  if (input.storySummary?.trim()) {
    sections.push(`תמצית סיפור:\n${sanitizeLine(input.storySummary)}`);
  }
  pushSection('מסקנות קליניות', input.clinicalConclusions);
  pushSection('אבחנה מבדלת', input.differentialDiagnosis);
  pushSection('ממה להיזהר / נקודות דגש', input.precautions);
  pushSection('דגלים אדומים', input.redFlags);
  pushSection('בדיקות מומלצות', input.recommendedTests);

  return sections.join('\n\n');
}

export function clinicalInsightsToSavePayload(input: {
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  redFlags: string[];
  clinicalConclusions: string[];
  redFlagAnalysis?: string;
}): ClinicalIntakeAiInsights {
  return {
    differentialDiagnosis: dedupeLines(input.differentialDiagnosis),
    precautionsHe: dedupeLines(input.precautionsHe),
    recommendedTestsHe: dedupeLines(input.recommendedTestsHe),
    redFlags: dedupeLines(input.redFlags),
    redFlagAnalysis: input.redFlagAnalysis?.trim() || undefined,
    clinicalConclusionsHe: dedupeLines(input.clinicalConclusions),
  };
}
