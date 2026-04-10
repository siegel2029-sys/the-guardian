import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeFact } from '../types';

export async function fetchAppKnowledgeBaseFromSupabase(
  client: SupabaseClient
): Promise<KnowledgeFact[] | null> {
  const { data, error } = await client
    .from('app_knowledge_base')
    .select('items')
    .eq('id', 'global')
    .maybeSingle();

  if (error || !data) return null;
  const raw = data.items;
  if (!Array.isArray(raw)) return null;
  return raw as KnowledgeFact[];
}
