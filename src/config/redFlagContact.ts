/**
 * @deprecated דגל אדום עובר לדוא״ל דרך `getTherapistAlertEmail` + `VITE_CLINICAL_ALERT_EMAIL`.
 * נשאר לתאימות אחורה בלבד.
 */
export const REDFLAG_WHATSAPP_E164: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REDFLAGS_WHATSAPP) ||
  '972501234567';
