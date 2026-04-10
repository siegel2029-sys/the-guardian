/**
 * ספריית תרגילים למערכת — מקור: mockData (EXERCISE_LIBRARY).
 * שם הקובץ תואם לציפיית ה-prompt הקליני (exerciseBank).
 */
import { EXERCISE_LIBRARY } from './mockData';

export { EXERCISE_LIBRARY };
export const exerciseBank = EXERCISE_LIBRARY;

export function getExerciseBankIdListForPrompt(): { id: string; name: string; targetArea: string }[] {
  return EXERCISE_LIBRARY.map((e) => ({
    id: e.id,
    name: e.name,
    targetArea: e.targetArea,
  }));
}
