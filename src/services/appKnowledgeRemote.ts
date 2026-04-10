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

  if (error || !data) return null;
  const rawItems = data.items;
  if (!Array.isArray(rawItems)) return null;
  return {
    items: normalizeKnowledgeFactsList(rawItems),
    deletedSeedIds: parseDeletedSeedIds(data.deleted_seed_ids),
  };
}
