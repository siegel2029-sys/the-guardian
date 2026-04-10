import type { KnowledgeFact } from '../types';

export const KNOWLEDGE_TEASER_MAX_CHARS = 50;

function clampTeaser(s: string): string {
  const t = s.trim();
  if (t.length <= KNOWLEDGE_TEASER_MAX_CHARS) return t;
  return t.slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
}

/** ממיר רשומה מ־JSON / גרסאות ישנות לפורמט אחיד (כולל teaser). */
export function normalizeKnowledgeFact(raw: unknown): KnowledgeFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : null;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!id || !title) return null;

  let teaser = typeof o.teaser === 'string' ? o.teaser.trim() : '';
  if (!teaser) teaser = clampTeaser(title);

  const explanation = typeof o.explanation === 'string' ? o.explanation.trim() : '';
  const sourceUrl = typeof o.sourceUrl === 'string' ? o.sourceUrl.trim() : '';
  if (!explanation || !sourceUrl) return null;

  /** ברירת מחדל: מוצג בפורטל אלא אם סומן במפורש false (תאימות ל-JSON ישן) */
  const isApproved = o.isApproved !== false;
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
