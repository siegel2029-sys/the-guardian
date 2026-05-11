import type { PatientExerciseFinishReport } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { persistPatientFinishReportToCloud } from '../services/exerciseService';

/**
 * מדביר דיווח סיום תרגיל ל־`session_history` (שילוב ב־payload של אותו יום קליני).
 * נכשל בשקט אם Supabase לא מוגדר — במצב דמו מקומי בלבד.
 */
export async function sendDataToTherapist(report: PatientExerciseFinishReport): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const res = await persistPatientFinishReportToCloud(supabase, report);
  if (!res.ok) {
    console.warn('[sendDataToTherapist] session_history', res.message);
  }
}
