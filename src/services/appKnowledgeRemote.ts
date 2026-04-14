import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeFact } from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';

export type AppKnowledgeBaseRow = {
  items: KnowledgeFact[];
  deletedSeedIds: string[];
};

function parseDeletedSeedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
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
