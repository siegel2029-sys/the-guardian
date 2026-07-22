import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logSupabaseCallError } from '../lib/supabaseSessionGuard';
import { sanitizeDbErrorMessage } from '../lib/dbErrorSanitizer';

export type CompleteExerciseSafeResult =
  | { ok: true }
  | { ok: false; reason?: string; message?: string };

/** Boundary schema — mirrors what `complete_exercise_safe` accepts. Rejects malformed payloads before the RPC. */
const completeExerciseSessionDataSchema = z
  .object({
    pain_level: z.number().min(0).max(10).nullish(),
    effort_rating: z.number().min(0).max(10).nullish(),
    clinical_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    optional_pool_no_reward: z.boolean().optional(),
    session_body_area: z.string().max(64).nullish(),
    plan_row_id: z.string().max(64).nullish(),
    patient_id: z.string().min(1).max(64),
    is_manual_plan: z.boolean().optional(),
  })
  .passthrough();

const exerciseIdSchema = z.string().min(1).max(128);

export async function completeExerciseSafe(
  client: SupabaseClient,
  exerciseId: string,
  sessionData: Record<string, unknown>
): Promise<CompleteExerciseSafeResult> {
  const idParsed = exerciseIdSchema.safeParse(exerciseId);
  const dataParsed = completeExerciseSessionDataSchema.safeParse(sessionData);
  if (!idParsed.success || !dataParsed.success) {
    const issues = [
      ...(idParsed.success ? [] : idParsed.error.issues),
      ...(dataParsed.success ? [] : dataParsed.error.issues),
    ]
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    console.warn('[complete_exercise_safe] invalid payload rejected client-side:', issues);
    return { ok: false, reason: 'invalid_payload', message: issues };
  }

  try {
    if (import.meta.env.DEV) {
      console.log('[complete_exercise_safe] RPC invoke:', {
        p_exercise_id: exerciseId,
        p_session_data: sessionData,
      });
    }

    const { data, error } = await client.rpc('complete_exercise_safe', {
      p_exercise_id: exerciseId,
      p_session_data: dataParsed.data,
    });

    if (error) {
      logSupabaseCallError('complete_exercise_safe/rpc', error, { exerciseId });
      return { ok: false, message: sanitizeDbErrorMessage(error.message) };
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
    return { ok: false, message: sanitizeDbErrorMessage(e instanceof Error ? e.message : String(e)) };
  }
}
