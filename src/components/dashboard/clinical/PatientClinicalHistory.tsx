import { useCallback, useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import {
  fetchClinicalAuditLogsForPatient,
  type ClinicalAuditLogRow,
} from '../../../services/clinicalService';
import { summarizeClinicalAuditLine } from '../../../utils/clinicalAuditSummary';

type Props = {
  patientId: string;
};

async function loadTherapistDisplayNames(
  therapistIds: string[]
): Promise<Record<string, string>> {
  if (!supabase || therapistIds.length === 0) return {};
  const unique = [...new Set(therapistIds)];
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', unique);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data as { id: string; name: string }[]) {
    out[row.id] = row.name;
  }
  return out;
}

export default function PatientClinicalHistory({ patientId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClinicalAuditLogRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('נדרש חיבור ל־Supabase כדי לטעון היסטוריה.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClinicalAuditLogsForPatient(supabase, patientId, 80);
      if (data === null) {
        setError('לא ניתן לטעון את היסטוריית השינויים.');
        setRows([]);
        return;
      }
      setRows(data);
      const nm = await loadTherapistDisplayNames(data.map((r) => r.therapist_id));
      setNames(nm);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setRows([]);
    setError(null);
  }, [patientId]);

  useEffect(() => {
    if (open && isSupabaseConfigured) void load();
  }, [open, patientId, load]);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm transition-colors"
      >
        <History className="w-4 h-4 text-slate-600" />
        היסטוריית שינויים
      </button>

      {open && (
        <div
          className="mt-3 rounded-2xl border bg-white p-4 shadow-sm"
          style={{ borderColor: '#e2e8f0' }}
        >
          {!isSupabaseConfigured && (
            <p className="text-sm text-slate-600">הגדירו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY כדי לצפות בהיסטוריה.</p>
          )}
          {isSupabaseConfigured && loading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              טוען…
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {isSupabaseConfigured && !loading && !error && rows.length === 0 && (
            <p className="text-sm text-slate-600">אין עדיין רשומות שינוי למטופל זה.</p>
          )}
          {isSupabaseConfigured && !loading && rows.length > 0 && (
            <ul className="space-y-3 text-sm text-slate-800 leading-relaxed">
              {rows.map((r) => {
                const when = new Date(r.created_at).toLocaleString('he-IL', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                });
                const therapistLabel = names[r.therapist_id]?.trim() || 'מטפל';
                const detail = summarizeClinicalAuditLine(
                  r.entity_type,
                  r.action,
                  r.old_value,
                  r.new_value
                );
                return (
                  <li key={r.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <span className="text-slate-500">{when}</span>
                    {' — '}
                    <span className="font-semibold text-slate-900">{therapistLabel}</span>
                    {': '}
                    {detail}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
