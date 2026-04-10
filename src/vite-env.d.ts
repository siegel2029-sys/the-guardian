/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** גישה ל־API רק דרך `import.meta.env` (Vite מזריק בזמן build). */
  readonly VITE_GEMINI_API_KEY?: string;
  /** אופציונלי: מזהה מודל יחיד (ברירת מחדל gemini-2.5-flash). */
  readonly VITE_GEMINI_MODEL?: string;
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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
