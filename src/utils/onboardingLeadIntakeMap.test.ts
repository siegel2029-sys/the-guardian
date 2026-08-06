import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../types';
import {
  buildProgramSeedTextFromQuestionnaire,
  mapQuestionnaireToInitialClinicalExtras,
  proposeProgramFromQuestionnaire,
} from './onboardingLeadIntakeMap';

const mockCatalog: Exercise[] = [
  {
    id: 'lib-lb-1',
    name: 'גשר',
    muscleGroup: 'גב תחתון',
    targetArea: 'back_lower',
    sets: 2,
    reps: 10,
    difficulty: 1,
    type: 'clinical',
    instructions: '',
    xpReward: 10,
    videoUrl: '',
  },
  {
    id: 'lib-lb-2',
    name: 'חתול-פרה',
    muscleGroup: 'גב תחתון',
    targetArea: 'back_lower',
    sets: 2,
    reps: 8,
    difficulty: 1,
    type: 'clinical',
    instructions: '',
    xpReward: 10,
    videoUrl: '',
  },
  {
    id: 'lib-kn-1',
    name: 'יישור ברך',
    muscleGroup: 'ברך',
    targetArea: 'knee_right',
    sets: 2,
    reps: 10,
    difficulty: 1,
    type: 'clinical',
    instructions: '',
    xpReward: 10,
    videoUrl: '',
  },
];

vi.mock('../services/exerciseCatalogService', () => ({
  getCachedActiveExercises: () => mockCatalog,
}));

describe('mapQuestionnaireToInitialClinicalExtras', () => {
  const questionnaire = {
    version: 1,
    red_flags: {
      trauma: false,
      caudaEquina: false,
      systemic: true,
      motorWeakness: false,
      nightPain: false,
    },
    clinical: {
      pain_location: 'גב תחתון',
      pain_level: 6,
      aggravating_easing: 'ישיבה מחמירה',
      duration: '1-3 חודשים',
      hardest_activities: 'לשבת',
      movement_fear: 3,
      rehab_goal: 'לחזור לרוץ',
    },
  };

  it('maps VAS, goals, red flag and intake story from questionnaire_data', () => {
    const extras = mapQuestionnaireToInitialClinicalExtras(questionnaire, 'ישראל ישראלי', {
      phone: '0501234567',
      email: 'a@b.co.il',
    });

    expect(extras.displayName).toBe('ישראל ישראלי');
    expect(extras.intakeVasScore).toBe(6);
    expect(extras.intakeRedFlag).toBe(true);
    expect(extras.clinicalDiagnosis).toContain('גב תחתון');
    expect(extras.clinicalIntakeProfile?.goals).toEqual(['לחזור לרוץ']);
    expect(extras.intakeStory).toContain('מיקום כאב: גב תחתון');
    expect(extras.intakeStory).toContain('עוצמת כאב (VAS): 6/10');
    expect(extras.intakeStory).toContain('מטרת שיקום: לחזור לרוץ');
    expect(extras.intakeStory).toContain('כן — האם אתה סובל מחום');
    expect(extras.intakeStory).toContain('אימייל ליצירת קשר: a@b.co.il');
  });

  it('handles empty questionnaire without throwing', () => {
    const extras = mapQuestionnaireToInitialClinicalExtras({}, 'מטופל');
    expect(extras.displayName).toBe('מטופל');
    expect(extras.intakeStory).toContain('אינטייק ממשפך');
    expect(extras.intakeVasScore).toBeUndefined();
    expect(extras.intakeRedFlag).toBeUndefined();
  });
});

describe('proposeProgramFromQuestionnaire', () => {
  it('builds seed text from clinical fields', () => {
    const seed = buildProgramSeedTextFromQuestionnaire({
      clinical: {
        pain_location: 'ברך ימין',
        hardest_activities: 'עלייה במדרגות',
        rehab_goal: 'חזרה להליכה',
        pain_level: 5,
      },
    });
    expect(seed).toContain('ברך ימין');
    expect(seed).toContain('עלייה במדרגות');
    expect(seed).toContain('כאב 5/10');
  });

  it('maps lower-back questionnaire to a back_lower plan with catalog exercises', () => {
    const program = proposeProgramFromQuestionnaire({
      clinical: {
        pain_location: 'גב תחתון',
        hardest_activities: 'לשבת הרבה',
        rehab_goal: 'לחזור לרוץ',
        pain_level: 4,
      },
    });
    expect(program.primaryBodyArea).toBe('back_lower');
    expect(program.libraryExerciseIds.length).toBeGreaterThan(0);
    expect(program.libraryExerciseIds.every((id) => id.startsWith('lib-lb-'))).toBe(true);
  });
});
