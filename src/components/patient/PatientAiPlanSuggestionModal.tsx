import { ThumbsUp, ThumbsDown, TrendingUp, TrendingDown, Sparkles, Wand2, X, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AiSuggestion } from '../../types';

function SuggestionCardBody({
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
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: '#99f6e4', background: 'white' }}>
      <div className="flex items-start gap-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: tc.bg }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: tc.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-slate-800">{suggestion.exerciseName}</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: tc.bg, color: tc.color }}
            >
              {tc.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-sm flex-wrap">
            <span className="font-mono text-slate-400 line-through">{suggestion.currentValue}</span>
            <span className="text-slate-400 text-xs">→</span>
            <span className="font-black" style={{ color: tc.color }}>
              {suggestion.suggestedValue}
            </span>
            <span className="text-xs text-slate-500">
              {suggestion.field === 'reps' ? 'חזרות' : suggestion.field === 'sets' ? 'סטים' : 'משקל'}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
            <span className="font-semibold text-teal-700">למה: </span>
            {suggestion.reason}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white min-h-11"
          style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
        >
          <ThumbsUp className="w-3.5 h-3.5 shrink-0" />
          שלח בקשה למטפל
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border min-h-11"
          style={{ borderColor: '#fca5a5', color: '#ef4444', background: '#fff5f5' }}
        >
          <ThumbsDown className="w-3.5 h-3.5 shrink-0" />
          דחה
        </button>
      </div>
    </div>
  );
}

const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  increase_reps: { label: 'הגברת חזרות', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  increase_sets: { label: 'הגברת סטים', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  reduce_reps: { label: 'הפחתת חזרות', icon: TrendingDown, color: '#b45309', bg: '#fef3c7' },
  add_exercise: { label: 'הוספת תרגיל', icon: Sparkles, color: '#7c3aed', bg: '#ede9fe' },
};

export type PatientAiPlanSuggestionModalProps = {
  open: boolean;
  loading: boolean;
  /** כשאין הצעת שינוי (אין תרגילי שיקום וכו׳) */
  infoMessage: string | null;
  suggestion: AiSuggestion | null;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
};

/**
 * מודאל מסך מלא — הצעת AI לתוכנית (עיצוב כמו הכרטיס הקודם) לפני תחילת אימון.
 */
export default function PatientAiPlanSuggestionModal({
  open,
  loading,
  infoMessage,
  suggestion,
  onApprove,
  onDecline,
  onClose,
}: PatientAiPlanSuggestionModalProps) {
  if (!open) return null;

  const showSuggestion = !loading && suggestion != null;
  const showInfo = !loading && suggestion == null && infoMessage != null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-plan-modal-title"
      aria-busy={loading}
    >
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-hidden />

      <div
        className="relative z-[101] w-full max-w-md max-h-[min(90dvh,640px)] flex flex-col rounded-2xl border overflow-hidden shadow-[0_32px_80px_-16px_rgba(15,23,42,0.45)]"
        style={{ borderColor: '#99f6e4' }}
        dir="rtl"
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
          style={{ borderColor: '#c7f0eb', background: 'linear-gradient(135deg, #f0fffe, #f8fffe)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Wand2 className="w-[18px] h-[18px] text-white" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="ai-plan-modal-title" className="text-sm font-bold text-slate-800">
              הצעת AI לתוכנית
            </h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              {showSuggestion
                ? 'שליחת בקשה למטפל — התרגיל יתעדכן רק אחרי אישורו'
                : 'עדכון לפני שמתחילים באימון'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            aria-label="סגור"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4" style={{ background: 'rgba(255,255,255,0.92)' }}>
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-teal-900">
              <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
              <p className="text-sm font-semibold text-slate-700">טוען המלצה מותאמת…</p>
            </div>
          )}

          {showInfo && (
            <div className="rounded-2xl border p-4 text-sm text-slate-700 leading-relaxed" style={{ borderColor: '#99f6e4' }}>
              {infoMessage}
            </div>
          )}

          {showSuggestion && suggestion ? (
            <SuggestionCardBody
              suggestion={suggestion}
              onApprove={onApprove}
              onDecline={onDecline}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
