import { describe, expect, it } from 'vitest';
import {
  isPatientPayloadShape,
  tryParsePatientExerciseArray,
  tryParsePatientPayload,
} from './clinicalJsonbParse';

describe('clinicalJsonbParse', () => {
  it('tryParsePatientPayload accepts objects with string id', () => {
    const p = tryParsePatientPayload({ id: 'pt-1', name: 'A' });
    expect(p?.id).toBe('pt-1');
  });

  it('tryParsePatientPayload rejects missing/blank id and non-objects', () => {
    expect(tryParsePatientPayload(null)).toBeNull();
    expect(tryParsePatientPayload([])).toBeNull();
    expect(tryParsePatientPayload({ id: 1 })).toBeNull();
    expect(tryParsePatientPayload({ id: '  ' })).toBeNull();
    expect(isPatientPayloadShape({ id: 'x' })).toBe(true);
  });

  it('tryParsePatientExerciseArray filters and normalizes', () => {
    const out = tryParsePatientExerciseArray([
      { id: 'ex-1', name: 'Squat' },
      null,
      { name: 'no-id' },
      { id: 'ex-2', sets: 2, reps: 8 },
    ]);
    expect(out.map((e) => e.id)).toEqual(['ex-1', 'ex-2']);
    expect(out[0]?.patientSets).toBeGreaterThan(0);
    expect(out[1]?.patientReps).toBe(8);
  });

  it('tryParsePatientExerciseArray returns [] for non-arrays', () => {
    expect(tryParsePatientExerciseArray(undefined)).toEqual([]);
    expect(tryParsePatientExerciseArray({})).toEqual([]);
  });
});
