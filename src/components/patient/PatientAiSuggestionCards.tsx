import { ThumbsUp, ThumbsDown, TrendingUp, TrendingDown, Sparkles, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AiSuggestion } from '../../types';

const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  increase_reps: { label: 'הגברת חזרות', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  increase_sets: { label: 'הגברת סטים', icon: TrendingUp, color: '#059669', bg: '#d1fae5' },
  reduce_reps: { label: 'הפחתת חזרות', icon: TrendingDown, color: '#b45309', bg: '#fef3c7' },
  add_exercise: { label: 'הוספת תרגיל', icon: Sparkles, color: '#7c3aed', bg: '#ede9fe' },
};

interface PatientAiSuggestionCardsProps {
  suggestions: AiSuggestion[];
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}

export default function PatientAiSuggestionCards({
  suggestions,
  onApprove,
  onDecline,
}: PatientAiSuggestionCardsProps) {
  const pending = suggestions.filter((s) => s.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <section className="mb-5 rounded-2xl border overflow-hidden" style={{ borderColor: '#99f6e4' }}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: '#c7f0eb', background: 'linear-gradient(135deg, #f0fffe, #f8fffe)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
        >
          <Wand2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">הצעת AI לתוכנית</h2>
          <p className="text-[11px] text-slate-500">אישור מעדכן את התרגיל בתוכנית שלך</p>
        </div>
      </div>
      <div className="p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.85)' }}>
        {pending.map((s) => {
          const tc = typeConfig[s.type] ?? typeConfig.increase_reps;
          const Icon = tc.icon;
          return (
            <div
              key={s.id}
              className="rounded-2xl border p-3"
              style={{ borderColor: '#99f6e4', background: 'white' }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: tc.bg }}
                >
                  <Icon className="w-4 h-4" style={{ color: tc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800">{s.exerciseName}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: tc.bg, color: tc.color }}
                    >
                      {tc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-sm">
                    <span className="font-mono text-slate-400 line-through">{s.currentValue}</span>
                    <span className="text-slate-400 text-xs">→</span>
                    <span className="font-black" style={{ color: tc.color }}>
                      {s.suggestedValue}
                    </span>
                    <span className="text-xs text-slate-500">
                      {s.field === 'reps' ? 'חזרות' : 'סטים'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                    <span className="font-semibold text-teal-700">למה: </span>
                    {s.reason}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => onApprove(s.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  אשר עדכון
                </button>
                <button
                  type="button"
                  onClick={() => onDecline(s.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold border"
                  style={{ borderColor: '#fca5a5', color: '#ef4444', background: '#fff5f5' }}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  דחה
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
