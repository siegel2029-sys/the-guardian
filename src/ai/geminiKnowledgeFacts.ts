import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import type { KnowledgeFact } from '../types';

const LOG_PREFIX = '[GeminiKnowledgeFacts]';

type RawFact = {
  title?: unknown;
  explanation?: unknown;
  sourceUrl?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export type GenerateKnowledgeFactsOptions = {
  /** תואר/התמחות מטפל לשיק הקשר בפרומפט */
  therapistTitle?: string;
};

/**
 * יוצר עובדות "הידעת?" בעברית לפיזיותרפיה — לתור אישור מטפל בלבד.
 */
export async function generateKnowledgeFactsWithGemini(
  options?: GenerateKnowledgeFactsOptions
): Promise<Omit<KnowledgeFact, 'isApproved'>[]> {
  if (!getGeminiApiKey()) {
    throw new Error('חסר VITE_GEMINI_API_KEY');
  }

  const systemInstruction = `אתה עוזר קליני לפיזיותרפיסט/ית בישראל.
החזר אך ורק JSON תקין: מערך של 4 עד 6 אובייקטים.
כל אובייקט: "title" (כותרת קצרה ומושכת), "explanation" (2–4 משפטים בעברית, מדויקים וזהירים קלינית), "sourceUrl" (קישור אמיתי למאמר בPubMed, Cochrane, NIH, CDC או כתב עת מקצועי — חובה URL מלא שמתחיל ב־https).
אין טקסט מחוץ ל־JSON.`;

  const titleLine = options?.therapistTitle?.trim()
    ? `תואר/הקשר מטפל: ${options.therapistTitle.trim()}.`
    : '';
  const userText = `הפק עובדות מגוונות: נוירופלסטיות, ריפוי רקמות, חשיבות תנועה, הידרציה, שינה והתאוששות, אימון כוח בשיקום, כאב כרוני והסברה.
התמחות: פיזיותרפיה (Physical Therapy).
${titleLine}`;

  const text = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.35,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { kind: 'knowledge_facts_batch' },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('תשובת המודל אינה JSON תקין');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('המודל לא החזיר מערך');
  }

  const now = new Date().toISOString();
  const out: Omit<KnowledgeFact, 'isApproved'>[] = [];
  let i = 0;
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as RawFact;
    if (!isNonEmptyString(r.title) || !isNonEmptyString(r.explanation) || !isNonEmptyString(r.sourceUrl)) {
      continue;
    }
    if (!/^https:\/\//i.test(r.sourceUrl.trim())) continue;
    i += 1;
    out.push({
      id: `ai-${Date.now()}-${i}`,
      title: r.title.trim(),
      explanation: r.explanation.trim(),
      sourceUrl: r.sourceUrl.trim(),
      source: 'ai',
      createdAt: now,
    });
  }

  if (out.length === 0) {
    throw new Error('לא נמצאו עובדות תקפות בתשובת המודל');
  }
  return out;
}
