import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchExercisePlanVersionsForPatient,
  fetchRecentSessionHistoryForPatient,
} from '../services/exerciseService';

/** JSON תמציתי ל־Gemini — תוכניות וסשנים מ־Supabase */
export async function buildSupabaseClinicalDatastoreJson(patientId: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    return JSON.stringify(
      { error: 'Supabase לא מוגדר — מוצגים רק נתונים מקומיים במודל.' },
      null,
      2
    );
  }
  const [planRows, sessions] = await Promise.all([
    fetchExercisePlanVersionsForPatient(supabase, patientId, 8),
    fetchRecentSessionHistoryForPatient(supabase, patientId, 14),
  ]);

  const sessionSummaries =
    sessions?.map((s) => ({
      date: s.date,
      completedExercises: s.completedIds?.length ?? 0,
      sessionXp: s.sessionXp,
    })) ?? [];

  return JSON.stringify(
    {
      exercise_plans: planRows ?? [],
      session_history_recent: sessionSummaries,
    },
    null,
    2
  );
}
