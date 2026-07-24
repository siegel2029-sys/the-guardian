import { describe, expect, it } from 'vitest';
import type { Patient } from '../types';
import {
  canonicalizeAccountControl,
  mergeAccountControlForUpsert,
  mergePatientPayloadForUpsert,
  patientPayloadIsFrozen,
} from './patientPayloadMerge';

function basePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    therapistId: 't1',
    name: 'Test Patient',
    age: 30,
    diagnosis: '',
    primaryBodyArea: 'back_lower',
    status: 'active',
    level: 1,
    xp: 10,
    xpForNextLevel: 100,
    currentStreak: 1,
    longestStreak: 2,
    joinDate: '2026-01-01',
    lastSessionDate: '2026-01-02',
    analytics: {
      averageOverallPain: 0,
      painByArea: {},
      averageDifficulty: 0,
      totalSessions: 0,
      painHistory: [],
      sessionHistory: [],
    },
    pendingMessages: 0,
    hasRedFlag: false,
    therapistNotes: '',
    coins: 5,
    injuryHighlightSegments: [],
    secondaryClinicalBodyAreas: [],
    ...overrides,
  };
}

describe('mergeAccountControlForUpsert', () => {
  it('keeps server freeze when stale client sends active', () => {
    const merged = mergeAccountControlForUpsert(
      { accountFrozen: true, status: 'frozen' },
      { accountFrozen: false, status: 'active' }
    );
    expect(merged).toEqual({ accountFrozen: true, status: 'frozen' });
  });

  it('protects legacy paused status from stale active overwrite', () => {
    const merged = mergeAccountControlForUpsert(
      { accountFrozen: undefined, status: 'paused' },
      { accountFrozen: false, status: 'active' }
    );
    expect(merged).toEqual({ accountFrozen: true, status: 'frozen' });
  });

  it('allows intentional unfreeze when trustIncomingAccountControl is set', () => {
    const merged = mergeAccountControlForUpsert(
      { accountFrozen: true, status: 'frozen' },
      { accountFrozen: false, status: 'active' },
      { trustIncomingAccountControl: true }
    );
    expect(merged).toEqual({ accountFrozen: false, status: 'active' });
  });

  it('canonicalizes freeze writes to frozen + flag', () => {
    expect(canonicalizeAccountControl(true, 'paused')).toEqual({
      accountFrozen: true,
      status: 'frozen',
    });
  });
});

describe('mergePatientPayloadForUpsert account control', () => {
  it('does not let stale client wipe XP or unfreeze', () => {
    const existing = basePatient({
      xp: 200,
      coins: 40,
      accountFrozen: true,
      status: 'frozen',
    });
    const incoming = basePatient({
      xp: 0,
      coins: 0,
      accountFrozen: false,
      status: 'active',
    });
    const merged = mergePatientPayloadForUpsert(existing, incoming);
    expect(merged.xp).toBeGreaterThanOrEqual(200);
    expect(merged.coins).toBe(40);
    expect(merged.accountFrozen).toBe(true);
    expect(merged.status).toBe('frozen');
  });

  it('applies intentional unfreeze via trustIncomingAccountControl', () => {
    const existing = basePatient({ accountFrozen: true, status: 'frozen', xp: 50 });
    const incoming = basePatient({ accountFrozen: false, status: 'active', xp: 50 });
    const merged = mergePatientPayloadForUpsert(existing, incoming, {
      trustIncomingAccountControl: true,
    });
    expect(merged.accountFrozen).toBe(false);
    expect(merged.status).toBe('active');
  });

  it('preserves non-frozen status without inventing freeze semantics', () => {
    const existing = basePatient({ status: 'active' });
    delete (existing as { accountFrozen?: boolean }).accountFrozen;
    const incoming = basePatient({ status: 'active', xp: 20, accountFrozen: false });
    const merged = mergePatientPayloadForUpsert(existing, incoming);
    // Merge may set accountFrozen:false; portal upsert path must strip back to server shape.
    expect(merged.status).toBe('active');
    expect(patientPayloadIsFrozen(merged)).toBe(false);
  });
});
