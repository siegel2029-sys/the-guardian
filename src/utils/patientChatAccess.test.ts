import { describe, expect, it } from 'vitest';
import { isPatientChatAllowed } from './patientChatAccess';

describe('isPatientChatAllowed', () => {
  it('allows chat when flag is missing or true (premium / legacy)', () => {
    expect(isPatientChatAllowed(null)).toBe(true);
    expect(isPatientChatAllowed(undefined)).toBe(true);
    expect(isPatientChatAllowed({})).toBe(true);
    expect(isPatientChatAllowed({ allowChat: true })).toBe(true);
    expect(isPatientChatAllowed({ subscriptionTier: 'premium', allowChat: true })).toBe(
      true
    );
  });

  it('locks chat when allowChat is explicitly false', () => {
    expect(isPatientChatAllowed({ allowChat: false })).toBe(false);
  });

  it('locks chat for Generic even if allowChat is stale true', () => {
    expect(
      isPatientChatAllowed({ subscriptionTier: 'generic', allowChat: true })
    ).toBe(false);
    expect(
      isPatientChatAllowed({ subscriptionTier: 'generic', allowChat: false })
    ).toBe(false);
  });
});
