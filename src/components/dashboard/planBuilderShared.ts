import type { BodyArea, PatientExercise } from '../../types';
import { bodyAreaLabels } from '../../types';

/** Fields therapists may patch on a plan row (dose, copy, catalog autofill). */
export type PlanExerciseFieldUpdates = Partial<
  Pick<
    PatientExercise,
    | 'patientReps'
    | 'patientSets'
    | 'patientWeightKg'
    | 'holdSeconds'
    | 'isOptional'
    | 'customInstructions'
    | 'instructions'
    | 'videoUrl'
    | 'name'
    | 'muscleGroup'
    | 'muscleGroups'
    | 'targetArea'
    | 'targetAreas'
    | 'sets'
    | 'reps'
    | 'type'
    | 'difficulty'
    | 'xpReward'
  >
>;

export const MUSCLE_GROUPS_FILTER = ['הכל', 'גב תחתון', 'ליבה', 'ברך', 'ירך', 'כתף', 'קרסול'];
export const MUSCLE_GROUPS_SELECT = [
  'גב תחתון',
  'ליבה',
  'גב עליון',
  'ברך',
  'ירך',
  'כתף',
  'קרסול',
  'צוואר',
  'פרק יד',
  'מרפק',
  'כללי',
];

export const ALL_BODY_AREAS = Object.entries(bodyAreaLabels) as [BodyArea, string][];

export const difficultyLabel = ['', 'קל מאוד', 'קל', 'בינוני', 'קשה', 'קשה מאוד'];
export const difficultyColor = ['', '#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444'];
export const typeLabel: Record<string, string> = {
  clinical: 'קליני',
  standard: 'סטנדרטי',
  custom: 'מותאם',
};
export const typeBg: Record<string, string> = {
  clinical: '#e0f2fe',
  standard: '#f3e8ff',
  custom: '#fff7ed',
};
export const typeText: Record<string, string> = {
  clinical: '#0369a1',
  standard: '#6b21a8',
  custom: '#c2410c',
};

export const CUSTOM_NOTE_MAX_LEN = 500;
export const INSTRUCTIONS_MAX_LEN = 400;
export const TEXTAREA_MIN_PX = 72;
