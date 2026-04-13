import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import { mockTherapist, mockTherapistB } from '../data/mockData';
import type { Therapist } from '../types';

const THERAPISTS_BY_ID: Record<string, Therapist> = {
  [mockTherapist.id]: mockTherapist,
  [mockTherapistB.id]: mockTherapistB,
};

export type SupabasePushResult = { ok: true } | { ok: false; message: string };

/**
 * Pushes core clinical entities to Supabase (upsert).
 * Mirrors {@link PersistedPatientStateV1} slices: patients, exercise plans, daily sessions,
 * plus therapist {@link profiles} rows derived from patient.therapistId.
 *
 * Reads remain localStorage-first in the app; this is the first step toward full sync.
 */
export async function pushPersistedStateToSupabase(
  client: SupabaseClient,
  state: PersistedPatientStateV1
): Promise<SupabasePushResult> {
  try {
    const therapistIds = new Set<string>();
    for (const p of state.patients) {
      therapistIds.add(p.therapistId);
    }

    const now = new Date().toISOString();

    const profileRows = [...therapistIds].map((id) => {
      const t = THERAPISTS_BY_ID[id] ?? {
        id,
        name: 'מטפל',
        email: '',
        title: '',
        avatarInitials: '—',
        clinicName: '',
      };
      return {
        id,
        email: t.email,
        name: t.name,
        title: t.title,
        avatar_initials: t.avatarInitials,
        clinic_name: t.clinicName,
        updated_at: now,
      };
    });

    if (profileRows.length > 0) {
      const { error } = await client.from('profiles').upsert(profileRows, { onConflict: 'id' });
      if (error) return { ok: false, message: `profiles: ${error.message}` };
    }

    const patientRows = state.patients.map((p) => ({
      id: p.id,
      therapist_id: p.therapistId,
      payload: p,
      updated_at: now,
    }));

    if (patientRows.length > 0) {
      const { error } = await client.from('patients').upsert(patientRows, { onConflict: 'id' });
      if (error) return { ok: false, message: `patients: ${error.message}` };
    }

    const planRows = state.exercisePlans.map((plan) => ({
      patient_id: plan.patientId,
      exercises: plan.exercises,
      updated_at: now,
    }));

    if (planRows.length > 0) {
      const { error } = await client.from('exercise_plans').upsert(planRows, {
        onConflict: 'patient_id',
      });
      if (error) return { ok: false, message: `exercise_plans: ${error.message}` };
    }

    const sessionRows = state.dailySessions.map((s) => ({
      patient_id: s.patientId,
      session_date: s.date,
      payload: s,
      updated_at: now,
    }));

    if (sessionRows.length > 0) {
      const { error } = await client.from('session_history').upsert(sessionRows, {
        onConflict: 'patient_id,session_date',
      });
      if (error) return { ok: false, message: `session_history: ${error.message}` };
    }

    const knowledgeItems = state.knowledgeFacts ?? [];
    /**
     * טבלה: public.app_knowledge_base (מיגרציות supabase/migrations/*app_knowledge*.sql).
     * Upsert v2 (@supabase/supabase-js): onConflict = עמודות ייחודיות (כאן PK id) — מחרוזת מופרדת בפסיקים ל־composite.
     * 404 / PGRST205 = הטבלה לא קיימת בפרויקט — הריצו `supabase db push` או החילו את ה־SQL ב־Dashboard → SQL Editor.
     */
    const { error: kbError } = await client.from('app_knowledge_base').upsert(
      {
        id: 'global',
        items: knowledgeItems,
        deleted_seed_ids: [],
        updated_at: now,
      },
      { onConflict: 'id' }
    );
    if (kbError) {
      const code = 'code' in kbError ? String((kbError as { code?: string }).code) : '';
      const isMissingTable =
        code === 'PGRST205' ||
        /404|not find the table|schema cache/i.test(kbError.message ?? '');
      const hint = isMissingTable
        ? ' — יש להחיל מיגרציות (app_knowledge_base + deleted_seed_ids) על פרויקט Supabase המקושר.'
        : '';
      return { ok: false, message: `app_knowledge_base: ${kbError.message}${hint}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
