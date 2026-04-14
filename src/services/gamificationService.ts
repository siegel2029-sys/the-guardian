import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeFact } from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';

export type GamificationPushResult = { ok: true } | { ok: false; message: string };

export type AppKnowledgeBaseRow = {
  items: KnowledgeFact[];
  deletedSeedIds: string[];
};

function parseDeletedSeedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Global "הידעת?" / Guardi knowledge base row — shop-adjacent content sync lives in patient payload;
 * this table holds curated facts and seed deletion tracking.
 */
export async function upsertGlobalAppKnowledgeBase(
  client: SupabaseClient,
  knowledgeItems: KnowledgeFact[],
  now: string
): Promise<GamificationPushResult> {
  const { error: kbError } = await client.from('app_knowledge_base').upsert(
    {
      id: 'global',
      items: knowledgeItems,
      deleted_seed_ids: [],
      updated_at: now,
    },
    { onConflict: 'id' }
  );
  if (kbError) {
    const code = 'code' in kbError ? String((kbError as { code?: string }).code) : '';
    const isMissingTable =
      code === 'PGRST205' ||
      /404|not find the table|schema cache/i.test(kbError.message ?? '');
    const hint = isMissingTable
      ? ' — יש להחיל מיגרציות (app_knowledge_base + deleted_seed_ids) על פרויקט Supabase המקושר.'
      : '';
    return { ok: false, message: `app_knowledge_base: ${kbError.message}${hint}` };
  }

  return { ok: true };
}

export async function fetchAppKnowledgeBaseFromSupabase(
  client: SupabaseClient
): Promise<AppKnowledgeBaseRow | null> {
  const { data, error } = await client
    .from('app_knowledge_base')
    .select('items, deleted_seed_ids')
    .eq('id', 'global')
    .maybeSingle();

  if (error) {
    const code = 'code' in error ? String((error as { code?: string }).code) : '';
    if (
      import.meta.env.DEV &&
      (code === 'PGRST205' || /404|not find the table/i.test(error.message ?? ''))
    ) {
      console.warn(
        '[app_knowledge_base] טבלה חסרה או לא בשכבת ה־schema. הריצו מיגרציות (למשל 20260410200000 + 20260411120000) או תיקון idempotent: 20260414120000_repair_app_knowledge_base.sql — ב-SQL Editor או npm run supabase:link && npm run supabase:push'
      );
    }
    return null;
  }
  if (!data) return null;
  const rawItems = data.items;
  if (!Array.isArray(rawItems)) return null;
  return {
    items: normalizeKnowledgeFactsList(rawItems),
    deletedSeedIds: parseDeletedSeedIds(data.deleted_seed_ids),
  };
}
