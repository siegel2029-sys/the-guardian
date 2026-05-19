import type { SupabaseClient } from '@supabase/supabase-js';
import { logSupabaseCallError } from '../lib/supabaseSessionGuard';

export type CompleteExerciseSafeResult =
  | { ok: true }
  | { ok: false; reason?: string; message?: string };

export async function completeExerciseSafe(
  client: SupabaseClient,
  exerciseId: string,
  sessionData: Record<string, unknown>
): Promise<CompleteExerciseSafeResult> {
  try {
    if (import.meta.env.DEV) {
      console.log('[complete_exercise_safe] RPC invoke:', {
        p_exercise_id: exerciseId,
        p_session_data: sessionData,
      });
    }

    const { data, error } = await client.rpc('complete_exercise_safe', {
      p_exercise_id: exerciseId,
      p_session_data: sessionData,
    });

    if (error) {
      logSupabaseCallError('complete_exercise_safe/rpc', error, { exerciseId });
      return { ok: false, message: error.message };
    }

    const row = data as { ok?: boolean; reason?: string } | null;
    if (row && typeof row === 'object' && row.ok === true) {
      return { ok: true };
    }
    if (row?.reason) {
      console.warn('[complete_exercise_safe] soft fail', { exerciseId, reason: row.reason, data: row });
    }
    return { ok: false, reason: row?.reason };
  } catch (e) {
    logSupabaseCallError('complete_exercise_safe/catch', e, { exerciseId });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
