/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** דוא״ל לדריסת יעד התראות קליניות (mailto). */
  readonly VITE_CLINICAL_ALERT_EMAIL?: string;
  /** @deprecated שדה ישן; התראות עוברות לדוא״ל */
  readonly VITE_REDFLAGS_WHATSAPP?: string;
  /**
   * כתובת הפרויקט ב-Supabase (חובה ל-prefix `VITE_`).
   * קובץ: `.env` בשורש הפרויקט ליד `package.json` — לא תחת `src/`.
   */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * מפתח anon ללקוח בדפדפן בלבד — לא `service_role`.
   * אותו קובץ `.env` בשורש.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * דומיין סינתטי לדוא״ל Auth של מטופלים (למשל patient.clinic.internal).
   * ברירת מחדל: patient.guardian.internal (דומיין demo; נשמר לתאימות לאחור עם מיתוג PHYSIOSHIELD).
   */
  readonly VITE_PATIENT_AUTH_EMAIL_DOMAIN?: string;
  /**
   * כש־true — התחברות דמו מקומית (localStorage) גם כש־Supabase מוגדר.
   */
  readonly VITE_USE_LEGACY_AUTH?: string;
  /** סיסמת מטפל א׳ בדמו מקומי (legacy auth בלבד). */
  readonly VITE_DEMO_THERAPIST_A_PASSWORD?: string;
  /** סיסמת מטפל ב׳ בדמו מקומי (legacy auth בלבד). */
  readonly VITE_DEMO_THERAPIST_B_PASSWORD?: string;
  /** סיסמת ברירת מחדל לחשבונות פורטל PT-… שנוצרים אוטומטית (legacy auth בלבד). */
  readonly VITE_DEMO_SEED_PATIENT_PORTAL_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
