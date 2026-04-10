/** שכבת גישה משותפת ל-Gemini Generative Language API (מפתח מ־VITE_GEMINI_API_KEY). */

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

export function getGeminiApiKey(): string {
  const k = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? '';
  if (!k || k === 'YOUR_KEY_HERE') return '';
  return k;
}

export function getGeminiModelId(): string {
  const fromEnv = import.meta.env.VITE_GEMINI_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : GEMINI_MODEL_DEFAULT;
}

function buildGeminiGenerateContentUrl(apiKey: string): string {
  const modelId = getGeminiModelId();
  const path = `${GEMINI_API_VERSION}/models/${modelId}:generateContent`;
  return `${GEMINI_API_HOST}/${path}?key=${encodeURIComponent(apiKey)}`;
}

export function getGeminiGenerateContentUrlForLogging(): string {
  const modelId = getGeminiModelId();
  const path = `${GEMINI_API_VERSION}/models/${modelId}:generateContent`;
  return `${GEMINI_API_HOST}/${path}?key=<REDACTED>`;
}

function parseRetryAfterMs(response: Response): number | null {
  const ra = response.headers.get('Retry-After');
  if (!ra) return null;
  const sec = parseInt(ra, 10);
  if (!Number.isNaN(sec) && sec >= 0) return Math.min(sec * 1000, MAX_429_WAIT_MS);
  const until = Date.parse(ra);
  if (!Number.isNaN(until)) return Math.min(Math.max(0, until - Date.now()), MAX_429_WAIT_MS);
  return null;
}

function parseRetryDelayFromGoogleErrorBody(rawBody: string): number | null {
  const quoted = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(rawBody);
  if (quoted) {
    return Math.min(parseFloat(quoted[1]) * 1000, MAX_429_WAIT_MS);
  }
  try {
    const j = JSON.parse(rawBody) as {
      error?: { details?: Array<Record<string, unknown>> };
    };
    for (const d of j.error?.details ?? []) {
      const t = typeof d['@type'] === 'string' ? (d['@type'] as string) : '';
      if (!t.includes('RetryInfo')) continue;
      const rd = d.retryDelay;
      if (typeof rd === 'string') {
        const m = /^(\d+(?:\.\d+)?)s$/i.exec(rd.trim());
        if (m) return Math.min(parseFloat(m[1]) * 1000, MAX_429_WAIT_MS);
      }
      if (rd && typeof rd === 'object' && rd !== null && 'seconds' in rd) {
        const sec = Number((rd as { seconds?: unknown }).seconds);
        if (!Number.isNaN(sec)) return Math.min(sec * 1000, MAX_429_WAIT_MS);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function clampMs(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { code?: number; message?: string; status?: string };
};

function getResponseText(data: GenerateContentResponse): string {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text === 'string' && text.trim()) return text;
  const reason = data.candidates?.[0]?.finishReason;
  throw new Error(
    reason ? `Empty model text (finishReason: ${reason})` : 'Empty model response text'
  );
}

export type GeminiGenerationBody = {
  contents: Array<{ role?: string; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: Record<string, unknown>;
};

export type GeminiRequestOptions = {
  logPrefix: string;
  logDetail?: Record<string, unknown>;
};

/**
 * POST generateContent עם גוף מלא (תור שיחה או הודעה בודדת).
 */
export async function geminiGenerateFromBody(
  body: GeminiGenerationBody,
  options: GeminiRequestOptions
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY');
  }

  const modelId = getGeminiModelId();
  const url = buildGeminiGenerateContentUrl(apiKey);
  const urlForLog = getGeminiGenerateContentUrlForLogging();
  const { logPrefix, logDetail } = options;

  let lastError: Error | null = null;
  let count429 = 0;

  for (let attempt = 0; attempt < MAX_NON_OK_RETRIES; attempt++) {
    try {
      if (attempt === 0) {
        console.info(`[${logPrefix}] generateContent`, {
          modelId,
          requestUrlKeyRedacted: urlForLog,
          ...logDetail,
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const rawBody = await response.text();

      if (response.status === 429) {
        count429++;
        console.warn(`[${logPrefix}] 429`, { modelId, count429 });
        if (count429 >= 2) {
          throw new GeminiRateLimitedError(
            'מכסת הבקשות ל-Gemini מלאה (429). המתינו דקות ספורות או בדקו מכסה ב-Google AI Studio.'
          );
        }
        const waitMs = clampMs(
          parseRetryAfterMs(response) ??
            parseRetryDelayFromGoogleErrorBody(rawBody) ??
            DEFAULT_429_WAIT_MS,
          3_000,
          MAX_429_WAIT_MS
        );
        await sleep(waitMs);
        continue;
      }

      if (response.status === 404) {
        console.error(`[${logPrefix}] 404`, { requestUrlKeyRedacted: urlForLog, preview: rawBody.slice(0, 280) });
        throw new Error(`Gemini API HTTP 404: ${rawBody.slice(0, 200)}`);
      }

      if (response.status === 400) {
        console.error(`[${logPrefix}] 400`, { preview: rawBody.slice(0, 280) });
        throw new Error(`Gemini API HTTP 400: ${rawBody.slice(0, 200)}`);
      }

      if (!response.ok) {
        console.error(`[${logPrefix}] HTTP ${response.status}`, { preview: rawBody.slice(0, 400) });
        lastError = new Error(`Gemini API HTTP ${response.status}: ${rawBody.slice(0, 200)}`);
        if (response.status >= 500 && attempt < MAX_NON_OK_RETRIES - 1) {
          const delay =
            SERVER_ERROR_BACKOFF_MS[Math.min(attempt, SERVER_ERROR_BACKOFF_MS.length - 1)] ?? 2000;
          await sleep(delay);
          continue;
        }
        throw lastError;
      }

      let data: GenerateContentResponse;
      try {
        data = JSON.parse(rawBody) as GenerateContentResponse;
      } catch {
        lastError = new Error('Invalid JSON from Gemini API');
        if (attempt < MAX_NON_OK_RETRIES - 1) {
          const delay =
            SERVER_ERROR_BACKOFF_MS[Math.min(attempt, SERVER_ERROR_BACKOFF_MS.length - 1)] ?? 2000;
          await sleep(delay);
          continue;
        }
        throw lastError;
      }

      if (data.error?.message) {
        throw new Error(`Gemini API error: ${data.error.message}`);
      }

      return getResponseText(data);
    } catch (err) {
      if (err instanceof GeminiRateLimitedError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        lastError.message.startsWith('Gemini API HTTP') ||
        lastError.message.startsWith('Gemini API error')
      ) {
        throw lastError;
      }
      console.warn(`[${logPrefix}] fetch/parse retry`, { message: lastError.message });
      if (attempt < MAX_NON_OK_RETRIES - 1) {
        const delay =
          SERVER_ERROR_BACKOFF_MS[Math.min(attempt, SERVER_ERROR_BACKOFF_MS.length - 1)] ?? 2000;
        await sleep(delay);
      }
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
  });
}
