import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { ClinicalProgressInsight, ProgressInsightCategory } from '../../../ai/clinicalCommandInsight';

const catIcon: Record<ProgressInsightCategory, typeof Sparkles> = {
  load_increase: TrendingUp,
  load_decrease: TrendingDown,
  maintain: Minus,
  escalate_care: AlertTriangle,
};

const catColor: Record<ProgressInsightCategory, string> = {
  load_increase: '#059669',
  load_decrease: '#d97706',
  maintain: '#64748b',
  escalate_care: '#dc2626',
};

export default function AiProgressInsightCard({ insight }: { insight: ClinicalProgressInsight }) {
  const Icon = catIcon[insight.category];
  const color = catColor[insight.category];

  return (
    <div
      className="rounded-xl border bg-white p-5 shadow-sm h-full flex flex-col"
      style={{ borderColor: '#bfdbfe' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            המלצת AI להתקדמות
          </h3>
          <p className="text-[11px] text-slate-500">המלצת מערכת — לבדיקה קלינית בלבד</p>
        </div>
      </div>

      <p className="text-base font-bold text-slate-900 mb-2">{insight.titleHe}</p>
      <p className="text-sm text-slate-600 leading-relaxed mb-3 flex-1">{insight.summaryHe}</p>

      <div
        className="rounded-lg px-3 py-2.5 text-sm border mb-2"
        style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}
      >
        <span className="font-semibold">צעד הבא המוצע: </span>
        {insight.nextStepHe}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{insight.basisHe}</p>
    </div>
  );
}
