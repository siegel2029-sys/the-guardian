import {
  Brain,
  Loader2,
  ListChecks,
  Check,
  ClipboardList,
  Route,
  Activity,
} from 'lucide-react';
import type { Patient } from '../../../types';
import { useTherapistPatientSmartClinical } from '../../../hooks/useTherapistPatientSmartClinical';
import { bodyAreaLabels } from '../../../types';
import { approvableRowKey } from '../../../ai/clinicalInsightsNarrative';

type Props = { patient: Patient | null | undefined };

export default function TherapistAiInsightsPanel({ patient }: Props) {
  const {
    aggregated = null,
    progressInsight = null,
    narrative = null,
    narrativeSource = null,
    geminiLoading = false,
    geminiError = null,
    visibleApprovableRows = [],
    isLoading = false,
    approveApprovableRow,
    planModificationFeedback,
  } = useTherapistPatientSmartClinical(patient);

  const adherencePct =
    aggregated?.adherencePercent ??
    (aggregated?.compliance?.rate != null
      ? Math.round(aggregated.compliance.rate * 100)
      : null);

  const streakStart = aggregated?.activeStreak.activeStreakStart;
  const streakDays = aggregated?.activeStreak.activeStreakDayCount ?? 0;
  const gapDays = aggregated?.activeStreak.lastGapDays;
  const hasRecentGap = aggregated?.hasRecentGap ?? false;
  const countableDays = aggregated?.adherenceCountableDays ?? 0;

  const hasMetrics = progressInsight != null;
  const hasNarrative = narrative != null;
  const hasContent = hasMetrics || hasNarrative;
  const showEmptyState = !isLoading && !geminiLoading && !hasContent;

  const streakSubtitle =
    streakStart && streakDays > 0
      ? gapDays != null
        ? `מסלול פעיל מ-${streakStart} · לאחר הפסקה ${gapDays} ימים`
        : `מסלול פעיל · ${streakDays} ימים`
      : 'מעקב קליני · המלצות מערכת';

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
            {streakSubtitle}
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
        {planModificationFeedback && (
          <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
            {planModificationFeedback}
          </p>
        )}

        {hasMetrics && progressInsight && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard label="מגמת מערכת" value={progressInsight.titleHe ?? '—'} />
            <MetricCard
              label="כאב מוקד"
              value={
                progressInsight.currentPain != null
                  ? `${progressInsight.currentPain}/10`
                  : progressInsight.avgPain7d != null
                    ? `${progressInsight.avgPain7d.toFixed(1)} ממוצע`
                    : '—'
              }
              sub={patient?.primaryBodyArea ? bodyAreaLabels[patient.primaryBodyArea] : undefined}
            />
            <MetricCard
              label="מסלול פעיל"
              value={streakDays > 0 ? `${streakDays} ימים` : '—'}
              sub={streakStart ? `מ-${streakStart}` : undefined}
            />
          </div>
        )}

        {geminiError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            ניתוח Gemini לא זמין — מוצג סיכום מקומי. ({geminiError})
          </p>
        )}

        <section>
          <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            סטטוס עמידה
          </h4>
          <div className="rounded-xl border border-teal-100 bg-white/90 px-4 py-3">
            <p className="text-2xl font-black text-teal-800">
              {adherencePct != null ? `${adherencePct}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {countableDays > 0
                ? `${aggregated?.adherenceCompletedSum ?? 0}/${aggregated?.adherencePlannedSum ?? 0} תרגילים · ${countableDays} ימים נספרים (מסלול פעיל)`
                : 'אין נתוני עמידה במסלול הפעיל'}
              {hasRecentGap && gapDays != null && (
                <span className="block mt-0.5 text-amber-700">
                  חזרה לתרגול לאחר הפסקה של {gapDays} ימים
                </span>
              )}
            </p>
          </div>
        </section>

        {hasNarrative && narrative && (
          <>
            <section>
              <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2">
                סיכום קליני
              </h4>
              <div className="space-y-2 text-sm text-slate-800">
                <p className="leading-snug bg-white/80 rounded-xl border border-slate-100 px-3 py-2">
                  {narrative.summary.consistency}
                </p>
                <p className="leading-snug bg-white/80 rounded-xl border border-slate-100 px-3 py-2">
                  {narrative.summary.painLoad}
                </p>
              </div>
            </section>

            {narrative.actionItems.length > 0 && (
              <section>
                <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
                  פעולות נדרשות
                </h4>
                <BulletList items={narrative.actionItems} />
              </section>
            )}

            <section>
              <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5" aria-hidden="true" />
                שינויים בתכנית
              </h4>
              {visibleApprovableRows.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {visibleApprovableRows.map((row) => (
                    <ModificationRow
                      key={approvableRowKey(row)}
                      label={row.item.label}
                      onApprove={() => approveApprovableRow(row)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">אין שינויים בתכנית</p>
              )}
            </section>

            <section>
              <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                פרוגנוזה
              </h4>
              <p className="text-sm text-slate-800 leading-snug bg-violet-50/40 rounded-xl border border-violet-100/60 px-3 py-2">
                {narrative.prognosis}
              </p>
            </section>
          </>
        )}

        {showEmptyState && (
          <p className="text-sm text-slate-500 text-center py-4">
            אין תובנות קליניות זמינות כרגע.
          </p>
        )}

        {isLoading && (
          <p className="text-sm text-slate-400 text-center py-4">טוען נתוני מעקב…</p>
        )}
      </div>
    </div>
  );
}

function ModificationRow({
  label,
  onApprove,
}: {
  label: string;
  onApprove: () => void;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-violet-100 bg-white px-3 py-2.5">
      <span className="flex-1 min-w-0 text-sm font-bold text-slate-800">{label}</span>
      <button
        type="button"
        onClick={onApprove}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
        aria-label={`אישור: ${label}`}
      >
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        אישור
      </button>
    </article>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="text-sm text-slate-800 flex gap-2 bg-teal-50/60 rounded-xl px-3 py-2 border border-teal-100/60"
        >
          <span className="text-teal-600 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
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
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
