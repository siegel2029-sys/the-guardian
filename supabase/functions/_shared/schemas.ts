/**
 * Shared Zod schemas + PHI-safe body parsing for Edge Functions.
 * Never echo Zod issue paths/messages to clients — they can contain submitted string values.
 */
import { z } from "npm:zod@3.25.76";

/** True UUID (Auth user ids, subscription row ids, etc.). */
export const UuidSchema = z.string().uuid();

/**
 * Clinic patient primary key is `TEXT` (e.g. `patient-<base36>-…`), not UUID.
 * Keep length-bounded; do not use UuidSchema for patient ids.
 */
export const PatientIdSchema = z.string().trim().min(1).max(128);

export type ParseBodyOk<T> = { ok: true; data: T };
export type ParseBodyFail = {
  ok: false;
  status: 400;
  /** Generic machine code only — never include Zod details or raw body. */
  error: "invalid_json" | "invalid_payload";
};

/** Validate an already-parsed JSON value. Does not leak Zod issues. */
export function parseBody<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): ParseBodyOk<T> | ParseBodyFail {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid_payload" };
  }
  return { ok: true, data: parsed.data };
}

/** JSON.parse + schema. On JSON syntax failure returns invalid_json (no body echo). */
export function parseJsonText<T>(
  schema: z.ZodType<T>,
  rawText: string,
): ParseBodyOk<T> | ParseBodyFail {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  return parseBody(schema, raw);
}

// ── gemini-proxy ─────────────────────────────────────────────────────────────

const MAX_GEMINI_CONTENTS = 40;
const MAX_GEMINI_PARTS = 16;
const MAX_GEMINI_PART_TEXT = 24_000;
const MAX_PATIENT_INITIALS = 16;
const MAX_NAME_TOKENS = 32;
const MAX_NAME_TOKEN_LEN = 64;

const GenPartSchema = z
  .object({
    text: z.string().max(MAX_GEMINI_PART_TEXT),
  })
  .strict();

const GenContentSchema = z
  .object({
    role: z.enum(["user", "model"]).optional(),
    parts: z.array(GenPartSchema).min(1).max(MAX_GEMINI_PARTS),
  })
  .strict();

const SystemInstructionSchema = z
  .object({
    parts: z.array(GenPartSchema).min(1).max(MAX_GEMINI_PARTS),
  })
  .strict();

/** Whitelist common Gemini generationConfig keys; reject nested objects / arrays. */
const GenerationConfigSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().max(8192).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().positive().max(128).optional(),
    responseMimeType: z.string().max(64).optional(),
    stopSequences: z.array(z.string().max(64)).max(8).optional(),
  })
  .strict();

export const GeminiProxyBodySchema = z
  .object({
    generation: z
      .object({
        contents: z.array(GenContentSchema).min(1).max(MAX_GEMINI_CONTENTS),
        systemInstruction: SystemInstructionSchema.optional(),
        generationConfig: GenerationConfigSchema,
      })
      .strict(),
    patientInitials: z.string().trim().max(MAX_PATIENT_INITIALS).optional(),
    nameTokens: z
      .array(z.string().max(MAX_NAME_TOKEN_LEN))
      .max(MAX_NAME_TOKENS)
      .optional(),
  })
  .strict();

export type GeminiProxyBody = z.infer<typeof GeminiProxyBodySchema>;

// ── send-therapist-chat-push ─────────────────────────────────────────────────

export const TherapistChatPushBodySchema = z
  .object({
    patientId: PatientIdSchema,
    intent: z.enum(["chat", "push_sync"]).optional(),
  })
  .strict();

export type TherapistChatPushBody = z.infer<typeof TherapistChatPushBodySchema>;

// ── notify-new-message ───────────────────────────────────────────────────────

const ChatMessageRecordSchema = z
  .object({
    id: z.string().max(128).optional(),
    patient_id: PatientIdSchema.optional(),
    therapist_id: z.string().trim().min(1).max(128).optional(),
    recipient_id: z.string().trim().min(1).max(128).optional(),
    recipientId: z.string().trim().min(1).max(128).optional(),
    patientId: PatientIdSchema.optional(),
    to_patient_id: PatientIdSchema.optional(),
    therapistId: z.string().trim().min(1).max(128).optional(),
    to_therapist_id: z.string().trim().min(1).max(128).optional(),
    from_patient: z.union([z.boolean(), z.string(), z.number()]).optional(),
    ai_clinical_alert: z.union([z.boolean(), z.string(), z.number()]).optional(),
  })
  .passthrough();

const NotifyTestSchema = z
  .object({
    type: z.literal("test-notification"),
  })
  .strict();

const NotifyWebhookSchema = z
  .object({
    type: z.string().max(64).optional(),
    table: z.string().max(64).optional(),
    schema: z.string().max(64).optional(),
    record: ChatMessageRecordSchema.optional(),
    new: ChatMessageRecordSchema.optional(),
    payload: ChatMessageRecordSchema.optional(),
    old_record: z.unknown().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.table != null && val.table !== "chat_messages") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unexpected_table",
      });
    }
    if (!val.record && !val.new && !val.payload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "missing_record",
      });
    }
  });

export const NotifyNewMessageBodySchema = z.union([
  NotifyTestSchema,
  NotifyWebhookSchema,
]);

export type NotifyNewMessageBody = z.infer<typeof NotifyNewMessageBodySchema>;

// ── reminder-cron ────────────────────────────────────────────────────────────

export const ReminderCronBodySchema = z
  .object({
    test_now: z.boolean().optional(),
    patient_id: PatientIdSchema.optional(),
    test_patient_id: PatientIdSchema.optional(),
    verbose_reminders: z.boolean().optional(),
  })
  .strict();

export type ReminderCronBody = z.infer<typeof ReminderCronBodySchema>;
