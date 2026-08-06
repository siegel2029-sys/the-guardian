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
   * Same value as Edge `REGISTER_THERAPIST_SECRET` — UX gate + sent on register-therapist.
   * Never a substitute for the server-side secret check.
   */
  readonly VITE_THERAPIST_REGISTER_SECRET?: string;
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
  /**
   * מפתח VAPID ציבורי ל-Web Push (כמו מ־`npx web-push generate-vapid-keys`).
   * חייב להיות זוגי עם `WEB_PUSH_VAPID_*` ב-Supabase Edge Functions.
   */
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  /** Alias לתאימות לאחור אם ב-Vercel הוגדר השם הקצר בלבד. עדיף `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /**
   * קישור תשלום Paybox לתוכנית הגנרית במשפך ההצטרפות (/join).
   * למשל: https://payboxapp.page.link/XXXX — ללא קישור, מוצגת הודעת "ניצור קשר" במקום כפתור.
   */
  readonly VITE_PAYBOX_PAYMENT_URL?: string;
  /**
   * קישור תיאום/תשלום לבדיקת Zoom במסלול הליווי האישי במשפך ההצטרפות (/join).
   * למשל: https://calendly.com/XXXX — ללא קישור, מוצגת הודעת "ניצור קשר" במקום כפתור.
   */
  readonly VITE_ZOOM_BOOKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
