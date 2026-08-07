import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { sanitizeDbErrorMessage } from '../lib/dbErrorSanitizer';
import { serviceFail, serviceOk, type ServiceResult } from '../lib/serviceResult';

/**
 * Self-service onboarding funnel (/join) — anonymous lead capture & triage.
 *
 * All writes go through the hardened `save_onboarding_lead` SECURITY DEFINER RPC
 * (no direct anon table access). The lead UUID returned on insert is the client's
 * capability token for follow-up status updates.
 *
 * Iron Rule 1 (PHI safety): never log names/phones/emails/free-text answers here —
 * failures surface as generic Hebrew messages only.
 */

// ---------------------------------------------------------------------------
// Red-flag screening (Section A) — hard stop domain logic
// ---------------------------------------------------------------------------

export const RED_FLAG_IDS = [
  'trauma',
  'caudaEquina',
  'systemic',
  'motorWeakness',
  'nightPain',
] as const;

export type RedFlagId = (typeof RED_FLAG_IDS)[number];

export const RED_FLAG_QUESTIONS: ReadonlyArray<{ id: RedFlagId; question: string }> = [
  {
    id: 'trauma',
    question: 'האם הכאב החל בעקבות תאונה או חבלה משמעותית שלא נבדקה על ידי רופא?',
  },
  {
    id: 'caudaEquina',
    question: 'האם חווית לאחרונה אובדן שליטה על סוגרים או הירדמות באזור המפשעה?',
  },
  {
    id: 'systemic',
    question: 'האם אתה סובל מחום בלתי מוסבר או ירידה קיצונית במשקל?',
  },
  {
    id: 'motorWeakness',
    question: 'האם אתה חווה חולשה פתאומית באחת מהגפיים (כמו כף רגל שצונחת)?',
  },
  {
    id: 'nightPain',
    question: 'האם הכאב מעיר אותך מהשינה באופן קבוע ולא משתפר בשינוי תנוחה?',
  },
];

export const RED_FLAG_HARD_STOP_MESSAGE =
  'על סמך תשובתך, המצב דורש הערכה רפואית פרונטלית לפני תחילת פעילות. אנא פנה לרופא המשפחה או אורתופד.';

export type RedFlagAnswers = Record<RedFlagId, boolean | null>;

export const EMPTY_RED_FLAG_ANSWERS: RedFlagAnswers = {
  trauma: null,
  caudaEquina: null,
  systemic: null,
  motorWeakness: null,
  nightPain: null,
};

/** Any "yes" answer triggers the mandatory clinical hard stop. */
export function hasAnyRedFlag(answers: RedFlagAnswers): boolean {
  return RED_FLAG_IDS.some((id) => answers[id] === true);
}

/** The screening step is complete only when every question has an explicit answer. */
export function allRedFlagsAnswered(answers: RedFlagAnswers): boolean {
  return RED_FLAG_IDS.every((id) => typeof answers[id] === 'boolean');
}

// ---------------------------------------------------------------------------
// Clinical & personal profile (Sections B & C)
// ---------------------------------------------------------------------------

export const DURATION_OPTIONS = [
  'פחות משבועיים',
  'עד חודש',
  '1-3 חודשים',
  'מעל 3 חודשים',
] as const;

export type DurationOption = (typeof DURATION_OPTIONS)[number];

const REQUIRED_TEXT_MESSAGE = 'שדה חובה — נא למלא לפני ההמשך';
const REQUIRED_SCALE_MESSAGE = 'נא לבחור ערך בסולם';

export const clinicalProfileSchema = z.object({
  painLocation: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(1, REQUIRED_TEXT_MESSAGE)
    .max(200, 'טקסט ארוך מדי (עד 200 תווים)'),
  painLevel: z
    .number(REQUIRED_SCALE_MESSAGE)
    .int(REQUIRED_SCALE_MESSAGE)
    .min(0, REQUIRED_SCALE_MESSAGE)
    .max(10, REQUIRED_SCALE_MESSAGE),
  aggravatingEasing: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(1, REQUIRED_TEXT_MESSAGE)
    .max(1000, 'טקסט ארוך מדי (עד 1000 תווים)'),
  duration: z.enum(DURATION_OPTIONS, 'נא לבחור משך זמן מהרשימה'),
  hardestActivities: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(1, REQUIRED_TEXT_MESSAGE)
    .max(1000, 'טקסט ארוך מדי (עד 1000 תווים)'),
  movementFear: z
    .number(REQUIRED_SCALE_MESSAGE)
    .int(REQUIRED_SCALE_MESSAGE)
    .min(1, REQUIRED_SCALE_MESSAGE)
    .max(5, REQUIRED_SCALE_MESSAGE),
  rehabGoal: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(1, REQUIRED_TEXT_MESSAGE)
    .max(1000, 'טקסט ארוך מדי (עד 1000 תווים)'),
});

export type ClinicalProfile = z.infer<typeof clinicalProfileSchema>;

// ---------------------------------------------------------------------------
// Lead contact capture (Section D)
// ---------------------------------------------------------------------------

/** Strips separators and converts a +972 / 972 prefix to the local leading 0. */
export function normalizeIsraeliPhone(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, '');
  if (stripped.startsWith('+972')) return `0${stripped.slice(4)}`;
  if (stripped.startsWith('972')) return `0${stripped.slice(3)}`;
  return stripped;
}

/** Israeli mobile (05X + 7 digits) or landline (0X + 7 digits, X in 2-4/8/9) or 07X. */
const ISRAELI_PHONE_REGEX = /^0(?:5\d{8}|7\d{8}|[23489]\d{7})$/;

export const leadContactSchema = z.object({
  fullName: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(2, 'נא להזין שם מלא')
    .max(120, 'שם ארוך מדי'),
  phone: z
    .string(REQUIRED_TEXT_MESSAGE)
    .trim()
    .min(1, REQUIRED_TEXT_MESSAGE)
    .refine((value) => ISRAELI_PHONE_REGEX.test(normalizeIsraeliPhone(value)), {
      message: 'נא להזין מספר טלפון ישראלי תקין (למשל 050-1234567)',
    }),
  email: z.email('נא להזין כתובת אימייל תקינה').max(254, 'אימייל ארוך מדי'),
});

export type LeadContact = z.infer<typeof leadContactSchema>;

// ---------------------------------------------------------------------------
// Plan routing / high-pain gating (Step 4)
// ---------------------------------------------------------------------------

export const HIGH_PAIN_THRESHOLD = 8;

export const HIGH_PAIN_BLOCK_MESSAGE =
  'עקב עוצמת הכאב הגבוהה שדיווחת עליה, לא ניתן להירשם לתוכנית הגנרית. נדרשת בדיקה אישית ומעמיקה כדי להבטיח את בטיחותך והתאמת הטיפול.';

/** pain_level >= 8 blocks the generic (Paybox) plan and forces the Zoom track. */
export function isGenericPlanBlocked(painLevel: number | null): boolean {
  return painLevel != null && painLevel >= HIGH_PAIN_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Persistence — save_onboarding_lead RPC + admin queries
// ---------------------------------------------------------------------------

export type OnboardingLeadStatus =
  | 'abandoned'
  | 'pending_paybox'
  | 'pending_zoom'
  | 'converted';

export type PendingLeadStatus = Extract<
  OnboardingLeadStatus,
  'pending_paybox' | 'pending_zoom'
>;

/** Final /join consent checkbox — Terms/Privacy/Medical + truthfulness of questionnaire answers. */
export const FINAL_LEGAL_CONSENT_TEXT =
  'אני מאשר/ת את תנאי השימוש, מדיניות הפרטיות וההצהרה הרפואית, ומצהיר/ה כי כל הפרטים והתשובות שמסרתי בשאלון זה הינם נכונים, מדויקים ומלאים.';

export type OnboardingLegalConsent = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  medicalDisclaimerAccepted: boolean;
  /** Explicit declaration that questionnaire answers are true, accurate, and complete. */
  answersTruthful: boolean;
  acceptedAt: string;
  /** Snapshot of the consent copy the user agreed to (Hebrew). */
  declarationText?: string;
};

/** questionnaire_data JSONB payload — de-identified triage answers only. */
export function buildQuestionnaireData(
  redFlags: RedFlagAnswers,
  clinical: ClinicalProfile,
  legal?: OnboardingLegalConsent | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    version: 1,
    red_flags: { ...redFlags },
    clinical: {
      pain_location: clinical.painLocation,
      pain_level: clinical.painLevel,
      aggravating_easing: clinical.aggravatingEasing,
      duration: clinical.duration,
      hardest_activities: clinical.hardestActivities,
      movement_fear: clinical.movementFear,
      rehab_goal: clinical.rehabGoal,
    },
  };
  if (legal) {
    base.legal = {
      terms_accepted: legal.termsAccepted,
      privacy_accepted: legal.privacyAccepted,
      medical_disclaimer_accepted: legal.medicalDisclaimerAccepted,
      answers_truthful: legal.answersTruthful,
      declaration_text: legal.declarationText ?? FINAL_LEGAL_CONSENT_TEXT,
      accepted_at: legal.acceptedAt,
    };
  }
  return base;
}

export type SaveOnboardingLeadInput = {
  /** null → insert new lead; UUID → update the existing lead (capability token). */
  leadId: string | null;
  contact: LeadContact;
  painLevel: number;
  questionnaire: Record<string, unknown>;
};

const GENERIC_SAVE_ERROR = 'שמירת הפרטים נכשלה. נסו שוב בעוד רגע.';
const SERVICE_UNAVAILABLE_ERROR = 'המערכת אינה זמינה כרגע. נסו שוב בעוד מספר דקות.';

/** Insert-or-update a funnel lead (status stays/starts as 'abandoned'). Returns the lead id. */
export async function saveOnboardingLead(
  input: SaveOnboardingLeadInput,
  client: SupabaseClient | null = supabase
): Promise<ServiceResult<string>> {
  if (!client) return serviceFail(SERVICE_UNAVAILABLE_ERROR);
  try {
    const { data, error } = await client.rpc('save_onboarding_lead', {
      p_lead_id: input.leadId,
      p_full_name: input.contact.fullName,
      p_phone: normalizeIsraeliPhone(input.contact.phone),
      p_email: input.contact.email,
      p_pain_level: input.painLevel,
      p_status: 'abandoned',
      p_questionnaire: input.questionnaire,
    });
    if (error) {
      return serviceFail(sanitizeDbErrorMessage(error.message, GENERIC_SAVE_ERROR));
    }
    if (typeof data !== 'string' || !data) {
      return serviceFail(GENERIC_SAVE_ERROR);
    }
    return serviceOk(data);
  } catch {
    return serviceFail(GENERIC_SAVE_ERROR);
  }
}

/** Move a captured lead into a checkout-intent status (pending_paybox / pending_zoom). */
export async function updateOnboardingLeadStatus(
  leadId: string,
  status: PendingLeadStatus,
  client: SupabaseClient | null = supabase
): Promise<ServiceResult<string>> {
  if (!client) return serviceFail(SERVICE_UNAVAILABLE_ERROR);
  try {
    const { data, error } = await client.rpc('save_onboarding_lead', {
      p_lead_id: leadId,
      p_full_name: null,
      p_phone: null,
      p_email: null,
      p_pain_level: null,
      p_status: status,
      p_questionnaire: null,
    });
    if (error) {
      return serviceFail(sanitizeDbErrorMessage(error.message, GENERIC_SAVE_ERROR));
    }
    if (typeof data !== 'string' || !data) {
      return serviceFail(GENERIC_SAVE_ERROR);
    }
    return serviceOk(data);
  } catch {
    return serviceFail(GENERIC_SAVE_ERROR);
  }
}

export type OnboardingLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  pain_level: number | null;
  status: OnboardingLeadStatus;
  questionnaire_data: Record<string, unknown>;
};

/**
 * Admin/therapist lead management: all leads that have not converted yet
 * (abandoned carts + pending payments), newest first. Requires a therapist
 * session — RLS denies everyone else.
 */
export async function fetchOpenOnboardingLeads(
  client: SupabaseClient | null = supabase
): Promise<ServiceResult<OnboardingLeadRow[]>> {
  if (!client) return serviceFail(SERVICE_UNAVAILABLE_ERROR);
  const { data, error } = await client
    .from('onboarding_leads')
    .select('id, created_at, updated_at, full_name, phone, email, pain_level, status, questionnaire_data')
    .neq('status', 'converted')
    .order('created_at', { ascending: false });

  if (error) {
    return serviceFail(sanitizeDbErrorMessage(error.message, 'שגיאה בטעינת לידים'));
  }
  return serviceOk((data ?? []) as OnboardingLeadRow[]);
}

const GENERIC_CONVERT_ERROR = 'עדכון סטטוס הליד נכשל. נסו שוב.';

/**
 * Therapist-only: permanently hard-delete a lead (privacy / email reuse).
 * SECURITY DEFINER RPC — no residual row.
 */
export async function convertOnboardingLead(
  leadId: string,
  client: SupabaseClient | null = supabase
): Promise<ServiceResult<string>> {
  if (!client) return serviceFail(SERVICE_UNAVAILABLE_ERROR);
  const id = leadId.trim();
  if (!id) return serviceFail(GENERIC_CONVERT_ERROR);

  const { data, error } = await client.rpc('hard_delete_onboarding_lead', {
    p_lead_id: id,
  });

  if (error) {
    return serviceFail(sanitizeDbErrorMessage(error.message, GENERIC_CONVERT_ERROR));
  }

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (payload?.ok === true) {
    return serviceOk(id);
  }
  if (payload?.reason === 'not_found') {
    return serviceFail('הליד לא נמצא או שכבר נמחק.');
  }
  return serviceFail(GENERIC_CONVERT_ERROR);
}

/**
 * Unified lead status writer for therapist tooling.
 * - pending_* → public RPC
 * - converted → hard_delete_onboarding_lead (wipe after patient create; no residual PHI)
 */
export async function updateLeadStatus(
  leadId: string,
  status: OnboardingLeadStatus,
  client: SupabaseClient | null = supabase
): Promise<ServiceResult<string>> {
  if (status === 'converted') {
    return convertOnboardingLead(leadId, client);
  }
  if (status === 'pending_paybox' || status === 'pending_zoom') {
    return updateOnboardingLeadStatus(leadId, status, client);
  }
  return serviceFail('לא ניתן לעדכן לסטטוס זה מכאן.');
}

/** True when the lead checkout intent is the self-guided Paybox track. */
export function leadImpliesUnassistedPlan(status: OnboardingLeadStatus): boolean {
  return status === 'pending_paybox';
}

/**
 * Chat access for a patient created from an onboarding lead:
 * - pending_paybox → locked (self-guided)
 * - pending_zoom → enabled (personal accompaniment)
 * - all other statuses → enabled by default (same as legacy patients)
 */
export function allowChatForOnboardingLeadStatus(status: OnboardingLeadStatus): boolean {
  if (status === 'pending_paybox') return false;
  if (status === 'pending_zoom') return true;
  return true;
}

/**
 * Care-mode tier for a patient created from an onboarding lead:
 * - pending_paybox → generic (AI-led, patient-accept plan changes)
 * - pending_zoom → premium (therapist-led)
 * - all other statuses → premium (legacy / default)
 */
export function subscriptionTierForOnboardingLeadStatus(
  status: OnboardingLeadStatus
): 'premium' | 'generic' {
  if (status === 'pending_paybox') return 'generic';
  return 'premium';
}

/** Portal username derived from lead id (A–Z0–9, 2–32 chars). */
export function portalUsernameFromLeadId(leadId: string): string {
  const compact = leadId.replace(/-/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = `L${compact.slice(0, 10)}`;
  return base.length >= 2 ? base.slice(0, 32) : `L${Date.now().toString(36).toUpperCase()}`;
}
