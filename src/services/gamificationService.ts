import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeFact } from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';

export type AppKnowledgeBaseRow = {
  items: KnowledgeFact[];
  deletedSeedIds: string[];
};

/** `approvedOnly` — פורטל מטופל: רק פריטים עם `is_approved` / `isApproved` === true אחרי הנירמול. */
export type FetchAppKnowledgeBaseOptions = {
  approvedOnly?: boolean;
  /**
   * מטפל: `auth.uid()` של המטפל המחובר — טעינת השורה לפי `therapist_id` (ואז גיבוי לפי `id`).
   * פורטל מטופל: העברת `patient.therapistId` מה-payload (מזהה המטפל האחראי).
   */
  therapistAuthUserId?: string | null;
};

function parseDeletedSeedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function rowToAppKnowledgeBaseRow(
  data: Record<string, unknown>,
  options?: FetchAppKnowledgeBaseOptions
): AppKnowledgeBaseRow | null {
  const rawItems = data.items;
  if (!Array.isArray(rawItems)) return null;
  let items = normalizeKnowledgeFactsList(rawItems);
  if (options?.approvedOnly) {
    items = items.filter((f) => f.isApproved);
  }
  return {
    items,
    deletedSeedIds: parseDeletedSeedIds(data.deleted_seed_ids),
  };
}

function warnKbMissingTable(error: PostgrestError | null): void {
  if (!error) return;
  const code = 'code' in error ? String((error as { code?: string }).code) : '';
  if (
    import.meta.env.DEV &&
    (code === 'PGRST205' || /404|not find the table/i.test(error.message ?? ''))
  ) {
    console.warn(
      '[app_knowledge_base] טבלה חסרה או לא בשכבת ה־schema. הריצו מיגרציות (למשל 20260410200000 + 20260411120000) או תיקון idempotent: 20260414120000_repair_app_knowledge_base.sql — ב-SQL Editor או npm run supabase:link && npm run supabase:push'
    );
  }
}

export async function fetchAppKnowledgeBaseFromSupabase(
  client: SupabaseClient,
  options?: FetchAppKnowledgeBaseOptions
): Promise<AppKnowledgeBaseRow | null> {
  const therapistKey = options?.therapistAuthUserId?.trim() ?? '';

  if (therapistKey) {
    let { data, error } = await client
      .from('app_knowledge_base')
      .select('items, deleted_seed_ids, therapist_id, id')
      .eq('therapist_id', therapistKey)
      .maybeSingle();

    warnKbMissingTable(error);
    if (!error && data && typeof data === 'object') {
      const row = rowToAppKnowledgeBaseRow(data as Record<string, unknown>, options);
      if (row) return row;
    }

    ({ data, error } = await client
      .from('app_knowledge_base')
      .select('items, deleted_seed_ids, therapist_id, id')
      .eq('id', therapistKey)
      .maybeSingle());

    warnKbMissingTable(error);
    if (!error && data && typeof data === 'object') {
      const row = rowToAppKnowledgeBaseRow(data as Record<string, unknown>, options);
      if (row) return row;
    }
  }

  const { data: legacyData, error: legacyErr } = await client
    .from('app_knowledge_base')
    .select('items, deleted_seed_ids, therapist_id, id')
    .eq('id', 'global')
    .maybeSingle();

  warnKbMissingTable(legacyErr);
  if (legacyErr || !legacyData || typeof legacyData !== 'object') return null;
  return rowToAppKnowledgeBaseRow(legacyData as Record<string, unknown>, options);
}
