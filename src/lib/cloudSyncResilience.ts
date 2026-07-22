/**
 * Transient-error detection + bounded retry for cloud upsert / pull paths.
 * Keeps clinical sync resilient without inventing schema or logging PHI.
 */

export type CloudSyncOutcome = { ok: boolean; message?: string; httpStatus?: number };

/** Network / gateway failures that are safe to retry once. */
export function isTransientCloudSyncError(
  message: string | undefined,
  httpStatus?: number,
): boolean {
  if (httpStatus != null && [408, 425, 429, 500, 502, 503, 504].includes(httpStatus)) {
    return true;
  }
  if (!message) return false;
  const m = message.toLowerCase();
  return /network|timeout|fetch failed|econnreset|temporar|unavailable|502|503|504|429|gateway/.test(
    m,
  );
}

export type WithCloudSyncRetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number, message: string) => void;
};

/**
 * Runs an upsert/pull once; on a failed transient outcome, waits briefly and retries.
 * Permanent failures (RLS, validation, 4xx other than timeout/rate-limit) are not retried.
 */
export async function withCloudSyncRetry<T extends CloudSyncOutcome>(
  op: () => Promise<T>,
  opts?: WithCloudSyncRetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 2);
  const delayMs = Math.max(0, opts?.delayMs ?? 350);
  let last!: T;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await op();
    if (last.ok) return last;
    const msg = last.message ?? "cloud_sync_failed";
    const transient = isTransientCloudSyncError(msg, last.httpStatus);
    if (!transient || attempt >= maxAttempts) return last;
    opts?.onRetry?.(attempt, msg);
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return last;
}
