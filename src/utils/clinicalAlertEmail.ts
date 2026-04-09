import { mockTherapist, mockTherapistB } from '../data/mockData';

/**
 * דוא״ל להתראות קליניות (דגל אדום, שרשרת, וכו׳) — ללא חשיפת מספר טלפון.
 * עדיפות: VITE_CLINICAL_ALERT_EMAIL; אחרת דוא״ל המטפל מהדמו לפי therapistId.
 */
export function getTherapistAlertEmail(therapistId: string): string {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLINICAL_ALERT_EMAIL
      ? String(import.meta.env.VITE_CLINICAL_ALERT_EMAIL).trim()
      : '';
  if (env.includes('@')) return env;
  if (therapistId === mockTherapistB.id) return mockTherapistB.email;
  return mockTherapist.email;
}

export function openClinicalMailto(to: string, subject: string, body: string): void {
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  window.open(`mailto:${to}?subject=${s}&body=${b}`, '_blank', 'noopener,noreferrer');
}
