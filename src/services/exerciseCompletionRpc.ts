import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logSupabaseCallError } from '../lib/supabaseSessionGuard';
import { sanitizeDbErrorMessage } from '../lib/dbErrorSanitizer';
import { devLog, devWarn, redactId } from '../lib/safeLog';

export type CompleteExerciseSafeResult =
  | { ok: true }
  | { ok: false; reason?: string; message?: string };

/** Boundary schema — mirrors what `complete_exercise_safe` accepts. Rejects malformed payloads before the RPC. */
export const completeExerciseSessionDataSchema = z
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

export const exerciseIdSchema = z.string().min(1).max(128);

/** Pure client-side validation shared with Vitest (no network). */
export function validateCompleteExerciseSafeInput(
  exerciseId: string,
  sessionData: Record<string, unknown>,
):
  | { ok: true; exerciseId: string; sessionData: z.infer<typeof completeExerciseSessionDataSchema> }
  | { ok: false; reason: 'invalid_payload'; message: string } {
  const idParsed = exerciseIdSchema.safeParse(exerciseId);
  const dataParsed = completeExerciseSessionDataSchema.safeParse(sessionData);
  if (!idParsed.success || !dataParsed.success) {
    const issues = [
      ...(idParsed.success ? [] : idParsed.error.issues),
      ...(dataParsed.success ? [] : dataParsed.error.issues),
    ]
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: 'invalid_payload', message: issues };
  }
  return { ok: true, exerciseId: idParsed.data, sessionData: dataParsed.data };
}

export async function completeExerciseSafe(
  client: SupabaseClient,
  exerciseId: string,
  sessionData: Record<string, unknown>
): Promise<CompleteExerciseSafeResult> {
  const validated = validateCompleteExerciseSafeInput(exerciseId, sessionData);
  if (!validated.ok) {
    devWarn('[complete_exercise_safe] invalid payload rejected client-side', {
      message: validated.message,
    });
    return { ok: false, reason: validated.reason, message: validated.message };
  }

  try {
    devLog('[complete_exercise_safe] RPC invoke', {
      exerciseRef: redactId(validated.exerciseId),
      clinical_date: validated.sessionData.clinical_date,
      patientRef: redactId(validated.sessionData.patient_id),
    });

    const { data, error } = await client.rpc('complete_exercise_safe', {
      p_exercise_id: validated.exerciseId,
      p_session_data: validated.sessionData,
    });

    if (error) {
      logSupabaseCallError('complete_exercise_safe/rpc', error, {
        exerciseRef: redactId(validated.exerciseId),
      });
      return { ok: false, message: sanitizeDbErrorMessage(error.message) };
    }

    const row = data as { ok?: boolean; reason?: string } | null;
    if (row && typeof row === 'object' && row.ok === true) {
      return { ok: true };
    }
    if (row?.reason) {
      devWarn('[complete_exercise_safe] soft fail', {
        exerciseRef: redactId(validated.exerciseId),
        reason: row.reason,
      });
    }
    return { ok: false, reason: row?.reason };
  } catch (e) {
    logSupabaseCallError('complete_exercise_safe/catch', e, {
      exerciseRef: redactId(validated.exerciseId),
    });
    return { ok: false, message: sanitizeDbErrorMessage(e instanceof Error ? e.message : String(e)) };
  }
}
