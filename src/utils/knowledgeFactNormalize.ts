import type { KnowledgeFact } from '../types';

export const KNOWLEDGE_TEASER_MAX_CHARS = 50;

function clampTeaser(s: string): string {
  const t = s.trim();
  if (t.length <= KNOWLEDGE_TEASER_MAX_CHARS) return t;
  return t.slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
}

function pickFirstTrimmed(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * ממיר רשומה מ־JSON / גרסאות ישנות לפורמט אחיד (כולל teaser).
 * מקבל במפתחות חלופיים מ-Supabase/ייצוא ישן: `content`, `fact_text`, `body`, `headline`, `url`…
 */
export function normalizeKnowledgeFact(raw: unknown): KnowledgeFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const idRaw = o.id;
  const id =
    typeof idRaw === 'string' && idRaw.length > 0
      ? idRaw
      : typeof idRaw === 'number' && Number.isFinite(idRaw)
        ? String(idRaw)
        : null;
  if (!id) return null;

  let title = pickFirstTrimmed(
    o.title,
    o.headline,
    o.name,
    o.subject,
    o.summary
  );
  const teaserRaw = typeof o.teaser === 'string' ? o.teaser.trim() : '';
  if (!title && teaserRaw) title = clampTeaser(teaserRaw);
  if (!title) {
    const fromBody = pickFirstTrimmed(o.content, o.fact_text, o.explanation, o.body, o.text);
    if (fromBody) title = clampTeaser(fromBody);
  }
  if (!title) return null;

  let teaser = teaserRaw || clampTeaser(title);

  let explanation = pickFirstTrimmed(
    o.explanation,
    o.content,
    o.fact_text,
    o.body,
    o.details,
    o.description,
    o.text,
    ''
  );

  /** קישור — כולל שמות עמודות נפוצים ב־CSV/לייטאבייס */
  const sourceUrl = pickFirstTrimmed(o.sourceUrl, o.source_url, o.url, o.link, o.href);

  /** טקסט מפורש מהמאגר; אם חסר גוף אבל יש כותרת/טיזר — משתמשים בהם */
  if (!explanation) explanation = teaser || title;
  if (!explanation.trim()) return null;

  /** מקור חיצוני חייב להופיע בפריט ב־`items` ב־Supabase */
  if (!sourceUrl.trim()) return null;

  /** פורטל מטופל: מאושר רק כש־`isApproved` / `is_approved` === true במפורש */
  const isApproved =
    o.isApproved === true || (o.is_approved as unknown) === true;
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : undefined;

  return {
    id,
    teaser: clampTeaser(teaser),
    title,
    explanation,
    sourceUrl,
    isApproved,
    source: 'manual',
    createdAt,
  };
}

export function normalizeKnowledgeFactsList(raw: unknown): KnowledgeFact[] {
  if (!Array.isArray(raw)) return [];
  const out: KnowledgeFact[] = [];
  for (const item of raw) {
    const n = normalizeKnowledgeFact(item);
    if (n) out.push(n);
  }
  return out;
}

/** טיפ ידני מהדשבורד — אותה ולידציה כמו ב-useGamification.addManualKnowledgeFact */
export function tryBuildManualKnowledgeFactRow(input: {
  teaser: string;
  title: string;
  explanation: string;
  sourceUrl: string;
}): KnowledgeFact | null {
  const title = input.title.trim();
  const explanation = input.explanation.trim();
  let teaser = input.teaser.trim().slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
  if (!teaser && title) teaser = title.slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
  let sourceUrl = input.sourceUrl.trim();
  if (!title || !explanation || !sourceUrl) return null;
  if (!/^https?:\/\//i.test(sourceUrl)) {
    sourceUrl = `https://${sourceUrl}`;
  }
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    sourceUrl = u.toString();
  } catch {
    return null;
  }
  const id = `dyk-m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    teaser,
    title,
    explanation,
    sourceUrl,
    isApproved: true,
    source: 'manual',
    createdAt: new Date().toISOString(),
  };
}
