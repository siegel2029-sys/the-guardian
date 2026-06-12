import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronUp, Target } from 'lucide-react';
import type {
  ProtocolTrackingState,
  TreatmentProtocolWeek,
} from '../../../types';
import {
  normalizeProtocolWeeksForDisplay,
  resolveProtocolTrackingState,
} from '../../../utils/protocolTrackingState';
import {
  protocolWeekCoversCurrentWeek,
  resolveDefaultExpandedProtocolWeek,
} from '../../../utils/clinicalProtocolWeek';

export type TreatmentProtocolPrognosisCardProps = {
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  prognosisHypothesis?: string;
  protocolTrackingState?: ProtocolTrackingState;
  currentProtocolWeek?: number | null;
  readOnly?: boolean;
  onTrackingChange?: (next: ProtocolTrackingState) => void;
  className?: string;
  /** Show active-week badge on the highlighted protocol week */
  showYouAreHereBadge?: boolean;
  /** Badge text on the active week header (therapist vs patient copy) */
  activeWeekBadgeLabel?: string;
};

export default function TreatmentProtocolPrognosisCard({
  treatmentProtocol,
  prognosisHypothesis,
  protocolTrackingState = [],
  currentProtocolWeek = null,
  readOnly = false,
  onTrackingChange,
  className = '',
  showYouAreHereBadge = false,
  activeWeekBadgeLabel = 'המטופל כאן',
}: TreatmentProtocolPrognosisCardProps) {
  const protocolWeeks = useMemo(
    () => normalizeProtocolWeeksForDisplay(treatmentProtocol),
    [treatmentProtocol]
  );

  const trackingState = useMemo(
    () => resolveProtocolTrackingState(treatmentProtocol, protocolTrackingState),
    [treatmentProtocol, protocolTrackingState]
  );

  const defaultExpandedWeek = useMemo(
    () => resolveDefaultExpandedProtocolWeek(protocolWeeks, currentProtocolWeek),
    [protocolWeeks, currentProtocolWeek]
  );

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    if (defaultExpandedWeek == null) return new Set();
    return new Set([defaultExpandedWeek]);
  });

  useEffect(() => {
    if (defaultExpandedWeek == null) {
      setExpandedWeeks(new Set());
      return;
    }
    setExpandedWeeks(new Set([defaultExpandedWeek]));
  }, [defaultExpandedWeek]);

  const prognosis = prognosisHypothesis?.trim() ?? '';
  const hasProtocol = protocolWeeks.length > 0;
  const hasContent = Boolean(prognosis) || hasProtocol;

  const toggleWeek = useCallback((weekNumber: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekNumber)) next.delete(weekNumber);
      else next.add(weekNumber);
      return next;
    });
  }, []);

  const toggleMilestone = useCallback(
    (weekIdx: number, milestoneIdx: number) => {
      if (readOnly || !onTrackingChange) return;
      const week = trackingState[weekIdx];
      if (!week) return;
      const next = trackingState.map((w, wi) => {
        if (wi !== weekIdx) return w;
        return {
          ...w,
          milestones: w.milestones.map((m, mi) => {
            if (mi !== milestoneIdx) return m;
            const completed = !m.completed;
            return {
              ...m,
              completed,
              ...(completed ? { completedAt: new Date().toISOString() } : { completedAt: undefined }),
            };
          }),
        };
      });
      onTrackingChange(next);
    },
    [readOnly, onTrackingChange, trackingState]
  );

  const completedCount = trackingState.reduce(
    (sum, w) => sum + w.milestones.filter((m) => m.completed).length,
    0
  );
  const totalCount = trackingState.reduce((sum, w) => sum + w.milestones.length, 0);

  if (!hasContent) {
    return (
      <section
        dir="rtl"
        className={`rounded-xl border border-dashed border-slate-200 bg-slate-50/50 overflow-hidden ${className}`}
        aria-label="פרוטוקול טיפול ומעקב פרוגנוזה"
      >
        <header className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
            <h3 className="text-sm font-bold text-slate-900">פרוטוקול טיפול ומעקב פרוגנוזה</h3>
          </div>
        </header>
        <p className="p-5 text-sm text-slate-500">
          טרם נוצר פרוטוקול או תחזית — הריצו ניתוח AI או השלימו אינטייק.
        </p>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label="פרוטוקול טיפול ומעקב פרוגנוזה"
    >
      <header className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-l from-teal-50/80 to-slate-50/70">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
            <h3 className="text-sm font-bold text-slate-900">פרוטוקול טיפול ומעקב פרוגנוזה</h3>
          </div>
          {hasProtocol && totalCount > 0 && (
            <span className="text-xs font-semibold text-teal-800 tabular-nums">
              {completedCount}/{totalCount} הושלמו
            </span>
          )}
        </div>
      </header>

      <div className="p-5 space-y-5">
        {hasProtocol && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-4 h-4 text-slate-600 shrink-0" aria-hidden />
              <p className="text-xs font-bold text-slate-700">
                מעקב שבועי ({protocolWeeks.length} שבועות)
              </p>
            </div>

            <div className="space-y-2" role="region" aria-label="שבועות פרוטוקול">
              {protocolWeeks.map((week, weekIdx) => {
                const trackingWeek = trackingState[weekIdx];
                const expanded = expandedWeeks.has(week.weekNumber);
                const isCurrentWeek = protocolWeekCoversCurrentWeek(week, currentProtocolWeek);
                const weekHeaderId = `protocol-week-${week.weekNumber}-${weekIdx}`;
                const weekCompleted = trackingWeek?.milestones.filter((m) => m.completed).length ?? 0;
                const weekTotal = week.milestones.length;

                return (
                  <div
                    key={`week-${week.weekNumber}-${weekIdx}`}
                    className={`rounded-lg border overflow-hidden transition-colors ${
                      isCurrentWeek
                        ? 'bg-yellow-100 border-yellow-500 border-2 shadow-sm'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      id={weekHeaderId}
                      onClick={() => toggleWeek(week.weekNumber)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-start transition-colors ${
                        isCurrentWeek
                          ? 'bg-yellow-100 hover:bg-yellow-50/90'
                          : 'bg-slate-50/80 hover:bg-slate-100/80'
                      }`}
                      aria-expanded={expanded}
                      aria-controls={`${weekHeaderId}-panel`}
                    >
                      <span className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {week.title || `שבוע ${week.weekNumber}`}
                          </span>
                          {isCurrentWeek && currentProtocolWeek != null && (
                            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 border border-yellow-400">
                              {showYouAreHereBadge ? 'אתה כאן' : activeWeekBadgeLabel}
                            </span>
                          )}
                        </span>
                        {weekTotal > 0 && (
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
                            {weekCompleted}/{weekTotal} משימות
                          </span>
                        )}
                      </span>
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
                      )}
                    </button>

                    {expanded && (
                      <div
                        id={`${weekHeaderId}-panel`}
                        role="region"
                        aria-labelledby={weekHeaderId}
                        className={`border-t ${
                          isCurrentWeek ? 'border-yellow-300 bg-yellow-50/40' : 'border-slate-100 bg-white'
                        }`}
                      >
                        {week.milestones.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-slate-500">אין משימות לשבוע זה.</p>
                        ) : (
                          <ul className="divide-y divide-slate-100" role="list">
                            {week.milestones.map((label, milestoneIdx) => {
                              const milestone = trackingWeek?.milestones[milestoneIdx];
                              const inputId = milestone?.id ?? `w${week.weekNumber}-m${milestoneIdx}`;
                              const checked = milestone?.completed ?? false;
                              const canToggle = !readOnly && Boolean(onTrackingChange);

                              return (
                                <li key={inputId} className="px-3 py-2.5">
                                  <label
                                    htmlFor={inputId}
                                    className={`flex items-start gap-2.5 ${
                                      canToggle ? 'cursor-pointer' : 'cursor-default'
                                    }`}
                                  >
                                    <input
                                      id={inputId}
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!canToggle}
                                      onChange={() => toggleMilestone(weekIdx, milestoneIdx)}
                                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500 shrink-0 disabled:opacity-60"
                                    />
                                    <span
                                      className={`text-sm leading-snug transition-colors ${
                                        checked
                                          ? 'text-slate-500 line-through decoration-slate-400'
                                          : 'text-slate-800'
                                      }`}
                                    >
                                      {label}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {prognosis && (
          <blockquote className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-1.5">
              תחזית פרוגנוזה — יעד סופי
            </p>
            <p className="text-sm leading-relaxed text-slate-800 font-medium">{prognosis}</p>
          </blockquote>
        )}
      </div>
    </section>
  );
}
