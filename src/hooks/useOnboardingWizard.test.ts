import { describe, expect, it } from 'vitest';
import {
  INITIAL_WIZARD_STATE,
  parsePersistedWizardState,
  type OnboardingWizardState,
} from './useOnboardingWizard';

const persistedState: OnboardingWizardState = {
  ...INITIAL_WIZARD_STATE,
  step: 'contact',
  redFlags: {
    trauma: false,
    caudaEquina: false,
    systemic: false,
    motorWeakness: false,
    nightPain: false,
  },
  clinical: {
    painLocation: 'כתף',
    painLevel: 4,
    aggravatingEasing: 'הרמת יד',
    duration: 'עד חודש',
    hardestActivities: 'להתלבש',
    movementFear: 2,
    rehabGoal: 'לחזור לשחות',
  },
  contact: { fullName: 'ישראל', phone: '0501234567', email: 'a@b.com' },
  leadId: 'lead-uuid-1',
};

describe('parsePersistedWizardState', () => {
  it('restores a valid mid-flow session (mobile refresh)', () => {
    const restored = parsePersistedWizardState(JSON.stringify(persistedState));
    expect(restored).not.toBeNull();
    expect(restored?.step).toBe('contact');
    expect(restored?.clinical.painLevel).toBe(4);
    expect(restored?.leadId).toBe('lead-uuid-1');
    expect(restored?.redFlags.trauma).toBe(false);
  });

  it('returns null for missing or malformed payloads', () => {
    expect(parsePersistedWizardState(null)).toBeNull();
    expect(parsePersistedWizardState('')).toBeNull();
    expect(parsePersistedWizardState('not-json{')).toBeNull();
    expect(parsePersistedWizardState('42')).toBeNull();
    expect(parsePersistedWizardState(JSON.stringify({ step: 'bogus' }))).toBeNull();
  });

  it('never resumes a hard-stopped session', () => {
    expect(
      parsePersistedWizardState(JSON.stringify({ ...persistedState, hardStopped: true }))
    ).toBeNull();
  });

  it('never resumes a completed session', () => {
    expect(
      parsePersistedWizardState(JSON.stringify({ ...persistedState, completed: true }))
    ).toBeNull();
  });

  it('sanitizes corrupted field types back to safe defaults', () => {
    const restored = parsePersistedWizardState(
      JSON.stringify({
        ...persistedState,
        redFlags: { trauma: 'yes' },
        clinical: { ...persistedState.clinical, painLevel: 'high' },
        leadId: 123,
      })
    );
    expect(restored).not.toBeNull();
    expect(restored?.redFlags.trauma).toBeNull();
    expect(restored?.clinical.painLevel).toBeNull();
    expect(restored?.leadId).toBeNull();
  });
});
