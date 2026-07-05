import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, X } from 'lucide-react';
import type { Patient, PatientExerciseFinishReport } from '../../types';
import { addClinicalDays } from '../../utils/clinicalCalendar';
import {
  PROGRESS_CHART_WINDOW_DAYS,
  buildActiveAreaProgressSeries,
  buildProgressChartDisplaySeries,
  formatProgressWindowRangeHe,
} from '../../utils/patientProgressChartData';
import ProgressTrackingLineChart from './ProgressTrackingLineChart';
import TherapistReportsView from '../dashboard/clinical/TherapistReportsView';

/** Fixed window for patient portal pain/effort chart (last 7 clinical days inclusive). */
export const PATIENT_PORTAL_PROGRESS_WINDOW_DAYS = 7;

export type PatientProgressChartPanelProps = {
  patient: Patient;
  finishReports: PatientExerciseFinishReport[];
  clinicalToday: string;
  /** When true, locks the window to the last `windowDays` ending at `clinicalToday`. */
  hideNavigation?: boolean;
  /** Alias for hideNavigation — patient portal mode. */
  isPatientView?: boolean;
  /** Visible window length in clinical days (default: 30 therapist / 7 patient). */
  windowDays?: number;
  /** Show therapist-only "finish reports" button and modal. */
  showFinishReportsButton?: boolean;
  /** Override chart height (px). */
  chartHeight?: number;
  emptyMessage?: string;
};

export default function PatientProgressChartPanel({
  patient,
  finishReports,
  clinicalToday,
  hideNavigation = false,
  isPatientView = false,
  windowDays: windowDaysProp,
  showFinishReportsButton = true,
  chartHeight,
  emptyMessage,
}: PatientProgressChartPanelProps) {
  const patientMode = hideNavigation || isPatientView;
  const windowDays =
    windowDaysProp ?? (patientMode ? PATIENT_PORTAL_PROGRESS_WINDOW_DAYS : PROGRESS_CHART_WINDOW_DAYS);

  const fullSeries = useMemo(
    () => buildActiveAreaProgressSeries(patient, finishReports),
    [patient, finishReports]
  );

  const [windowEnd, setWindowEnd] = useState(clinicalToday);
  const [showFinishReports, setShowFinishReports] = useState(false);

  useEffect(() => {
    setWindowEnd(clinicalToday);
    setShowFinishReports(false);
  }, [patient.id, clinicalToday]);

  const effectiveWindowEnd = patientMode ? clinicalToday : windowEnd;
  const canGoNext = !patientMode && windowEnd < clinicalToday;

  const displaySeries = useMemo(
    () => buildProgressChartDisplaySeries(fullSeries, effectiveWindowEnd, windowDays),
    [fullSeries, effectiveWindowEnd, windowDays]
  );

  const rangeLabel = formatProgressWindowRangeHe(effectiveWindowEnd, windowDays);

  const goToPreviousWindow = () => {
    setWindowEnd((prev) => addClinicalDays(prev, -windowDays));
  };

  const goToNextWindow = () => {
    setWindowEnd((prev) => {
      const next = addClinicalDays(prev, windowDays);
      return next > clinicalToday ? clinicalToday : next;
    });
  };

  return (
    <>
      {!patientMode && (
        <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
          <div className="flex justify-between items-center gap-3 mb-4">
            <h3 className="text-sm font-black text-slate-900 shrink-0">מעקב התקדמות</h3>
            {showFinishReportsButton && (
              <button
                type="button"
                onClick={() => setShowFinishReports(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shrink-0"
              >
                <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                דיווחי סיום תרגול
              </button>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 shrink-0">
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
      )}

      {showFinishReports && showFinishReportsButton && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-reports-modal-title"
          dir="rtl"
        >
          <div className="w-full sm:max-w-4xl max-h-[min(92dvh,900px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 id="finish-reports-modal-title" className="text-lg font-black text-slate-950">
                  דיווחי סיום תרגול
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowFinishReports(false)}
                className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
                aria-label="סגור"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto min-h-0">
              <TherapistReportsView patient={patient} />
            </div>
          </div>
        </div>
      )}

      <div className={patientMode ? undefined : 'p-4 sm:p-5'}>
        <ProgressTrackingLineChart
          data={displaySeries}
          height={chartHeight}
          emptyMessage={emptyMessage}
        />
      </div>
    </>
  );
}
