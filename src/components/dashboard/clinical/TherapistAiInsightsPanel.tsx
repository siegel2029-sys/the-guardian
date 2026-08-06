import type { ClinicalActionLabelDisplay } from '../../../ai/clinicalInsightsNarrative';
import { Brain, Loader2, Route, Activity, Sparkles, ClipboardList, Lightbulb } from 'lucide-react';
import type { Patient } from '../../../types';
import { useTherapistPatientSmartClinical } from '../../../hooks/useTherapistPatientSmartClinical';
import { bodyAreaLabels } from '../../../types';
import { PROTOCOL_PROGRESSION_FROZEN_BADGE_HE } from '../../../utils/clinicalProtocolWeek';

type Props = { patient: Patient | null | undefined };

export default function TherapistAiInsightsPanel({ patient }: Props) {
  const {
    aggregated = null,
    progressInsight = null,
    narrative = null,
    narrativeSource = null,
    geminiLoading = false,
    geminiError = null,
    geminiAvailable = false,
    generateGeminiInsights,
    unifiedActions = [],
    isLoading = false,
    approveUnifiedAction,
    dismissUnifiedAction,
    planModificationFeedback,
  } = useTherapistPatientSmartClinical(patient);

  const adherencePct = aggregated?.adherencePercent ?? null;

  const streakStart = aggregated?.activeStreak.activeStreakStart;
  const streakDays = aggregated?.activeStreak.activeStreakDayCount ?? 0;
  const gapDays = aggregated?.activeStreak.lastGapDays;
  const hasRecentGap = aggregated?.hasRecentGap ?? false;
  const hasCriticalGaps = aggregated?.hasCriticalGaps ?? false;
  const longestGapDays = aggregated?.longestGapDays ?? 0;
  const targetPerWeek = aggregated?.targetWorkoutsPerWeek ?? 7;
  const sessionDaysInLookback = aggregated?.sessionDaysInLookback ?? 0;
  const protocolWeek = aggregated?.currentProtocolWeek;
  const chronologicalWeek = aggregated?.chronologicalProtocolWeek;
  const protocolFrozen = aggregated?.protocolProgressionFrozen ?? false;

  const hasMetrics = progressInsight != null;
  const hasNarrative = narrative != null;
  const hasContent = hasMetrics || hasNarrative || unifiedActions.length > 0;
  const showEmptyState = !isLoading && !geminiLoading && !hasContent;

  const streakSubtitle =
    streakStart && streakDays > 0
      ? gapDays != null
        ? `מסלול פעיל מ-${streakStart} · לאחר הפסקה ${gapDays} ימים`
        : `מסלול פעיל · ${streakDays} ימים`
      : 'מעקב קליני · תובנות והמלצות';

  const actionItems = narrative?.actionItems?.filter((x) => x.trim()) ?? [];
  const recommendationActions = unifiedActions.filter((a) => a.kind === 'ai_modification');

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
            {narrativeSource === 'local' && !geminiLoading && (
              <span className="ms-1 text-slate-500">(סיכום מקומי)</span>
            )}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            המלצות תוכנית מיושמות רק אחרי «אשר המלצה».
          </p>
        </div>
        {geminiAvailable && (
          <button
            type="button"
            onClick={() => generateGeminiInsights()}
            disabled={geminiLoading || isLoading}
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50 min-h-[40px]"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            aria-label="צור תובנות Gemini"
          >
            {geminiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            )}
            {geminiLoading ? 'מייצר…' : 'צור תובנות Gemini'}
          </button>
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
              label="שבוע פרוטוקול"
              value={protocolWeek != null ? `שבוע ${protocolWeek}` : '—'}
              sub={
                protocolFrozen
                  ? PROTOCOL_PROGRESSION_FROZEN_BADGE_HE
                  : chronologicalWeek != null && chronologicalWeek !== protocolWeek
                    ? `לוח שנה: שבוע ${chronologicalWeek}`
                    : streakStart
                      ? `מסלול מ-${streakStart}`
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
              יעד {targetPerWeek} אימונים/שבוע · {sessionDaysInLookback} ימי אימון ב־28 הימים האחרונים
              {aggregated?.adherenceBeforeGapPenalty != null &&
                aggregated.adherenceBeforeGapPenalty !== adherencePct && (
                  <span className="block mt-0.5">
                    לפני קנס פער: {aggregated.adherenceBeforeGapPenalty}%
                  </span>
                )}
              {hasCriticalGaps && (
                <span className="block mt-0.5 text-amber-700 font-semibold">
                  פער קריטי · {longestGapDays} ימים ללא תרגול
                </span>
              )}
              {hasRecentGap && gapDays != null && !hasCriticalGaps && (
                <span className="block mt-0.5 text-amber-700">
                  חזרה לתרגול לאחר הפסקה של {gapDays} ימים
                </span>
              )}
              {protocolFrozen && (
                <span className="block mt-0.5 text-amber-800 font-bold">
                  {PROTOCOL_PROGRESSION_FROZEN_BADGE_HE}
                </span>
              )}
            </p>
          </div>
        </section>

        {narrative && (
          <section>
            <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5" aria-hidden="true" />
              סיכום קליני
            </h4>
            <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 space-y-2 text-sm text-slate-700">
              {narrative.summary?.consistency ? (
                <p>
                  <span className="font-bold text-slate-900">עמידה: </span>
                  {narrative.summary.consistency}
                </p>
              ) : null}
              {narrative.summary?.painLoad ? (
                <p>
                  <span className="font-bold text-slate-900">כאב/עומס: </span>
                  {narrative.summary.painLoad}
                </p>
              ) : null}
              {narrative.prognosis ? (
                <p>
                  <span className="font-bold text-slate-900">תחזית: </span>
                  {narrative.prognosis}
                </p>
              ) : null}
            </div>
          </section>
        )}

        {actionItems.length > 0 && (
          <section>
            <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
              נקודות למעקב
            </h4>
            <ul className="space-y-2 mt-1">
              {actionItems.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-sm text-slate-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
            המלצות תוכנית (Gemini)
          </h4>
          {recommendationActions.length > 0 ? (
            <div className="space-y-3 mt-2">
              {recommendationActions.map((action) => (
                <RecommendationCard
                  key={action.id}
                  sourceTag={action.sourceTag}
                  labelDisplay={action.labelDisplay}
                  label={action.label}
                  rationale={action.rationale}
                  onApprove={() => approveUnifiedAction(action)}
                  onDismiss={() => dismissUnifiedAction(action)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {geminiLoading
                ? 'מייצר המלצות…'
                : narrativeSource === 'gemini'
                  ? 'אין המלצות תוכנית כרגע — הסיכום הקליני בלבד.'
                  : 'לחצו «צור תובנות Gemini» כדי לקבל המלצות לאישור ידני.'}
            </p>
          )}
        </section>

        {showEmptyState && (
          <p className="text-sm text-slate-500 text-center py-4">
            {geminiAvailable
              ? 'אין תובנות קליניות זמינות כרגע. לחצו «צור תובנות Gemini» לניתוח.'
              : 'אין תובנות קליניות זמינות כרגע.'}
          </p>
        )}

        {isLoading && (
          <p className="text-sm text-slate-400 text-center py-4">טוען נתוני מעקב…</p>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({
  sourceTag,
  labelDisplay,
  label,
  rationale,
  onApprove,
  onDismiss,
}: {
  sourceTag: string;
  labelDisplay: ClinicalActionLabelDisplay;
  label: string;
  rationale: string;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  return (
    <article className="rounded-xl border border-violet-100 bg-white px-4 py-3 shadow-sm">
      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 mb-2">
        {sourceTag}
      </span>
      <h4 className="text-sm font-black text-slate-900">
        <ActionLabel display={labelDisplay} />
      </h4>
      {rationale.trim() ? (
        <p className="text-sm text-gray-600 italic mt-1 mb-3">{rationale.trim()}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
          aria-label={`אשר המלצה: ${label}`}
        >
          אשר המלצה
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
          aria-label={`התעלם: ${label}`}
        >
          התעלם
        </button>
      </div>
    </article>
  );
}

function ActionLabel({ display }: { display: ClinicalActionLabelDisplay }) {
  if (display.kind === 'plain') {
    return <>{display.text}</>;
  }
  return (
    <>
      {display.prefix} בתרגיל {display.exerciseName}: {display.fieldLabel}{' '}
      <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono tabular-nums">
        {display.currentValue} ➔ {display.suggestedValue}
      </span>
    </>
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
