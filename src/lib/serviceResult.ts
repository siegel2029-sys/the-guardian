/**
 * Canonical service-layer result shape (Physio-Shield).
 * Prefer this over ad-hoc `{ error }` / `{ reason }` on new or refactored APIs.
 */

export type ServiceSuccess<T = void> = T extends void
  ? { ok: true }
  : { ok: true; data: T };

export type ServiceFailure = {
  ok: false;
  message: string;
  /** Optional machine-readable code (e.g. push register skip reasons). */
  reason?: string;
  httpStatus?: number;
};

export type ServiceResult<T = void> = ServiceSuccess<T> | ServiceFailure;

export function serviceOk(): { ok: true };
export function serviceOk<T>(data: T): { ok: true; data: T };
export function serviceOk<T>(data?: T): { ok: true } | { ok: true; data: T } {
  if (arguments.length === 0) return { ok: true };
  return { ok: true, data: data as T };
}

export function serviceFail(
  message: string,
  extra?: { reason?: string; httpStatus?: number },
): ServiceFailure {
  return {
    ok: false,
    message,
    ...(extra?.reason !== undefined ? { reason: extra.reason } : {}),
    ...(extra?.httpStatus !== undefined ? { httpStatus: extra.httpStatus } : {}),
  };
}
