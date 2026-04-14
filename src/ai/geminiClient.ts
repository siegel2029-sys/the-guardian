/**
 * Gemini access via Supabase Edge Function `gemini-proxy` (server holds GEMINI_API_KEY).
 */

import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
export const GEMINI_API_VERSION = 'v1beta' as const;
const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

const DEFAULT_429_WAIT_MS = 8_000;
const MAX_429_WAIT_MS = 25_000;
const MAX_NON_OK_RETRIES = 4;
const SERVER_ERROR_BACKOFF_MS = [800, 2500, 6000] as const;

export class GeminiRateLimitedError extends Error {
  readonly code = 'GEMINI_RATE_LIMIT' as const;
  constructor(message = 'Gemini API rate limited (429)') {
    super(message);
    this.name = 'GeminiRateLimitedError';
  }
}

/** True when the browser client can call `gemini-proxy` (Supabase URL + anon key). */
export function isGeminiAiAvailable(): boolean {
  return Boolean(supabase);
}

/**
 * Legacy helper: callers treat non-empty as “AI configured”.
 * There is no browser API key; configuration is Supabase + deployed `gemini-proxy` + `GEMINI_API_KEY` secret.
 */
export function getGeminiApiKey(): string {
  return isGeminiAiAvailable() ? 'proxy' : '';
}

export function getGeminiModelId(): string {
  return GEMINI_MODEL_DEFAULT;
}

export function getGeminiGenerateContentUrlForLogging(): string {
  const modelId = getGeminiModelId();
  const path = `${GEMINI_API_VERSION}/models/${modelId}:generateContent`;
  return `${GEMINI_API_HOST}/${path}?via=gemini-proxy`;
}

function clampMs(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function invokeHttpStatus(error: unknown): Promise<number | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response && typeof ctx.status === 'number') {
    return ctx.status;
  }
  return null;
}

function isLikelyRateLimit(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b429\b/.test(msg) || /rate limit/i.test(msg);
}

type ProxySuccess = { text: string; model?: string };

async function invokeGeminiProxy(
  generation: GeminiGenerationBody,
  patientInitials?: string
): Promise<ProxySuccess> {
  if (!supabase) {
    throw new Error(
      'Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). AI uses Edge Function gemini-proxy.'
    );
  }

  const { data, error } = await supabase.functions.invoke<ProxySuccess | { error?: string }>(
    'gemini-proxy',
    { body: { generation, patientInitials } }
  );

  if (error) {
    const status = await invokeHttpStatus(error);
    if (status === 429 || isLikelyRateLimit(error)) {
      throw new GeminiRateLimitedError(
        'מכסת הבקשות ל-Gemini מלאה (429). המתינו דקות ספורות או בדקו מכסה ב-Google AI Studio.'
      );
    }
    throw new Error(error.message || 'gemini-proxy invoke failed');
  }

  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }

  if (!data || typeof (data as ProxySuccess).text !== 'string') {
    throw new Error('Invalid response from gemini-proxy');
  }

  return data as ProxySuccess;
}

export type GeminiGenerationBody = {
  contents: Array<{ role?: string; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: Record<string, unknown>;
};

export type GeminiRequestOptions = {
  logPrefix: string;
  logDetail?: Record<string, unknown>;
  /** Passed to the proxy for de-identification (Latin "First Last" → this label). */
  patientInitials?: string;
};

/**
 * generateContent דרך Edge Function `gemini-proxy`.
 */
export async function geminiGenerateFromBody(
  body: GeminiGenerationBody,
  options: GeminiRequestOptions
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; deploy gemini-proxy and GEMINI_API_KEY secret.'
    );
  }

  const modelId = getGeminiModelId();
  const urlForLog = getGeminiGenerateContentUrlForLogging();
  const { logPrefix, logDetail, patientInitials } = options;

  let lastError: Error | null = null;
  let count429 = 0;

  for (let attempt = 0; attempt < MAX_NON_OK_RETRIES; attempt++) {
    try {
      if (attempt === 0) {
        console.info(`[${logPrefix}] gemini-proxy`, {
          modelId,
          requestUrlKeyRedacted: urlForLog,
          ...logDetail,
        });
      }

      const { text } = await invokeGeminiProxy(body, patientInitials);
      return text;
    } catch (err) {
      if (err instanceof GeminiRateLimitedError) {
        count429++;
        console.warn(`[${logPrefix}] 429`, { modelId, count429 });
        if (count429 >= 2) {
          throw err;
        }
        await sleep(clampMs(DEFAULT_429_WAIT_MS, 3_000, MAX_429_WAIT_MS));
        continue;
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      const retriable =
        lastError.message.includes('502') ||
        lastError.message.includes('503') ||
        lastError.message.includes('504') ||
        /fetch/i.test(lastError.message);

      if (retriable && attempt < MAX_NON_OK_RETRIES - 1) {
        const delay =
          SERVER_ERROR_BACKOFF_MS[Math.min(attempt, SERVER_ERROR_BACKOFF_MS.length - 1)] ?? 2000;
        console.warn(`[${logPrefix}] retry`, { message: lastError.message });
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  console.error(`[${logPrefix}] failed`, { lastMessage: lastError?.message, model: modelId });
  throw lastError ?? new Error('Gemini request failed');
}

export type GeminiTextParams = {
  systemInstruction?: string;
  userText: string;
  temperature?: number;
  responseMimeType?: string | null;
  logPrefix: string;
  logDetail?: Record<string, unknown>;
  patientInitials?: string;
};

export async function geminiGenerateText(params: GeminiTextParams): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature ?? 0.4,
  };
  if (params.responseMimeType) {
    generationConfig.responseMimeType = params.responseMimeType;
  }

  const body: GeminiGenerationBody = {
    contents: [{ parts: [{ text: params.userText }] }],
    generationConfig,
  };
  if (params.systemInstruction?.trim()) {
    body.systemInstruction = { parts: [{ text: params.systemInstruction.trim() }] };
  }

  return geminiGenerateFromBody(body, {
    logPrefix: params.logPrefix,
    logDetail: params.logDetail,
    patientInitials: params.patientInitials,
  });
}

export type GeminiChatTurn = { role: 'user' | 'assistant'; text: string };

export type GeminiChatParams = {
  systemInstruction: string;
  history: GeminiChatTurn[];
  userMessage: string;
  temperature?: number;
  logPrefix: string;
  logDetail?: Record<string, unknown>;
  patientInitials?: string;
};

/** תור שיחה — role assistant ממופה ל-model ב-API. */
export async function geminiGenerateChat(params: GeminiChatParams): Promise<string> {
  const contents: GeminiGenerationBody['contents'] = [];

  for (const turn of params.history) {
    const role = turn.role === 'user' ? 'user' : 'model';
    contents.push({ role, parts: [{ text: turn.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: params.userMessage }] });

  const body: GeminiGenerationBody = {
    contents,
    systemInstruction: { parts: [{ text: params.systemInstruction.trim() }] },
    generationConfig: { temperature: params.temperature ?? 0.65 },
  };

  return geminiGenerateFromBody(body, {
    logPrefix: params.logPrefix,
    logDetail: params.logDetail,
    patientInitials: params.patientInitials,
  });
}
