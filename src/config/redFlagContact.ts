/**
 * יעד WhatsApp לדיווח דגל אדום קליני.
 * ניתן לדרוס עם VITE_REDFLAGS_WHATSAPP (מספר בפורמט בינלאומי ללא +).
 */
export const REDFLAG_WHATSAPP_E164: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REDFLAGS_WHATSAPP) ||
  '972501234567';
