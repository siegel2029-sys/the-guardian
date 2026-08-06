import { describe, expect, it } from 'vitest';
import {
  extractFirstName,
  firstNameToLatinLetters,
  portalUsernameFromLeadName,
  temporaryPasswordFromFirstName,
} from './onboardingLeadCredentials';
import { validateNewPassword } from '../lib/passwordPolicy';

describe('extractFirstName / firstNameToLatinLetters', () => {
  it('extracts first token', () => {
    expect(extractFirstName('Dana Levi')).toBe('Dana');
  });

  it('transliterates Hebrew letters', () => {
    expect(firstNameToLatinLetters('דנה').length).toBeGreaterThan(0);
  });
});

describe('temporaryPasswordFromFirstName', () => {
  it('returns high-entropy passwords that pass policy (not name-derived)', () => {
    for (const name of ['Dana', 'Abe', 'דנה', '']) {
      const password = temporaryPasswordFromFirstName(name);
      expect(validateNewPassword(password)).toBeNull();
      expect(password.length).toBeGreaterThanOrEqual(8);
      // Must not embed a predictable first-name prefix.
      expect(password.toLowerCase().startsWith('dana')).toBe(false);
      expect(password.toLowerCase().startsWith('abe')).toBe(false);
    }
  });

  it('produces different values across calls', () => {
    const a = temporaryPasswordFromFirstName('dana');
    const b = temporaryPasswordFromFirstName('dana');
    // Extremely unlikely to collide with 12+ char alphabet.
    expect(a === b).toBe(false);
  });
});

describe('portalUsernameFromLeadName', () => {
  it('builds a valid portal username', () => {
    const u = portalUsernameFromLeadName('Dana', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(u.length).toBeGreaterThanOrEqual(2);
    expect(u.length).toBeLessThanOrEqual(32);
  });
});
