/**
 * Shared Gemini JSON parsing — fence strip + balanced-brace fallback.
 * Prefer this over ad-hoc JSON.parse in structured AI modules.
 */

/** Strip ``` / ```json fences (full-document or leading/trailing). */
export function stripMarkdownCodeFences(text: string): string {
  let t = text.replace(/^\uFEFF/, '').trim();
  const fenceJson = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/im.exec(t);
  if (fenceJson) {
    return fenceJson[1].trim();
  }
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

/** Extract the first balanced `{ ... }` object, respecting string escapes. */
export function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export type ParseModelJsonOptions = {
  /** When false, return null instead of throwing (default: throw). */
  throwOnError?: boolean;
  logPrefix?: string;
};

/**
 * Parse model output into a JSON value (usually an object).
 * Handles markdown fences, leading prose, and loose `{...}` fallback.
 */
export function parseModelJson(
  text: string,
  opts?: ParseModelJsonOptions
): unknown {
  const throwOnError = opts?.throwOnError !== false;
  const logPrefix = opts?.logPrefix ?? '[parseModelJson]';

  let t = stripMarkdownCodeFences(text);
  const slice = extractFirstBalancedJsonObject(t);
  if (slice) t = slice;

  try {
    return JSON.parse(t) as unknown;
  } catch (firstErr) {
    const loose = t.match(/\{[\s\S]*\}/);
    if (loose && loose[0] !== t) {
      try {
        return JSON.parse(loose[0]) as unknown;
      } catch {
        if (throwOnError) {
          console.error(`${logPrefix} fallback brace match failed`, {
            snippet: loose[0].slice(0, 200),
          });
        }
      }
    }
    if (throwOnError) {
      console.error(`${logPrefix} JSON.parse failed`, {
        preview: t.slice(0, 280),
        error: firstErr,
      });
      throw new Error('Invalid AI response: could not parse JSON');
    }
    return null;
  }
}

/** Convenience: parse and narrow to a plain object (or null). */
export function parseModelJsonObject(
  text: string,
  opts?: Omit<ParseModelJsonOptions, 'throwOnError'>
): Record<string, unknown> | null {
  const parsed = parseModelJson(text, { ...opts, throwOnError: false });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
