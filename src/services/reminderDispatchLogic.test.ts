import { describe, expect, it } from 'vitest';
import {
  evaluateReminderEligibility,
  isTransientPushFailure,
  localWallParts,
  mergePatientPayloadFields,
  MOMENTUM_WINDOW_END_HOUR,
  MOMENTUM_WINDOW_START_HOUR,
  patientLogRef,
  patientPayloadBlocksAutomatedReminders,
  schedulerPayloadBlocksRemindersAfterAccountControl,
  sessionPayloadHasWork,
  shouldEnqueuePatientForReminders,
  STANDARD_REMINDER_LOCAL_HOUR,
  THREE_HOURS_MS,
} from './reminderDispatchLogic';
import { canonicalizeAccountControl, mergeAccountControlForUpsert } from './patientPayloadMerge';

describe('patientPayloadBlocksAutomatedReminders / enqueue gate', () => {
  it('allows active patients with no freeze flag', () => {
    expect(
      shouldEnqueuePatientForReminders({ id: 'p1', status: 'active', accountFrozen: false }),
    ).toBe(true);
    expect(patientPayloadBlocksAutomatedReminders({ id: 'p1', status: 'active' })).toBe(false);
  });

  it('blocks accountFrozen boolean and string "true"', () => {
    expect(patientPayloadBlocksAutomatedReminders({ id: 'p1', accountFrozen: true })).toBe(true);
    expect(patientPayloadBlocksAutomatedReminders({ id: 'p1', account_frozen: 'true' })).toBe(
      true,
    );
    expect(shouldEnqueuePatientForReminders({ id: 'p1', accountFrozen: true })).toBe(false);
  });

  it('blocks frozen / paused / inactive / suspended statuses (case-insensitive)', () => {
    for (const status of ['frozen', 'paused', 'inactive', 'suspended', 'FROZEN', ' Paused ']) {
      expect(patientPayloadBlocksAutomatedReminders({ id: 'p1', status })).toBe(true);
    }
  });

  it('does not block unreadable payloads (defense filter still runs PostgREST)', () => {
    expect(patientPayloadBlocksAutomatedReminders(null)).toBe(false);
    expect(patientPayloadBlocksAutomatedReminders('not-json')).toBe(false);
  });
});

describe('schedulerPayloadBlocksRemindersAfterAccountControl', () => {
  it('blocks after intentional freeze canonicalize', () => {
    expect(
      schedulerPayloadBlocksRemindersAfterAccountControl({
        accountFrozen: true,
        status: 'active',
      }),
    ).toBe(true);
  });

  it('blocks legacy paused via sticky merge → frozen', () => {
    const merged = mergeAccountControlForUpsert(
      { accountFrozen: undefined, status: 'paused' },
      { accountFrozen: false, status: 'active' },
    );
    expect(merged).toEqual({ accountFrozen: true, status: 'frozen' });
    expect(schedulerPayloadBlocksRemindersAfterAccountControl(merged)).toBe(true);
  });

  it('allows active after trusted unfreeze', () => {
    const control = canonicalizeAccountControl(false, 'active');
    expect(schedulerPayloadBlocksRemindersAfterAccountControl(control)).toBe(false);
  });
});

describe('localWallParts / timezone', () => {
  it('resolves Asia/Jerusalem wall clock for a known UTC instant', () => {
    // 2026-07-22T17:00:00Z → 20:00 in Asia/Jerusalem (IDT, UTC+3)
    const wall = localWallParts('2026-07-22T17:00:00.000Z', 'Asia/Jerusalem');
    expect(wall).not.toBeNull();
    expect(wall!.ymd).toBe('2026-07-22');
    expect(wall!.hour).toBe(20);
  });

  it('returns null for invalid timezone', () => {
    expect(localWallParts('2026-07-22T17:00:00.000Z', 'Not/A_Zone')).toBeNull();
  });

  it('returns null for invalid ISO timestamp', () => {
    expect(localWallParts('not-a-date', 'UTC')).toBeNull();
  });
});

describe('sessionPayloadHasWork', () => {
  it('detects completedIds / finishReports / sessionXp', () => {
    expect(sessionPayloadHasWork({ completedIds: ['e1'] })).toBe(true);
    expect(sessionPayloadHasWork({ finish_reports: [{}] })).toBe(true);
    expect(sessionPayloadHasWork({ sessionXp: 10 })).toBe(true);
    expect(sessionPayloadHasWork({ session_xp: '5' })).toBe(true);
    expect(sessionPayloadHasWork({ completedIds: [] })).toBe(false);
    expect(sessionPayloadHasWork({})).toBe(false);
  });
});

describe('evaluateReminderEligibility', () => {
  const base = {
    hasWorkToday: false,
    localHour: 12,
    localYmd: '2026-07-22',
    lastLoginAt: new Date('2026-07-22T09:00:00.000Z').toISOString(),
    lastMomentumReminderLocalDate: null as string | null,
    lastStandardReminderLocalDate: null as string | null,
    nowMs: new Date('2026-07-22T10:00:00.000Z').getTime(),
  };

  it('skips when patient already completed work today', () => {
    expect(evaluateReminderEligibility({ ...base, hasWorkToday: true })).toEqual({
      action: 'skip',
      reason: 'has_work_today',
    });
  });

  it('sends momentum when within 3h activity + day window + unlocked', () => {
    expect(evaluateReminderEligibility(base).action).toBe('momentum');
  });

  it('does not send momentum outside quiet window', () => {
    const d = evaluateReminderEligibility({
      ...base,
      localHour: MOMENTUM_WINDOW_END_HOUR,
      lastLoginAt: new Date(base.nowMs - 30 * 60_000).toISOString(),
    });
    expect(d.action).not.toBe('momentum');
  });

  it('does not send momentum when last login older than 3h', () => {
    const d = evaluateReminderEligibility({
      ...base,
      lastLoginAt: new Date(base.nowMs - THREE_HOURS_MS - 1).toISOString(),
    });
    expect(d.action).not.toBe('momentum');
  });

  it('respects daily momentum lock', () => {
    const d = evaluateReminderEligibility({
      ...base,
      lastMomentumReminderLocalDate: '2026-07-22',
    });
    expect(d.action).not.toBe('momentum');
  });

  it('sends standard at local hour 20 when unlocked and no momentum', () => {
    const d = evaluateReminderEligibility({
      ...base,
      localHour: STANDARD_REMINDER_LOCAL_HOUR,
      lastLoginAt: null,
    });
    expect(d).toEqual({ action: 'standard' });
  });

  it('respects daily standard lock', () => {
    const d = evaluateReminderEligibility({
      ...base,
      localHour: STANDARD_REMINDER_LOCAL_HOUR,
      lastLoginAt: null,
      lastStandardReminderLocalDate: '2026-07-22',
    });
    expect(d.action).toBe('none');
  });

  it('test bypass skips work-today and otherwise returns test_bypass', () => {
    expect(
      evaluateReminderEligibility({ ...base, testBypass: true, hasWorkToday: true }),
    ).toEqual({ action: 'skip', reason: 'has_work_today' });
    expect(evaluateReminderEligibility({ ...base, testBypass: true }).action).toBe('test_bypass');
  });

  it('momentum window constants match Edge cron contract', () => {
    expect(MOMENTUM_WINDOW_START_HOUR).toBe(8);
    expect(MOMENTUM_WINDOW_END_HOUR).toBe(22);
    expect(STANDARD_REMINDER_LOCAL_HOUR).toBe(20);
  });
});

describe('mergePatientPayloadFields (scheduler locks)', () => {
  it('merges daily lock dates without wiping other keys', () => {
    const merged = mergePatientPayloadFields(
      {
        id: 'p1',
        status: 'active',
        pushToken: 'ExponentPushToken[x]',
        reminderTimezone: 'Asia/Jerusalem',
      },
      { lastStandardReminderLocalDate: '2026-07-22' },
    );
    expect(merged).toMatchObject({
      id: 'p1',
      status: 'active',
      pushToken: 'ExponentPushToken[x]',
      lastStandardReminderLocalDate: '2026-07-22',
    });
  });

  it('rejects payloads without id (avoids blind overwrite)', () => {
    expect(mergePatientPayloadFields({ status: 'active' }, { lastMomentumReminderLocalDate: 'x' }))
      .toBeNull();
  });
});

describe('PHI-safe logging + transient push classification', () => {
  it('patientLogRef never echoes full long ids as names', () => {
    expect(patientLogRef('abcdef12-3456-7890')).toBe('abcdef12…');
    expect(patientLogRef('short')).toBe('short');
  });

  it('classifies gateway / timeout failures as transient', () => {
    expect(isTransientPushFailure('HTTP 503: unavailable', 503)).toBe(true);
    expect(isTransientPushFailure('fetch failed')).toBe(true);
    expect(isTransientPushFailure('No valid subscription keys found after parsing', 410)).toBe(
      false,
    );
    expect(isTransientPushFailure('DeviceNotRegistered')).toBe(false);
  });
});
