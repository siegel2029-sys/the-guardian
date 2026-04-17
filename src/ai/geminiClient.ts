/**
 * Gemini access via Supabase Edge Function `gemini-proxy` (server holds GEMINI_API_KEY).
 */

import { type AuthError, type Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';

/** Hebrew user-facing text + optional Supabase/proxy technical detail (for support / logs). */
function hebrewAuthMessageWithTechnical(base: string, authError: AuthError | null | undefined): string {
  const t = authError?.message?.trim();
  return t ? `${base} פרט טכני: ${t}` : base;
}

/** Thrown when gemini-proxy rejects the request (e.g. 401) — does not sign the user out of the app. */
export class GeminiSessionInvalidError extends Error {
  readonly code = 'GEMINI_SESSION_INVALID' as const;
  constructor(message = 'שגיאת אימות ל־gemini-proxy. נסו שוב.') {
    super(message);
    this.name = 'GeminiSessionInvalidError';
  }
}

/** Refresh JWT if it expires within this window (seconds). */
const TOKEN_REFRESH_BUFFER_SEC = 90;

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

function getGeminiProxyInvokeUrl(): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/gemini-proxy`;
}

/** Decode JWT payload (no verify) — used for role/exp checks only. */
function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = base64 + (pad ? '='.repeat(4 - pad) : '');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jwtExpMs(token: string): number | null {
  const exp = jwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/**
 * True when the SDK would use the anon key as Bearer (no user session).
 * That passes some gateways but gemini-proxy's getUser() returns 401.
 */
function isAnonBearerToken(accessToken: string): boolean {
  if (!accessToken) return true;
  if (accessToken === supabaseAnonKey) return true;
  return jwtPayload(accessToken)?.role === 'anon';
}

function logProxyHttpFailure(
  invokeUrl: string,
  status: number,
  statusText: string,
  bodyText: string,
  parsed: unknown
): void {
  console.error('[gemini-proxy] Edge Function returned non-2xx', {
    invokeUrl,
    status,
    statusText,
    bodyText: bodyText.slice(0, 4000),
    bodyJson: parsed,
  });
}

function formatProxyFailureMessage(
  statusText: string,
  bodyText: string,
  parsed: unknown
): string {
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const p = parsed as { error?: unknown; message?: unknown; detail?: unknown };
    if (typeof p.error === 'string' && p.error.trim()) {
      const extra =
        typeof p.detail === 'string' && p.detail.trim()
          ? ` (${p.detail.slice(0, 300)})`
          : '';
      return `${p.error}${extra}`;
    }
    if (typeof p.message === 'string' && p.message.trim()) {
      return p.message;
    }
  }
  const snippet = bodyText.trim().slice(0, 500);
  return snippet || statusText || 'Unknown error';
}

function isLikelyRateLimit(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b429\b/.test(msg) || /rate limit/i.test(msg);
}

type ProxySuccess = { text: string; model?: string };

function shouldRefreshAccessToken(session: Session): boolean {
  if (typeof session.expires_at !== 'number' || !Number.isFinite(session.expires_at)) {
    return true;
  }
  const expiresAtMs = session.expires_at * 1000;
  return expiresAtMs - Date.now() < TOKEN_REFRESH_BUFFER_SEC * 1000;
}

/**
 * Loads session from storage and refreshes the JWT when close to expiry so Edge Functions
 * receive a valid Bearer token.
 */
async function ensureSessionWithFreshToken(): Promise<Session> {
  if (!supabase) {
    throw new Error(
      'Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). AI uses Edge Function gemini-proxy.'
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn('[gemini-proxy] getUser error', userError);
  }

  if (!user) {
    const invokeUrl = getGeminiProxyInvokeUrl();
    console.error(
      '[gemini-proxy] No Supabase user — cannot call Edge Function (Authorization required)',
      { invokeUrl }
    );
    throw new Error(
      hebrewAuthMessageWithTechnical(
        'נדרשת התחברות תקפה ל-Supabase ל-Gemini (נדרש JWT ל־gemini-proxy). התחברו מחדש ונסו שוב.',
        userError
      )
    );
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.warn('[gemini-proxy] getSession error', sessionError);
  }

  if (!session?.access_token) {
    const invokeUrl = getGeminiProxyInvokeUrl();
    console.error(
      '[gemini-proxy] No Supabase session — cannot call Edge Function (Authorization required)',
      { invokeUrl }
    );
    throw new Error(
      hebrewAuthMessageWithTechnical(
        'אין סשן התחברות תקף ל-Supabase ל-Gemini (נדרש JWT ל־gemini-proxy). התחברו מחדש ונסו שוב.',
        sessionError
      )
    );
  }

  if (isAnonBearerToken(session.access_token)) {
    throw new Error(
      'נדרשת התחברות משתמש (מטפל/מטופל) ל-Gemini. ה-anon key אינו מספיק — התחברו דרך מסך ההתחברות.'
    );
  }

  const jwtExp = jwtExpMs(session.access_token);
  const jwtExpiredOrSoon =
    jwtExp != null && jwtExp - Date.now() < TOKEN_REFRESH_BUFFER_SEC * 1000;

  if (!shouldRefreshAccessToken(session) && !jwtExpiredOrSoon) {
    return session;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn('[gemini-proxy] refreshSession failed, using existing session', refreshError);
    return session;
  }
  if (refreshed.session?.access_token) {
    if (isAnonBearerToken(refreshed.session.access_token)) {
      throw new Error(
        'נדרשת התחברות משתמש (מטפל/מטופל) ל-Gemini. ה-anon key אינו מספיק — התחברו דרך מסך ההתחברות.'
      );
    }
    return refreshed.session;
  }
  return session;
}

async function invokeGeminiProxy(
  generation: GeminiGenerationBody,
  patientInitials?: string
): Promise<ProxySuccess> {
  if (!supabase) {
    throw new Error(
      'Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). AI uses Edge Function gemini-proxy.'
    );
  }

  const invokeUrl = getGeminiProxyInvokeUrl();

  const session = await ensureSessionWithFreshToken();
  let accessToken = session.access_token;

  const postProxy = async (token: string): Promise<Response> => {
    try {
      return await fetch(invokeUrl, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ generation, patientInitials }),
      });
    } catch (e) {
      console.error('[gemini-proxy] fetch failed', { invokeUrl, e });
      throw new Error(e instanceof Error ? e.message : 'Network error calling gemini-proxy');
    }
  };

  let res = await postProxy(accessToken);

  if (res.status === 401) {
    const { data: ref, error: refErr } = await supabase.auth.refreshSession();
    if (refErr) {
      console.warn('[gemini-proxy] refresh after 401 failed', refErr);
    }
    if (ref?.session?.access_token && !isAnonBearerToken(ref.session.access_token)) {
      accessToken = ref.session.access_token;
      res = await postProxy(accessToken);
    }
  }

  const bodyText = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    logProxyHttpFailure(invokeUrl, res.status, res.statusText, bodyText, parsed);

    if (res.status === 401) {
      const technical = formatProxyFailureMessage(res.statusText, bodyText, parsed);
      throw new GeminiSessionInvalidError(
        technical
          ? `שגיאת אימות ל־gemini-proxy (401). נסו שוב. פרט טכני: ${technical}`
          : 'שגיאת אימות ל־gemini-proxy (401). נסו שוב.'
      );
    }

    if (res.status === 429 || isLikelyRateLimit(new Error(bodyText))) {
      throw new GeminiRateLimitedError(
        'מכסת הבקשות ל-Gemini מלאה (429). המתינו דקות ספורות או בדקו מכסה ב-Google AI Studio.'
      );
    }

    const detail = formatProxyFailureMessage(res.statusText, bodyText, parsed);
    throw new Error(`gemini-proxy failed (${res.status}): ${detail}`);
  }

  const data = parsed as ProxySuccess | { error?: string } | null;
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
