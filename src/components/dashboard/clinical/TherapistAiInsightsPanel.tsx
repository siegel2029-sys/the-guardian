import { Brain, Loader2, Sparkles, TrendingDown, TrendingUp, AlertCircle, ListChecks } from 'lucide-react';
import type { Patient } from '../../../types';
import {
  useTherapistPatientSmartClinical,
  type PendingClinicalRecommendation,
} from '../../../hooks/useTherapistPatientSmartClinical';
import { bodyAreaLabels } from '../../../types';

const typeLabel: Record<string, string> = {
  increase_reps: 'הגברת חזרות',
  increase_sets: 'הגברת סטים',
  reduce_reps: 'הפחתת עומס',
  add_exercise: 'שינוי מכני / תרגיל',
};

const fieldLabel: Record<string, string> = {
  reps: 'חזרות',
  sets: 'סטים',
  weight: 'משקל (ק״ג)',
  holdSeconds: 'זמן החזקה (שנ׳)',
};

type Props = { patient: Patient | null | undefined };

export default function TherapistAiInsightsPanel({ patient }: Props) {
  const {
    aggregated = null,
    progressInsight = null,
    narrative = null,
    narrativeSource = null,
    geminiLoading = false,
    geminiError = null,
    recommendedActions = [],
    pendingRecommendations = [],
    isLoading = false,
  } = useTherapistPatientSmartClinical(patient);

  const pending: PendingClinicalRecommendation[] = pendingRecommendations ?? [];
  const actions: string[] = recommendedActions ?? [];
  const narrativeSummary = narrative?.graphAnchoredSummary?.trim() ?? '';

  const compliancePct =
    aggregated?.compliance?.rate != null
      ? Math.round(aggregated.compliance.rate * 100)
      : null;

  const hasMetrics = progressInsight != null;
  const hasNarrative = narrativeSummary.length > 0;
  const hasActions = actions.length > 0;
  const hasPending = pending.length > 0;
  const hasContent = hasMetrics || hasNarrative || hasActions || hasPending;
  const showEmptyState = !isLoading && !geminiLoading && !hasContent;

  return (
    <div
      className="rounded-2xl border mb-5 overflow-hidden"
      style={{ borderColor: '#99f6e4', background: 'linear-gradient(135deg, #f8fffe, #ffffff)' }}
      dir="rtl"
    >
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: '#c7f0eb' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
        >
          <Brain className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-slate-900">תובנות AI קליניות</h3>
          <p className="text-xs text-slate-500">
            סיכום 7 ימים · המלצות מערכת · נימוקים למטפל
            {narrativeSource === 'gemini' && (
              <span className="ms-1 text-teal-700 font-semibold">(Gemini)</span>
            )}
          </p>
        </div>
        {geminiLoading && (
          <Loader2 className="w-5 h-5 text-teal-600 animate-spin shrink-0" aria-hidden="true" />
        )}
      </div>

      <div className="p-5 space-y-5">
        {hasMetrics && progressInsight && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              label="מגמת מערכת"
              value={progressInsight.titleHe ?? '—'}
              sub={progressInsight.basisHe?.slice(0, 120)}
            />
            <MetricCard
              label="עמידה (3 סשנים)"
              value={
                compliancePct != null
                  ? `${compliancePct}%`
                  : progressInsight.compliance3d != null
                    ? `${Math.round(progressInsight.compliance3d * 100)}%`
                    : '—'
              }
              sub={
                aggregated?.compliance
                  ? `7 ימים: ${aggregated.compliance.completedSum ?? 0}/${aggregated.compliance.plannedSum ?? 0} תרגילים`
                  : undefined
              }
            />
            <MetricCard
              label="כאב מוקד"
              value={
                progressInsight.currentPain != null
                  ? `${progressInsight.currentPain}/10`
                  : progressInsight.avgPain7d != null
                    ? `${progressInsight.avgPain7d.toFixed(1)} ממוצע`
                    : '—'
              }
              sub={
                patient?.primaryBodyArea
                  ? bodyAreaLabels[patient.primaryBodyArea]
                  : undefined
              }
            />
          </div>
        )}

        {geminiError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            ניתוח Gemini לא זמין — מוצג סיכום מקומי. ({geminiError})
          </p>
        )}

        {hasNarrative && (
          <section>
            <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              סיכום retrospective (7 ימים)
            </h4>
            <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-white/80 rounded-xl border border-teal-100/80 px-4 py-3">
              {narrativeSummary}
            </div>
          </section>
        )}

        {hasActions && (
          <section>
            <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
              פעולות מומלצות
            </h4>
            <ul className="space-y-2">
              {actions.map((action, index) => (
                <li
                  key={`${action}-${index}`}
                  className="text-sm text-slate-800 leading-relaxed flex gap-2 bg-teal-50/60 rounded-xl px-3 py-2 border border-teal-100/60"
                >
                  <span className="text-teal-600 shrink-0 mt-0.5">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasPending && (
          <section>
            <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              המלצות ממתינות — נימוק קליני
            </h4>
            <div className="space-y-3">
              {pending.map((rec) => {
                const isIncrease =
                  rec.type === 'increase_reps' || rec.type === 'increase_sets';
                const Icon = isIncrease ? TrendingUp : TrendingDown;
                return (
                  <article
                    key={rec.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isIncrease ? '#d1fae5' : '#fef3c7',
                          color: isIncrease ? '#059669' : '#b45309',
                        }}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-slate-800">
                            {rec.exerciseName ?? 'תרגיל'}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {typeLabel[rec.type] ?? rec.type ?? 'המלצה'}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {rec.status === 'awaiting_therapist'
                              ? 'ממתין לאישור מטפל'
                              : 'ממתין למטופל'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          {fieldLabel[rec.field] ?? rec.field ?? 'ערך'}:{' '}
                          <span className="line-through">{rec.currentValue ?? '—'}</span>
                          {' → '}
                          <span className="font-bold text-slate-800">{rec.suggestedValue ?? '—'}</span>
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed border-r-2 border-teal-400 pr-3">
                          {rec.reason || 'אין נימוק זמין.'}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {showEmptyState && (
          <p className="text-sm text-slate-500 text-center py-4">
            אין תובנות קליניות או המלצות זמינות עבור מטופל זה כרגע.
          </p>
        )}

        {isLoading && (
          <p className="text-sm text-slate-400 text-center py-4">טוען נתוני מעקב קליניים…</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-black text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1 leading-snug">{sub}</p>}
    </div>
  );
}
