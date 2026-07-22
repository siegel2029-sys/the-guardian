import { describe, expect, it } from 'vitest';
import {
  collectPatientPhiTokens,
  patientInitialsFromName,
  scrubKnownPatientPhi,
  scrubPhiPatterns,
} from './clinicalConsultantContext';

describe('PHI scrub helpers', () => {
  it('builds initials without full name', () => {
    expect(patientInitialsFromName('ישראל ישראלי')).toBe('י.י.');
    expect(patientInitialsFromName('Ada Lovelace')).toBe('A.L.');
  });

  it('scrubs Hebrew name tokens from free text', () => {
    const tokens = collectPatientPhiTokens({
      name: 'ישראל ישראלי',
      portalUsername: 'israel_portal',
    });
    const scrubbed = scrubKnownPatientPhi(
      'המטופל ישראל ישראלי התלונן על כאב',
      tokens,
      'י.י.'
    );
    expect(scrubbed).not.toContain('ישראל');
    expect(scrubbed).toContain('י.י.');
  });

  it('scrubs email and phone-like patterns', () => {
    const s = scrubPhiPatterns('email me at test@example.com or 050-1234567');
    expect(s).not.toContain('test@example.com');
    expect(s).not.toMatch(/050/);
  });
});
