import { describe, expect, it } from 'vitest';
import { buildIntakeComparativeDiffPayload } from './intakeComparativeDiff';
import type { Patient } from '../types';

function basePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    name: 'Test Patient',
    age: 40,
    primaryBodyArea: 'knee_right',
    diagnosis: 'ACL rehab',
    status: 'active',
    therapistNotes: 'current story',
    intakeStory: 'current story',
    intakeVasScore: 3,
    clinicalIntakeProfile: {
      ranges: ['flexion 120'],
      muscle_strength: 'quads 4/5',
      special_tests: [],
      goals: ['return to sport'],
      medical_history: {
        backgroundDiseases: 'ללא',
        chronicMedications: 'ללא',
      },
    },
    analytics: {
      averageOverallPain: 3,
      painByArea: {},
      averageDifficulty: 2,
      totalSessions: 1,
      painHistory: [{ date: '2026-08-01', bodyArea: 'knee_right', painLevel: 3 }],
      sessionHistory: [
        {
          date: '2026-08-01',
          exercisesCompleted: 4,
          totalExercises: 5,
          difficultyRating: 3,
        },
      ],
    },
    ...overrides,
  } as Patient;
}

describe('buildIntakeComparativeDiffPayload', () => {
  it('emits changed fields instead of full archives', () => {
    const patient = basePatient();
    const payload = buildIntakeComparativeDiffPayload({
      patient,
      structuredBaseline: {
        caseStory: 'baseline story',
        vasScore: 6,
        clinicalIntakeProfile: {
          ranges: ['flexion 90'],
          muscle_strength: 'quads 3/5',
          special_tests: [],
          goals: ['walk'],
          medical_history: {
            backgroundDiseases: 'ללא',
            chronicMedications: 'ללא',
          },
        },
        aiInsights: {
          differentialDiagnosis: ['sprain'],
          precautionsHe: [],
          recommendedTestsHe: [],
          clinicalConclusionsHe: [],
          redFlags: [],
        },
      },
      scrub: (s) => s,
    });

    expect(payload.baseline).toBeTruthy();
    expect(payload.current).toBeTruthy();
    expect(Array.isArray(payload.changedFields)).toBe(true);
    expect((payload.changedFields as unknown[]).length).toBeGreaterThan(0);
    expect(payload).not.toHaveProperty('archive');
    expect(payload).not.toHaveProperty('structured');
  });
});
