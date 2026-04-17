import {
  Wand2, ThumbsUp, ThumbsDown, TrendingUp, TrendingDown, Sparkles, UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { AiSuggestion } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';

const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  increase_reps: { label: 'הגברת חזרות', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  increase_sets: { label: 'הגברת סטים', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  reduce_reps: { label: 'הפחתת חזרות', icon: TrendingDown, color: '#b45309', bg: '#fef3c7' },
  add_exercise: { label: 'הוספת תרגיל', icon: Sparkles, color: '#7c3aed', bg: '#ede9fe' },
};

function fieldLabel(field: AiSuggestion['field']): string {
  if (field === 'reps') return 'חזרות';
  if (field === 'sets') return 'סטים';
  return 'משקל (ק״ג)';
}

function ApprovalCard({
  suggestion,
  patientName,
  onApprove,
  onDecline,
}: {
  suggestion: AiSuggestion;
  patientName: string;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const tc = typeConfig[suggestion.type] ?? typeConfig.increase_reps;
  const Icon = tc.icon;
  const fromGuardian = suggestion.source === 'guardian_patient';

  return (
    <div
      className="rounded-2xl border p-4 bg-white"
      style={{ borderColor: '#5eead4', boxShadow: '0 4px 20px -8px rgba(13, 148, 136, 0.35)' }}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: tc.bg }}
        >
          <Icon className="w-5 h-5" style={{ color: tc.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{patientName}</span>
            {fromGuardian && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: '#e0e7ff', color: '#4338ca' }}
              >
                מ-Guardian
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: tc.bg, color: tc.color }}
            >
              {tc.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">{suggestion.exerciseName}</p>
          <div className="flex items-center gap-2 mt-1 text-sm">
            <span className="font-mono text-slate-400 line-through">{suggestion.currentValue}</span>
            <span className="text-slate-400">→</span>
            <span className="font-black" style={{ color: tc.color }}>
              {suggestion.suggestedValue}
            </span>
            <span className="text-xs text-slate-500">{fieldLabel(suggestion.field)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed rounded-xl px-3 py-2"
            style={{ background: '#f0fdfa', border: '1px solid #ccfbf1' }}>
            <span className="font-semibold text-teal-800">הערה: </span>
            {suggestion.reason}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
        >
          <ThumbsUp className="w-4 h-4" />
          אשר ועדכן תוכנית
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border"
          style={{ borderColor: '#fca5a5', color: '#ef4444', background: '#fff5f5' }}
        >
          <ThumbsDown className="w-4 h-4" />
          דחה
        </button>
      </div>
    </div>
  );
}

export default function PendingApprovalsPanel() {
  const {
    selectedPatient,
    patients,
    aiSuggestions,
    therapistApproveAiSuggestion,
    therapistDeclineAiSuggestion,
  } = usePatient();

  if (!selectedPatient) return null;

  const awaiting = aiSuggestions.filter(
    (s) => s.patientId === selectedPatient.id && s.status === 'awaiting_therapist'
  );

  if (awaiting.length === 0) return null;

  const nameById = Object.fromEntries(patients.map((p) => [p.id, getPatientDisplayName(p)]));

  return (
    <div
      className="rounded-2xl border mb-5 overflow-hidden"
      style={{
        borderColor: '#2dd4bf',
        background: 'linear-gradient(135deg, #ecfdf5, #f0fdfa)',
      }}
      dir="rtl"
    >
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: '#99f6e4' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)' }}
        >
          <UserCheck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-teal-950">אישורים ממתינים</h3>
          <p className="text-xs text-teal-800/90">
            המטופל אישר בקשה — השינוי ייושם בתוכנית רק אחרי לחיצתך על «אשר ועדכן תוכנית»
          </p>
        </div>
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
          style={{ background: '#0d9488' }}
        >
          {awaiting.length}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {awaiting.map((s) => (
          <ApprovalCard
            key={s.id}
            suggestion={s}
            patientName={nameById[s.patientId] ?? s.patientId}
            onApprove={() => therapistApproveAiSuggestion(s.id)}
            onDecline={() => therapistDeclineAiSuggestion(s.id)}
          />
        ))}
      </div>
      <div
        className="px-5 py-2 border-t text-[11px] text-teal-800/80 flex items-center gap-1.5"
        style={{ borderColor: '#99f6e4' }}
      >
        <Wand2 className="w-3.5 h-3.5 shrink-0" />
        חזרות, סטים ומשקל מתעדכנים רק לאחר אישור מטפל
      </div>
    </div>
  );
}
