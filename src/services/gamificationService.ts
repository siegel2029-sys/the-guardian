import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeFact } from '../types';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';
import { devLog, devWarn, redactId } from '../lib/safeLog';

export type AppKnowledgeBaseRow = {
  items: KnowledgeFact[];
  deletedSeedIds: string[];
};

/** מגן מפני תלייה של fetch שלא חוזר — משחרר את יומ הטעינה בהמשך. */
export const APP_KB_FETCH_TIMEOUT_MS = 5000;

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
  const deletedSeedIds = parseDeletedSeedIds(data.deleted_seed_ids);
  let items = normalizeKnowledgeFactsList(rawItems);
  items = items.filter((f) => {
    const sid = f.seedId?.trim();
    if (!sid) return true;
    return !deletedSeedIds.includes(sid);
  });
  if (options?.approvedOnly) {
    items = items.filter((f) => f.isApproved);
  }
  return {
    items,
    deletedSeedIds,
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

function emptyKbRow(): AppKnowledgeBaseRow {
  return { items: [], deletedSeedIds: [] };
}

/** גוף ה-fetch ללא timeout — תמיד `.maybeSingle()` (לא `.single()`). */
async function executeAppKbFetch(
  client: SupabaseClient,
  options?: FetchAppKnowledgeBaseOptions
): Promise<AppKnowledgeBaseRow | null> {
  try {
    const therapistKey = options?.therapistAuthUserId?.trim() ?? '';

    if (therapistKey) {
      let { data, error } = await client
        .from('app_knowledge_base')
        .select('items, deleted_seed_ids, therapist_id, id')
        .eq('id', therapistKey)
        .maybeSingle();

      warnKbMissingTable(error);

      const rawLen =
        data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as unknown[]).length
          : null;

      devLog('[TIP_SYNC] Database returned:', {
        step: 'WHERE id = therapistAuthUserId',
        therapistRef: redactId(therapistKey),
        rowPresent: !!(data && typeof data === 'object'),
        postgrestError: error?.message ?? null,
        rawItemsLength: rawLen,
        rowRef:
          data && typeof data === 'object'
            ? redactId(String((data as Record<string, unknown>).id ?? ''))
            : undefined,
        rowTherapistRef:
          data && typeof data === 'object'
            ? redactId(String((data as Record<string, unknown>).therapist_id ?? ''))
            : undefined,
      });

      if (!error && data && typeof data === 'object') {
        const row = rowToAppKnowledgeBaseRow(data as Record<string, unknown>, options);
        if (row) return row;
      }

      ({ data, error } = await client
        .from('app_knowledge_base')
        .select('items, deleted_seed_ids, therapist_id, id')
        .eq('therapist_id', therapistKey)
        .maybeSingle());

      warnKbMissingTable(error);

      const rawLen2 =
        data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as unknown[]).length
          : null;

      devLog('[TIP_SYNC] Database returned:', {
        step: 'WHERE therapist_id = therapistAuthUserId',
        therapistRef: redactId(therapistKey),
        rowPresent: !!(data && typeof data === 'object'),
        postgrestError: error?.message ?? null,
        rawItemsLength: rawLen2,
      });

      if (!error && data && typeof data === 'object') {
        const row = rowToAppKnowledgeBaseRow(data as Record<string, unknown>, options);
        if (row) return row;
      }

      return null;
    }

    const { data: legacyData, error: legacyErr } = await client
      .from('app_knowledge_base')
      .select('items, deleted_seed_ids, therapist_id, id')
      .eq('id', 'global')
      .maybeSingle();

    warnKbMissingTable(legacyErr);

    devLog('[TIP_SYNC] Database returned:', {
      step: 'WHERE id = global',
      rowPresent: !!(legacyData && typeof legacyData === 'object'),
      postgrestError: legacyErr?.message ?? null,
      rawItemsLength:
        legacyData &&
        typeof legacyData === 'object' &&
        Array.isArray((legacyData as Record<string, unknown>).items)
          ? ((legacyData as Record<string, unknown>).items as unknown[]).length
          : null,
    });

    if (legacyErr || !legacyData || typeof legacyData !== 'object') return null;
    return rowToAppKnowledgeBaseRow(legacyData as Record<string, unknown>, options);
  } catch (e) {
    devWarn('[TIP_SYNC] executeAppKbFetch error', {
      message: e instanceof Error ? e.message : String(e),
    });
    return emptyKbRow();
  }
}

export async function fetchAppKnowledgeBaseFromSupabase(
  client: SupabaseClient,
  options?: FetchAppKnowledgeBaseOptions
): Promise<AppKnowledgeBaseRow | null> {
  const started = Date.now();
  try {
    type Race = { tag: 'ok'; value: AppKnowledgeBaseRow | null } | { tag: 'timeout' };

    const fetchPromise: Promise<Race> = executeAppKbFetch(client, options).then((value) => ({
      tag: 'ok' as const,
      value,
    }));

    const timeoutPromise: Promise<Race> = new Promise((resolve) => {
      setTimeout(() => resolve({ tag: 'timeout' as const }), APP_KB_FETCH_TIMEOUT_MS);
    });

    const outcome = await Promise.race([fetchPromise, timeoutPromise]);

    if (outcome.tag === 'timeout') {
      devWarn(
        `[TIP_SYNC] fetchAppKnowledgeBaseFromSupabase timed out after ${APP_KB_FETCH_TIMEOUT_MS}ms — returning empty items`
      );
      return emptyKbRow();
    }

    return outcome.value;
  } catch (e) {
    devWarn('[TIP_SYNC] fetchAppKnowledgeBaseFromSupabase error', {
      message: e instanceof Error ? e.message : String(e),
    });
    return emptyKbRow();
  } finally {
    devLog('[TIP_SYNC] Fetch sequence ended', { elapsedMs: Date.now() - started });
  }
}
