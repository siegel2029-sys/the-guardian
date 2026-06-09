import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronUp, Target } from 'lucide-react';
import type {
  ProtocolTrackingState,
  TreatmentProtocolWeek,
} from '../../../types';
import {
  normalizeProtocolWeeksForDisplay,
  resolveProtocolTrackingState,
} from '../../../utils/protocolTrackingState';

type Props = {
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  prognosisHypothesis?: string;
  protocolTrackingState?: ProtocolTrackingState;
  readOnly?: boolean;
  onTrackingChange?: (next: ProtocolTrackingState) => void;
  className?: string;
};

export default function TreatmentProtocolPrognosisCard({
  treatmentProtocol,
  prognosisHypothesis,
  protocolTrackingState = [],
  readOnly = false,
  onTrackingChange,
  className = '',
}: Props) {
  const protocolWeeks = useMemo(
    () => normalizeProtocolWeeksForDisplay(treatmentProtocol),
    [treatmentProtocol]
  );

  const trackingState = useMemo(
    () => resolveProtocolTrackingState(treatmentProtocol, protocolTrackingState),
    [treatmentProtocol, protocolTrackingState]
  );

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (protocolWeeks.length === 0) return;
    setExpandedWeeks((prev) => {
      if (prev.size > 0) return prev;
      return new Set([protocolWeeks[0].weekNumber]);
    });
  }, [protocolWeeks]);

  const prognosis = prognosisHypothesis?.trim() ?? '';
  const hasProtocol = protocolWeeks.length > 0;
  const hasContent = Boolean(prognosis) || hasProtocol;

  if (!hasContent) {
    return (
      <section
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

  const toggleWeek = (weekNumber: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekNumber)) next.delete(weekNumber);
      else next.add(weekNumber);
      return next;
    });
  };

  const toggleMilestone = (weekIdx: number, milestoneIdx: number) => {
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
  };

  const completedCount = trackingState.reduce(
    (sum, w) => sum + w.milestones.filter((m) => m.completed).length,
    0
  );
  const totalCount = trackingState.reduce((sum, w) => sum + w.milestones.length, 0);

  return (
    <section
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
        {prognosis && (
          <blockquote className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-1.5">
              תחזית פרוגנוזה
            </p>
            <p className="text-sm leading-relaxed text-slate-800 font-medium">{prognosis}</p>
          </blockquote>
        )}

        {hasProtocol && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-4 h-4 text-slate-600 shrink-0" aria-hidden />
              <p className="text-xs font-bold text-slate-700">
                מעקב שבועי ({protocolWeeks.length} שבועות)
              </p>
            </div>

            {typeof treatmentProtocol === 'string' && protocolWeeks.length === 1 ? (
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed rounded-lg bg-slate-50 p-3 border border-slate-100">
                {treatmentProtocol.trim()}
              </pre>
            ) : (
              protocolWeeks.map((week, weekIdx) => {
                const trackingWeek = trackingState[weekIdx];
                const expanded = expandedWeeks.has(week.weekNumber);
                const weekHeaderId = `protocol-week-${week.weekNumber}`;
                return (
                  <div
                    key={`week-${week.weekNumber}-${weekIdx}`}
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      id={weekHeaderId}
                      onClick={() => toggleWeek(week.weekNumber)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 text-start transition-colors"
                      aria-expanded={expanded}
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        {week.title || `שבוע ${week.weekNumber}`}
                      </span>
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
                      )}
                    </button>
                    {expanded && (
                      <ul
                        className="divide-y divide-slate-100"
                        role="list"
                        aria-labelledby={weekHeaderId}
                      >
                        {week.milestones.map((label, milestoneIdx) => {
                          const milestone = trackingWeek?.milestones[milestoneIdx];
                          const inputId = milestone?.id ?? `w${week.weekNumber}-m${milestoneIdx}`;
                          const checked = milestone?.completed ?? false;
                          return (
                            <li key={inputId} className="px-3 py-2">
                              <label
                                htmlFor={inputId}
                                className={`flex items-start gap-2.5 cursor-pointer ${
                                  readOnly ? 'cursor-default opacity-90' : ''
                                }`}
                              >
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  checked={checked}
                                  disabled={readOnly}
                                  onChange={() => toggleMilestone(weekIdx, milestoneIdx)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500 shrink-0"
                                />
                                <span
                                  className={`text-sm leading-snug ${
                                    checked ? 'text-slate-500 line-through' : 'text-slate-800'
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
                );
              })
            )}
          </div>
        )}
      </div>
    </section>
  );
}
