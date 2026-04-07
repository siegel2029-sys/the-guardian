import {
  Wand2, TrendingUp, TrendingDown, Sparkles, CheckCircle2, XCircle, Clock, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { AiSuggestion } from '../../types';

const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  increase_reps: { label: 'הגברת חזרות', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  increase_sets: { label: 'הגברת סטים', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  reduce_reps: { label: 'הפחתת חזרות', icon: TrendingDown, color: '#b45309', bg: '#fef3c7' },
  add_exercise: { label: 'הוספת תרגיל', icon: Sparkles, color: '#7c3aed', bg: '#ede9fe' },
};

function fieldLabel(field: AiSuggestion['field']): string {
  if (field === 'reps') return 'חזרות';
  if (field === 'sets') return 'סטים';
  return 'משקל';
}

function ReadOnlySuggestionCard({ suggestion }: { suggestion: AiSuggestion }) {
  const tc = typeConfig[suggestion.type] ?? typeConfig.increase_reps;
  const Icon = tc.icon;
  return (
    <div
      className="rounded-2xl border p-4 bg-white/90"
      style={{ borderColor: '#99f6e4' }}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: tc.bg }}>
          <Icon className="w-5 h-5" style={{ color: tc.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{suggestion.exerciseName}</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
              style={{ background: '#ccfbf1', color: '#0d9488' }}
            >
              <Clock className="w-3 h-3" />
              ממתין לתגובת המטופל
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm">
            <span className="font-mono text-slate-400 line-through">{suggestion.currentValue}</span>
            <span className="text-slate-400">→</span>
            <span className="font-black" style={{ color: tc.color }}>
              {suggestion.suggestedValue}
            </span>
            <span className="text-xs text-slate-500">{fieldLabel(suggestion.field)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">{suggestion.reason}</p>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ suggestion }: { suggestion: AiSuggestion }) {
  const tc = typeConfig[suggestion.type] ?? typeConfig.increase_reps;
  const Icon = tc.icon;
  const approved = suggestion.status === 'approved';
  const sc = approved
    ? { label: 'אושר', icon: CheckCircle2, color: '#059669', bg: '#d1fae5' }
    : { label: 'נדחה', icon: XCircle, color: '#ef4444', bg: '#fee2e2' };
  const StatusIcon = sc.icon;

  return (
    <div
      className="rounded-xl border p-3 opacity-80"
      style={{ borderColor: '#e2e8f0', background: '#fafafa' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="w-4 h-4 shrink-0" style={{ color: tc.color }} />
        <span className="text-sm font-medium text-slate-700">{suggestion.exerciseName}</span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
          style={{ background: sc.bg, color: sc.color }}
        >
          <StatusIcon className="w-3 h-3" />
          {sc.label}
        </span>
      </div>
    </div>
  );
}

export default function AiSuggestionsPanel() {
  const { selectedPatient, aiSuggestions } = usePatient();

  if (!selectedPatient) return null;

  const patientSuggestions = aiSuggestions.filter((s) => s.patientId === selectedPatient.id);
  const pendingPatient = patientSuggestions.filter((s) => s.status === 'pending');
  const history = patientSuggestions.filter((s) => s.status === 'approved' || s.status === 'declined');

  if (pendingPatient.length === 0 && history.length === 0) return null;

  return (
    <div
      className="rounded-2xl border mb-5"
      style={{ borderColor: '#99f6e4', background: 'linear-gradient(135deg, #f0fffe, #f8fffe)' }}
      dir="rtl"
    >
      <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: '#c7f0eb' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
        >
          <Wand2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-800">הצעות AI (מעקב)</h3>
          <p className="text-xs text-slate-500">המטופל מאשר בקשה מהאפליקציה; אישור סופי שלך נמצא ב«אישורים ממתינים»</p>
        </div>
      </div>

      {pendingPatient.length > 0 && (
        <div className="p-4 space-y-3 border-b" style={{ borderColor: '#c7f0eb' }}>
          <div className="flex items-start gap-2 text-xs text-teal-800 bg-teal-50 rounded-xl px-3 py-2 border border-teal-100">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>הצעות אלו מוצגות למטופל. לאחר שילחץ «שלח בקשה למטפל», יופיעו לך תחת «אישורים ממתינים».</span>
          </div>
          {pendingPatient.map((s) => (
            <ReadOnlySuggestionCard key={s.id} suggestion={s} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">היסטוריה</p>
          <div className="space-y-2">
            {history.map((s) => (
              <HistoryCard key={s.id} suggestion={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
