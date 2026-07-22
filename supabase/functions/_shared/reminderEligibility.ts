/**
 * Pure reminder schedule / eligibility helpers for reminder-cron.
 * Kept Deno-free so Vitest can import and lock the contract.
 */

import {
  coerceJsonRecord,
  patientPayloadBlocksAutomatedReminders,
} from "./patientPayloadMeta.ts";

/** Standard reminder fires only at this local hour (24h). */
export const STANDARD_REMINDER_LOCAL_HOUR = 20;
/** Momentum nudges allowed from this hour (inclusive). */
export const MOMENTUM_WINDOW_START_HOUR = 8;
/** Latest local hour (exclusive) for momentum; quiet hours begin at 22:00. */
export const MOMENTUM_WINDOW_END_HOUR = 22;

export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/** Opaque log label — never patient names (PHI). */
export function patientLogRef(patientId: string): string {
  const id = patientId.trim();
  if (!id) return "unknown";
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/**
 * Local wall-clock parts in an IANA timezone.
 * Normalizes Intl quirks where some engines emit hour `24` for midnight.
 */
export function localWallParts(
  isoUtc: string,
  tz: string,
): { ymd: string; hour: number } | null {
  try {
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return null;
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
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

/** True when a session_history payload records completed work. */
export function sessionPayloadHasWork(payload: unknown): boolean {
  const coerced = coerceJsonRecord(payload);
  if (!coerced) return false;
  const o = coerced;
  const c = o.completedIds ?? o.completed_ids;
  if (Array.isArray(c) && c.length > 0) return true;
  const fr = o.finishReports ?? o.finish_reports;
  if (Array.isArray(fr) && fr.length > 0) return true;
  const xp = o.sessionXp ?? o.session_xp;
  if (typeof xp === "number" && xp > 0) return true;
  if (typeof xp === "string" && Number.parseFloat(xp) > 0) return true;
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
  /** When true, ignore schedule / quiet hours / 3h / daily locks (session gate still applies). */
  testBypass?: boolean;
};

export type ReminderEligibilityDecision =
  | { action: "skip"; reason: string }
  | { action: "test_bypass" }
  | { action: "momentum" }
  | { action: "standard" }
  | { action: "none"; reasons: string[] };

export function evaluateReminderEligibility(
  input: ReminderEligibilityInput,
): ReminderEligibilityDecision {
  if (input.testBypass) {
    if (input.hasWorkToday) {
      return { action: "skip", reason: "has_work_today" };
    }
    return { action: "test_bypass" };
  }

  if (input.hasWorkToday) {
    return { action: "skip", reason: "has_work_today" };
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
  if (!input.lastLoginAt) momentumBlocked.push("missing_last_login_at");
  if (input.lastLoginAt && !within3h) {
    momentumBlocked.push("last_login_older_than_3h");
  }
  if (input.lastMomentumReminderLocalDate === input.localYmd) {
    momentumBlocked.push("already_sent_momentum_today");
  }
  if (!inMomentumDayWindow) {
    momentumBlocked.push("outside_momentum_quiet_window");
  }

  if (
    Boolean(input.lastLoginAt) &&
    within3h &&
    input.lastMomentumReminderLocalDate !== input.localYmd &&
    inMomentumDayWindow
  ) {
    return { action: "momentum" };
  }

  const standardBlocked: string[] = [];
  if (input.lastStandardReminderLocalDate === input.localYmd) {
    standardBlocked.push("already_sent_standard_today");
  }
  if (input.localHour !== STANDARD_REMINDER_LOCAL_HOUR) {
    standardBlocked.push(`standard_only_at_local_hour_${STANDARD_REMINDER_LOCAL_HOUR}`);
  }

  if (
    input.localHour === STANDARD_REMINDER_LOCAL_HOUR &&
    input.lastStandardReminderLocalDate !== input.localYmd
  ) {
    return { action: "standard" };
  }

  return {
    action: "none",
    reasons: [...momentumBlocked, ...standardBlocked],
  };
}

/** HTTP / gateway errors that are worth a single retry before failing the patient. */
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
 * Cron query eligibility: frozen / paused / inactive / suspended must not enter the dispatch loop.
 * Defense-in-depth companion to PostgREST filters.
 */
export function shouldEnqueuePatientForReminders(patientPayload: unknown): boolean {
  return !patientPayloadBlocksAutomatedReminders(patientPayload);
}
