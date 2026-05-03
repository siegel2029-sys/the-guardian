/**
 * Clinical alert email — priority: VITE_CLINICAL_ALERT_EMAIL env var.
 * Falls back to empty string when not configured (caller must guard against sending to empty).
 */
export function getTherapistAlertEmail(_therapistId: string): string {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLINICAL_ALERT_EMAIL
      ? String(import.meta.env.VITE_CLINICAL_ALERT_EMAIL).trim()
      : '';
  return env.includes('@') ? env : '';
}

export function openClinicalMailto(to: string, subject: string, body: string): void {
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  window.open(`mailto:${to}?subject=${s}&body=${b}`, '_blank', 'noopener,noreferrer');
}
