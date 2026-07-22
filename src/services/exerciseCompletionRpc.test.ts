import { describe, expect, it, vi } from 'vitest';
import {
  completeExerciseSafe,
  validateCompleteExerciseSafeInput,
} from './exerciseCompletionRpc';

const validSession = {
  clinical_date: '2026-07-22',
  patient_id: 'patient-abc-123',
  pain_level: 3,
  effort_rating: 5,
};

describe('validateCompleteExerciseSafeInput', () => {
  it('accepts a well-formed exercise id + session payload', () => {
    const result = validateCompleteExerciseSafeInput('ex-1', validSession);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exerciseId).toBe('ex-1');
      expect(result.sessionData.clinical_date).toBe('2026-07-22');
      expect(result.sessionData.patient_id).toBe('patient-abc-123');
    }
  });

  it('rejects empty exercise id', () => {
    const result = validateCompleteExerciseSafeInput('', validSession);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_payload');
  });

  it('rejects non-ISO clinical_date', () => {
    const result = validateCompleteExerciseSafeInput('ex-1', {
      ...validSession,
      clinical_date: '22/07/2026',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects missing patient_id', () => {
    const { patient_id: _drop, ...rest } = validSession;
    const result = validateCompleteExerciseSafeInput('ex-1', rest);
    expect(result.ok).toBe(false);
  });

  it('rejects pain_level out of range', () => {
    const result = validateCompleteExerciseSafeInput('ex-1', {
      ...validSession,
      pain_level: 99,
    });
    expect(result.ok).toBe(false);
  });
});

describe('completeExerciseSafe', () => {
  it('returns invalid_payload without calling rpc when schema fails', async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as Parameters<typeof completeExerciseSafe>[0];
    const result = await completeExerciseSafe(client, '', validSession);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_payload');
      expect(result.message).toBeTruthy();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps ok:true rpc payload to success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const client = { rpc } as unknown as Parameters<typeof completeExerciseSafe>[0];
    const result = await completeExerciseSafe(client, 'ex-1', validSession);
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('complete_exercise_safe', {
      p_exercise_id: 'ex-1',
      p_session_data: expect.objectContaining({
        clinical_date: '2026-07-22',
        patient_id: 'patient-abc-123',
      }),
    });
  });

  it('maps soft-fail reason without throwing', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, reason: 'no_active_plan' },
      error: null,
    });
    const client = { rpc } as unknown as Parameters<typeof completeExerciseSafe>[0];
    const result = await completeExerciseSafe(client, 'ex-1', validSession);
    expect(result).toEqual({ ok: false, reason: 'no_active_plan' });
  });

  it('returns sanitized failure when rpc errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table patients' },
    });
    const client = { rpc } as unknown as Parameters<typeof completeExerciseSafe>[0];
    const result = await completeExerciseSafe(client, 'ex-1', validSession);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.message).toBe('string');
      expect((result.message ?? '').length).toBeGreaterThan(0);
    }
  });
});
