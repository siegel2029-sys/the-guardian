import { describe, expect, it, vi } from 'vitest';
import { isTransientCloudSyncError, withCloudSyncRetry } from './cloudSyncResilience';
import { mergePulledClinicalInsights } from './supabaseSync';

describe('isTransientCloudSyncError', () => {
  it('treats 5xx / 429 / timeouts as transient', () => {
    expect(isTransientCloudSyncError('boom', 503)).toBe(true);
    expect(isTransientCloudSyncError('Rate limited', 429)).toBe(true);
    expect(isTransientCloudSyncError('network timeout')).toBe(true);
    expect(isTransientCloudSyncError('fetch failed')).toBe(true);
  });

  it('does not retry permanent client / RLS failures', () => {
    expect(isTransientCloudSyncError('new row violates row-level security', 401)).toBe(false);
    expect(isTransientCloudSyncError('invalid input syntax', 400)).toBe(false);
    expect(isTransientCloudSyncError(undefined, 404)).toBe(false);
  });
});

describe('withCloudSyncRetry', () => {
  it('returns immediately on success', async () => {
    const op = vi.fn(async () => ({ ok: true as const }));
    const result = await withCloudSyncRetry(op, { delayMs: 0 });
    expect(result).toEqual({ ok: true });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries once on transient failure then succeeds', async () => {
    const op = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'fetch failed', httpStatus: 503 })
      .mockResolvedValueOnce({ ok: true });
    const onRetry = vi.fn();
    const result = await withCloudSyncRetry(op, { delayMs: 0, onRetry });
    expect(result).toEqual({ ok: true });
    expect(op).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, 'fetch failed');
  });

  it('does not retry permanent failures', async () => {
    const op = vi.fn(async () => ({
      ok: false as const,
      message: 'new row violates row-level security',
      httpStatus: 401,
    }));
    const result = await withCloudSyncRetry(op, { delayMs: 0 });
    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('stops after maxAttempts on persistent transient errors', async () => {
    const op = vi.fn(async () => ({
      ok: false as const,
      message: 'gateway timeout',
      httpStatus: 504,
    }));
    const result = await withCloudSyncRetry(op, { maxAttempts: 2, delayMs: 0 });
    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe('mergePulledClinicalInsights (cloud sync merge hook)', () => {
  it('unions remote + local clinical insight snapshots by id/recency helpers', () => {
    const local = {
      aiSuggestions: [
        {
          id: 's1',
          patientId: 'p1',
          exerciseId: 'e1',
          status: 'pending',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      safetyAlerts: [],
    };
    const remote = {
      aiSuggestions: [
        {
          id: 's1',
          patientId: 'p1',
          exerciseId: 'e1',
          status: 'approved',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 's2',
          patientId: 'p1',
          exerciseId: 'e2',
          status: 'pending',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      safetyAlerts: [
        {
          id: 'a1',
          patientId: 'p1',
          reasonCode: 'pain_spike',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };
    const merged = mergePulledClinicalInsights(local as never, remote as never);
    expect(merged.aiSuggestions.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(merged.aiSuggestions.find((s) => s.id === 's1')?.status).toBe('approved');
    expect(merged.safetyAlerts).toHaveLength(1);
  });
});
