import type { SupabaseClient } from '@supabase/supabase-js';

export type CompleteExerciseSafeResult =
  | { ok: true }
  | { ok: false; reason?: string; message?: string };

/**
 * Records rehab exercise completion on the server without allowing the client to PATCH exercise_plans.
 * Self-care / strength IDs that are not present in the plan return `ok: false` with a soft reason.
 */
export async function completeExerciseSafe(
  client: SupabaseClient,
  exerciseId: string,
  sessionData: Record<string, unknown>
): Promise<CompleteExerciseSafeResult> {
  const { data, error } = await client.rpc('complete_exercise_safe', {
    p_exercise_id: exerciseId,
    p_session_data: sessionData,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = data as { ok?: boolean; reason?: string } | null;
  if (row && typeof row === 'object' && row.ok === true) {
    return { ok: true };
  }
  return { ok: false, reason: row?.reason };
}
