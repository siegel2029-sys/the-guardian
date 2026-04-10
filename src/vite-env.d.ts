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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
