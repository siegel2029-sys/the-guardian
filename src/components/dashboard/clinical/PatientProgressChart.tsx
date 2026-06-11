import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { Patient } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { addClinicalDays } from '../../../utils/clinicalCalendar';
import {
  PROGRESS_CHART_WINDOW_DAYS,
  buildActiveAreaProgressSeries,
  buildProgressChartDisplaySeries,
  formatProgressWindowRangeHe,
} from '../../../utils/patientProgressChartData';

type Props = {
  patient: Patient;
};

const LEGEND_ITEMS = [
  { label: 'כאב (VAS)', color: '#dc2626', dashed: false },
  { label: 'מאמץ (0–10)', color: '#2563eb', dashed: false },
  { label: 'מגמת התקדמות', color: '#0f172a', dashed: true },
] as const;

function ChartLegend() {
  return (
    <div
      className="flex flex-row flex-wrap items-center justify-center gap-4 pt-5"
      dir="rtl"
      role="list"
      aria-label="מקרא גרף"
    >
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600" role="listitem">
          <span
            className="inline-block w-5 h-0.5 shrink-0"
            style={{
              backgroundColor: item.dashed ? 'transparent' : item.color,
              borderTop: item.dashed ? `2px dashed ${item.color}` : undefined,
            }}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PatientProgressChart({ patient }: Props) {
  const { getPatientExerciseFinishReports, clinicalToday } = usePatient();
  const finishReports = getPatientExerciseFinishReports(patient.id);

  const fullSeries = useMemo(
    () => buildActiveAreaProgressSeries(patient, finishReports),
    [patient, finishReports]
  );

  const [windowEnd, setWindowEnd] = useState(clinicalToday);

  useEffect(() => {
    setWindowEnd(clinicalToday);
  }, [patient.id, clinicalToday]);

  const canGoNext = windowEnd < clinicalToday;

  const displaySeries = useMemo(
    () => buildProgressChartDisplaySeries(fullSeries, windowEnd, PROGRESS_CHART_WINDOW_DAYS),
    [fullSeries, windowEnd]
  );

  const hasSignal = displaySeries.some(
    (row) => row.pain != null || row.effort != null
  );

  const rangeLabel = formatProgressWindowRangeHe(windowEnd, PROGRESS_CHART_WINDOW_DAYS);

  const goToPreviousWindow = () => {
    setWindowEnd((prev) => addClinicalDays(prev, -PROGRESS_CHART_WINDOW_DAYS));
  };

  const goToNextWindow = () => {
    setWindowEnd((prev) => {
      const next = addClinicalDays(prev, PROGRESS_CHART_WINDOW_DAYS);
      return next > clinicalToday ? clinicalToday : next;
    });
  };

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
      aria-label="מעקב התקדמות"
      dir="rtl"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-black text-slate-900 shrink-0">מעקב התקדמות</h3>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={goToPreviousWindow}
            aria-label="חודש קודם"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="text-xs font-semibold text-slate-600 tabular-nums min-w-[10rem] text-center">
            {rangeLabel}
          </span>

          <button
            type="button"
            onClick={goToNextWindow}
            disabled={!canGoNext}
            aria-label="חודש הבא"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          {windowEnd !== clinicalToday && (
            <button
              type="button"
              onClick={() => setWindowEnd(clinicalToday)}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2 ms-1"
            >
              חזרה להיום
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {!hasSignal ? (
          <p className="text-sm text-slate-500 text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/80">
            אין דיווחי תרגול באזור הפעיל בטווח התאריכים שנבחר
          </p>
        ) : (
          <>
            <div className="w-full min-w-[280px]" dir="ltr">
              <ResponsiveContainer width="100%" height={300} minWidth={280} minHeight={240}>
                <LineChart
                  data={displaySeries}
                  margin={{ top: 8, right: 12, left: 0, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    label={{
                      value: 'דירוג 0–10',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#475569',
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                  <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="pain"
                    name="כאב (VAS)"
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#dc2626' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="effort"
                    name="מאמץ (0–10)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#2563eb' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="מגמת התקדמות"
                    stroke="#0f172a"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend />
          </>
        )}
      </div>
    </section>
  );
}
