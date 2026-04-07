import {
  Wand2, ThumbsUp, ThumbsDown, CheckCircle2, XCircle, TrendingUp, TrendingDown, Sparkles, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { AiSuggestion } from '../../types';

// ── Suggestion type display config ───────────────────────────────
const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  increase_reps:  { label: 'הגברת חזרות',  icon: TrendingUp,   color: '#059669', bg: '#d1fae5' },
  increase_sets:  { label: 'הגברת סטים',   icon: TrendingUp,   color: '#059669', bg: '#d1fae5' },
  reduce_reps:    { label: 'הפחתת חזרות',  icon: TrendingDown, color: '#b45309', bg: '#fef3c7' },
  add_exercise:   { label: 'הוספת תרגיל',  icon: Sparkles,     color: '#7c3aed', bg: '#ede9fe' },
};

const statusConfig = {
  pending: { label: 'ממתין', icon: Clock, color: '#0d9488', bg: '#ccfbf1' },
  approved: { label: 'אושר', icon: CheckCircle2, color: '#059669', bg: '#d1fae5' },
  declined: { label: 'נדחה', icon: XCircle, color: '#ef4444', bg: '#fee2e2' },
};

// ── Single suggestion card ────────────────────────────────────────
function SuggestionCard({
  suggestion,
  onApprove,
  onDecline,
}: {
  suggestion: AiSuggestion;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const tc = typeConfig[suggestion.type] ?? typeConfig.increase_reps;
  const Icon = tc.icon;
  const isPending = suggestion.status === 'pending';
  const sc = statusConfig[suggestion.status];
  const StatusIcon = sc.icon;

  return (
    <div
      className="rounded-2xl border p-4 transition-all"
      style={{
        borderColor: isPending ? '#99f6e4' : sc.color + '44',
        background: isPending ? 'white' : sc.bg,
        opacity: isPending ? 1 : 0.72,
      }}
      dir="rtl"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Type badge */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: tc.bg }}>
          <Icon className="w-5 h-5" style={{ color: tc.color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Exercise name + type chip */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{suggestion.exerciseName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: tc.bg, color: tc.color }}>
              {tc.label}
            </span>
            {!isPending && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                style={{ background: sc.bg, color: sc.color }}>
                <StatusIcon className="w-3 h-3" />
                {sc.label}
              </span>
            )}
          </div>

          {/* Value change */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-mono text-slate-500 line-through">{suggestion.currentValue}</span>
            <span className="text-slate-400 text-xs">→</span>
            <span className="text-base font-black" style={{ color: tc.color }}>
              {suggestion.suggestedValue}
            </span>
            <span className="text-xs text-slate-400">
              {suggestion.field === 'reps' ? 'חזרות' : 'סטים'}
            </span>
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="mt-3 px-3 py-2 rounded-xl text-xs text-slate-600 leading-relaxed"
        style={{ background: '#f8fffe', border: '1px solid #e0f2f1' }}>
        <span className="font-semibold text-teal-700">סיבה: </span>{suggestion.reason}
      </div>

      {/* Action buttons (only when pending) */}
      {isPending && (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            <ThumbsUp className="w-4 h-4" />
            אשר שינוי
          </button>
          <button
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-red-50"
            style={{ borderColor: '#fca5a5', color: '#ef4444', background: '#fff5f5' }}
          >
            <ThumbsDown className="w-4 h-4" />
            דחה
          </button>
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────
export default function AiSuggestionsPanel() {
  const { selectedPatient, aiSuggestions, approveAiSuggestion, declineAiSuggestion } = usePatient();

  if (!selectedPatient) return null;

  const patientSuggestions = aiSuggestions.filter(
    (s) => s.patientId === selectedPatient.id
  );

  if (patientSuggestions.length === 0) return null;

  const pendingCount = patientSuggestions.filter((s) => s.status === 'pending').length;

  return (
    <div
      className="rounded-2xl border mb-5"
      style={{ borderColor: '#99f6e4', background: 'linear-gradient(135deg, #f0fffe, #f8fffe)' }}
      dir="rtl"
    >
      {/* Panel header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: '#c7f0eb' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}>
          <Wand2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-800">הצעות AI לשינוי תוכנית</h3>
          <p className="text-xs text-slate-500">מבוסס על ניתוח היסטוריית כאב ותגובת המטופל</p>
        </div>
        {pendingCount > 0 && (
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: '#0d9488' }}>
            {pendingCount}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="p-4 space-y-3">
        {patientSuggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onApprove={() => approveAiSuggestion(s.id)}
            onDecline={() => declineAiSuggestion(s.id)}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="px-5 py-2.5 border-t text-[11px] text-slate-400 flex items-center gap-1.5"
        style={{ borderColor: '#c7f0eb' }}>
        <Wand2 className="w-3 h-3" />
        שינויים מאושרים מיושמים אוטומטית בתוכנית התרגול
      </div>
    </div>
  );
}
