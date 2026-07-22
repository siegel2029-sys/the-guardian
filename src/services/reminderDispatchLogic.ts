/**
 * Pure reminder dispatch / freeze-gate contracts (Node + Vitest).
 * Runtime cron uses the Deno twin under `supabase/functions/_shared/reminderEligibility.ts`
 * and `patientPayloadMeta.ts` — keep behavioral parity when changing either side.
 */
import type { PatientStatus } from '../types';
import { canonicalizeAccountControl } from './patientPayloadMerge';

export const STANDARD_REMINDER_LOCAL_HOUR = 20;
export const MOMENTUM_WINDOW_START_HOUR = 8;
export const MOMENTUM_WINDOW_END_HOUR = 22;
export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export const REMINDER_BLOCKED_PATIENT_STATUSES = [
  'frozen',
  'inactive',
  'suspended',
  'paused',
] as const;

export function patientLogRef(patientId: string): string {
  const id = patientId.trim();
  if (!id) return 'unknown';
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

export function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function patientPayloadBlocksAutomatedReminders(patientPayload: unknown): boolean {
  const root = coerceJsonRecord(patientPayload);
  if (!root) return false;

  const frozenFlag = root.accountFrozen ?? root.account_frozen;
  if (frozenFlag === true || frozenFlag === 'true') return true;

  const statusRaw = root.status;
  if (typeof statusRaw !== 'string') return false;
  const status = statusRaw.trim().toLowerCase();
  return (REMINDER_BLOCKED_PATIENT_STATUSES as readonly string[]).includes(status);
}

export function shouldEnqueuePatientForReminders(patientPayload: unknown): boolean {
  return !patientPayloadBlocksAutomatedReminders(patientPayload);
}

export function localWallParts(
  isoUtc: string,
  tz: string,
): { ymd: string; hour: number } | null {
  try {
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return null;
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const hourStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).format(d);
    let hour = Number.parseInt(hourStr, 10);
    if (!ymd || Number.isNaN(hour)) return null;
    if (hour === 24) hour = 0;
    return { ymd, hour };
  } catch {
    return null;
  }
}

export function sessionPayloadHasWork(payload: unknown): boolean {
  const coerced = coerceJsonRecord(payload);
  if (!coerced) return false;
  const o = coerced;
  const c = o.completedIds ?? o.completed_ids;
  if (Array.isArray(c) && c.length > 0) return true;
  const fr = o.finishReports ?? o.finish_reports;
  if (Array.isArray(fr) && fr.length > 0) return true;
  const xp = o.sessionXp ?? o.session_xp;
  if (typeof xp === 'number' && xp > 0) return true;
  if (typeof xp === 'string' && Number.parseFloat(xp) > 0) return true;
  return false;
}

export type ReminderEligibilityInput = {
  hasWorkToday: boolean;
  localHour: number;
  localYmd: string;
  lastLoginAt: string | null;
  lastMomentumReminderLocalDate: string | null;
  lastStandardReminderLocalDate: string | null;
  nowMs: number;
  testBypass?: boolean;
};

export type ReminderEligibilityDecision =
  | { action: 'skip'; reason: string }
  | { action: 'test_bypass' }
  | { action: 'momentum' }
  | { action: 'standard' }
  | { action: 'none'; reasons: string[] };

export function evaluateReminderEligibility(
  input: ReminderEligibilityInput,
): ReminderEligibilityDecision {
  if (input.testBypass) {
    if (input.hasWorkToday) {
      return { action: 'skip', reason: 'has_work_today' };
    }
    return { action: 'test_bypass' };
  }

  if (input.hasWorkToday) {
    return { action: 'skip', reason: 'has_work_today' };
  }

  const msSinceActivity = input.lastLoginAt
    ? input.nowMs - new Date(input.lastLoginAt).getTime()
    : Number.POSITIVE_INFINITY;
  const within3h =
    input.lastLoginAt != null &&
    Number.isFinite(msSinceActivity) &&
    msSinceActivity <= THREE_HOURS_MS &&
    msSinceActivity >= 0;

  const inMomentumDayWindow =
    input.localHour >= MOMENTUM_WINDOW_START_HOUR &&
    input.localHour < MOMENTUM_WINDOW_END_HOUR;

  const momentumBlocked: string[] = [];
  if (!input.lastLoginAt) momentumBlocked.push('missing_last_login_at');
  if (input.lastLoginAt && !within3h) {
    momentumBlocked.push('last_login_older_than_3h');
  }
  if (input.lastMomentumReminderLocalDate === input.localYmd) {
    momentumBlocked.push('already_sent_momentum_today');
  }
  if (!inMomentumDayWindow) {
    momentumBlocked.push('outside_momentum_quiet_window');
  }

  if (
    Boolean(input.lastLoginAt) &&
    within3h &&
    input.lastMomentumReminderLocalDate !== input.localYmd &&
    inMomentumDayWindow
  ) {
    return { action: 'momentum' };
  }

  const standardBlocked: string[] = [];
  if (input.lastStandardReminderLocalDate === input.localYmd) {
    standardBlocked.push('already_sent_standard_today');
  }
  if (input.localHour !== STANDARD_REMINDER_LOCAL_HOUR) {
    standardBlocked.push(`standard_only_at_local_hour_${STANDARD_REMINDER_LOCAL_HOUR}`);
  }

  if (
    input.localHour === STANDARD_REMINDER_LOCAL_HOUR &&
    input.lastStandardReminderLocalDate !== input.localYmd
  ) {
    return { action: 'standard' };
  }

  return {
    action: 'none',
    reasons: [...momentumBlocked, ...standardBlocked],
  };
}

export function isTransientPushFailure(detail: string | undefined, statusCode?: number): boolean {
  if (statusCode != null && [408, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }
  if (!detail) return false;
  const m = detail.toLowerCase();
  return /timeout|temporar|econnreset|network|fetch failed|503|502|429|gateway|unavailable/.test(
    m,
  );
}

/**
 * After a therapist freeze / status write, JSONB must block cron enrollment.
 */
export function schedulerPayloadBlocksRemindersAfterAccountControl(input: {
  accountFrozen?: boolean;
  status?: PatientStatus | string | null;
}): boolean {
  const status = (input.status ?? 'active') as PatientStatus;
  const control = canonicalizeAccountControl(input.accountFrozen === true, status);
  return patientPayloadBlocksAutomatedReminders({
    id: 'scheduler-contract',
    accountFrozen: control.accountFrozen,
    status: control.status,
  });
}

/** Merge reminder lock / timezone fields into an existing patient JSON document. */
export function mergePatientPayloadFields(
  existingPayload: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> | null {
  const base = coerceJsonRecord(existingPayload);
  if (!base || typeof base.id !== 'string' || !base.id.trim()) {
    return null;
  }
  return { ...base, ...fields };
}
