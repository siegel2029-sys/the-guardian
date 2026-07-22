import { describe, expect, it } from 'vitest';
import {
  patientIsFrozenStatus,
  resolvePatientRosterStatus,
} from './patientRosterMetrics';

describe('patient roster freeze helpers', () => {
  it('treats accountFrozen as frozen roster status', () => {
    expect(
      resolvePatientRosterStatus({
        status: 'active',
        accountFrozen: true,
        portalUsername: 'u1',
      })
    ).toBe('frozen');
    expect(patientIsFrozenStatus({ status: 'active', accountFrozen: true })).toBe(true);
  });

  it('treats legacy paused as frozen for portal gates', () => {
    expect(patientIsFrozenStatus({ status: 'paused', accountFrozen: false })).toBe(true);
  });

  it('promotes pending with portal access to active when not frozen', () => {
    expect(
      resolvePatientRosterStatus({
        status: 'pending',
        accountFrozen: false,
        portalUsername: 'portal_user',
      })
    ).toBe('active');
  });
});
