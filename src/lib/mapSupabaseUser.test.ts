import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getPatientProductTier } from './mapSupabaseUser';

function mockUser(partial: {
  app?: Record<string, unknown>;
  user?: Record<string, unknown>;
}): User {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    app_metadata: partial.app ?? {},
    user_metadata: partial.user ?? {},
    aud: 'authenticated',
    created_at: '',
  } as User;
}

describe('getPatientProductTier', () => {
  it('returns pro when clinic patient_id is in app_metadata', () => {
    expect(getPatientProductTier(mockUser({ app: { patient_id: 'p-1', role: 'patient', tier: 'pro' } }))).toBe(
      'pro'
    );
  });

  it('returns free for explicit freemium claims', () => {
    expect(getPatientProductTier(mockUser({ app: { role: 'patient', tier: 'free' } }))).toBe('free');
  });

  it('returns therapist for app_metadata.role=therapist', () => {
    expect(getPatientProductTier(mockUser({ app: { role: 'therapist' } }))).toBe('therapist');
  });

  it('defaults unknown signups to free (never therapist fail-open)', () => {
    expect(getPatientProductTier(mockUser({}))).toBe('free');
  });

  it('keeps legacy therapist user_metadata when not free', () => {
    expect(getPatientProductTier(mockUser({ user: { role: 'therapist' } }))).toBe('therapist');
  });
});
