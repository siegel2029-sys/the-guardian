import { describe, expect, it } from 'vitest';
import {
  extractFirstBalancedJsonObject,
  parseModelJson,
  parseModelJsonObject,
  stripMarkdownCodeFences,
} from './parseModelJson';

describe('parseModelJson', () => {
  it('strips fenced json blocks', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(stripMarkdownCodeFences(raw)).toBe('{"a":1}');
    expect(parseModelJsonObject(raw)).toEqual({ a: 1 });
  });

  it('extracts first balanced object from prose', () => {
    const raw = 'Here you go:\n{"ok":true,"n":2}\nThanks';
    expect(extractFirstBalancedJsonObject(raw)).toBe('{"ok":true,"n":2}');
    expect(parseModelJson(raw)).toEqual({ ok: true, n: 2 });
  });

  it('returns null on invalid when throwOnError is false', () => {
    expect(parseModelJson('not json', { throwOnError: false })).toBeNull();
    expect(parseModelJsonObject('not json')).toBeNull();
  });
});
