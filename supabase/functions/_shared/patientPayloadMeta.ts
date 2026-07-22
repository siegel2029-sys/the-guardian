/**
 * Patient push / reminder metadata stored inside `public.patients.payload` (JSONB).
 * No top-level `push_token`, `last_login_at`, or `reminder_timezone` columns required.
 */

export function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readPayloadString(
  patientPayload: unknown,
  camelKey: string,
  snakeKey?: string,
): string | null {
  const root = coerceJsonRecord(patientPayload);
  if (!root) return null;
  const raw = root[camelKey] ?? (snakeKey ? root[snakeKey] : undefined);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Expo or HTTPS Web Push endpoint — `payload.pushToken` (legacy `push_token` key supported). */
export function readPushTokenFromPatientPayload(patientPayload: unknown): string {
  return readPayloadString(patientPayload, "pushToken", "push_token") ?? "";
}

/** IANA timezone for reminder wall-clock — `payload.reminderTimezone`. */
export function readReminderTimezoneFromPatientPayload(patientPayload: unknown): string {
  return readPayloadString(patientPayload, "reminderTimezone", "reminder_timezone") ?? "UTC";
}

/** Portal last-open heartbeat — `payload.lastLoginAt`. */
export function readLastLoginAtFromPatientPayload(patientPayload: unknown): string | null {
  return (
    readPayloadString(patientPayload, "lastLoginAt", "last_login_at") ??
    readPayloadString(patientPayload, "lastActivityTimestamp", "last_activity_timestamp")
  );
}

/** Daily momentum lock (local YYYY-MM-DD) — `payload.lastMomentumReminderLocalDate`. */
export function readLastMomentumReminderLocalDateFromPatientPayload(
  patientPayload: unknown,
): string | null {
  return readPayloadString(
    patientPayload,
    "lastMomentumReminderLocalDate",
    "last_momentum_reminder_local_date",
  );
}

/** Daily standard lock (local YYYY-MM-DD) — `payload.lastStandardReminderLocalDate`. */
export function readLastStandardReminderLocalDateFromPatientPayload(
  patientPayload: unknown,
): string | null {
  return readPayloadString(
    patientPayload,
    "lastStandardReminderLocalDate",
    "last_standard_reminder_local_date",
  );
}

/** Display name from payload (`name` / `firstName`) with id fallback. */
export function readPatientDisplayNameFromPayload(
  patientPayload: unknown,
  fallbackId: string,
): string {
  const root = coerceJsonRecord(patientPayload);
  if (!root) return fallbackId;
  for (const key of ["name", "firstName", "first_name"] as const) {
    const v = root[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return fallbackId;
}

export function mergePatientPayloadFields(
  existingPayload: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> | null {
  const base = coerceJsonRecord(existingPayload);
  if (!base || typeof base.id !== "string" || !base.id.trim()) {
    return null;
  }
  return { ...base, ...fields };
}

/** Clears push delivery fields from payload (preserves all other patient document keys). */
export function stripPushFieldsFromPatientPayload(
  existingPayload: unknown,
): Record<string, unknown> | null {
  const base = coerceJsonRecord(existingPayload);
  if (!base || typeof base.id !== "string" || !base.id.trim()) {
    return null;
  }
  const next = { ...base };
  delete next.pushToken;
  delete next.push_token;
  delete next.webPushSubscription;
  delete next.web_push_subscription;
  delete next.WebPushSubscription;
  return next;
}

/**
 * Payload `status` values that must never receive automated reminders / push.
 * Includes app statuses (`frozen`, `paused`) plus aliases (`inactive`, `suspended`).
 */
export const REMINDER_BLOCKED_PATIENT_STATUSES = [
  "frozen",
  "inactive",
  "suspended",
  "paused",
] as const;

/** True when therapist freeze flag or blocked clinical status should suppress reminders. */
export function patientPayloadBlocksAutomatedReminders(patientPayload: unknown): boolean {
  const root = coerceJsonRecord(patientPayload);
  if (!root) return false;

  const frozenFlag = root.accountFrozen ?? root.account_frozen;
  if (frozenFlag === true || frozenFlag === "true") return true;

  const statusRaw = root.status;
  if (typeof statusRaw !== "string") return false;
  const status = statusRaw.trim().toLowerCase();
  return (REMINDER_BLOCKED_PATIENT_STATUSES as readonly string[]).includes(status);
}

/** Normalized reminder-cron view derived entirely from JSONB payload. */
export type PatientReminderMeta = {
  id: string;
  payload: unknown;
  pushToken: string;
  lastLoginAt: string | null;
  reminderTimezone: string;
  lastMomentumReminderLocalDate: string | null;
  lastStandardReminderLocalDate: string | null;
  displayName: string;
};

export function patientReminderMetaFromRow(row: {
  id: string;
  payload: unknown;
}): PatientReminderMeta {
  return {
    id: row.id,
    payload: row.payload,
    pushToken: readPushTokenFromPatientPayload(row.payload),
    lastLoginAt: readLastLoginAtFromPatientPayload(row.payload),
    reminderTimezone: readReminderTimezoneFromPatientPayload(row.payload),
    lastMomentumReminderLocalDate: readLastMomentumReminderLocalDateFromPatientPayload(row.payload),
    lastStandardReminderLocalDate: readLastStandardReminderLocalDateFromPatientPayload(row.payload),
    displayName: readPatientDisplayNameFromPayload(row.payload, row.id),
  };
}
