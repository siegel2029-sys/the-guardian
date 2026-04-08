import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Activity, MessageSquare, ShieldAlert, Sparkles, ListChecks } from 'lucide-react';
import type {
  BodyArea,
  DailyHistoryEntry,
  ExercisePlan,
  Patient,
  PatientExerciseFinishReport,
  SelfCareSessionReport,
} from '../../../types';
import type { ClinicalProgressInsight } from '../../../ai/clinicalCommandInsight';
import { aggregateClinicalInsights } from '../../../services/clinicalInsightsAggregation';
import { buildUnifiedClinicalNarrative } from '../../../ai/clinicalInsightsNarrative';
import { getPatientAvatarPresentation } from './clinicalPatientPresentation';

type Props = {
  patient: Patient;
  clinicalToday: string;
  plan: ExercisePlan | undefined;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
  selfSelectedZones: BodyArea[];
  selfCareReports: SelfCareSessionReport[];
  finishReports: PatientExerciseFinishReport[];
  progressInsight: ClinicalProgressInsight;
  unreadFromPatient: number;
  lastAlertIso: string | null;
};

export default function SmartClinicalAnalysisCenter({
  patient,
  clinicalToday,
  plan,
  dailyHistoryForPatient,
  selfSelectedZones,
  selfCareReports,
  finishReports,
  progressInsight,
  unreadFromPatient,
  lastAlertIso,
}: Props) {
  const presentation = useMemo(() => getPatientAvatarPresentation(patient), [patient]);

  const { aggregated, narrative } = useMemo(() => {
    const aggregated = aggregateClinicalInsights({
      patient,
      clinicalToday,
      plan,
      dailyHistoryForPatient,
      selfSelectedZones,
      selfCareReports,
      finishReports,
    });
    const narrative = buildUnifiedClinicalNarrative(
      aggregated,
      patient.name,
      progressInsight
    );
    return { aggregated, narrative };
  }, [
    patient,
    clinicalToday,
    plan,
    dailyHistoryForPatient,
    selfSelectedZones,
    selfCareReports,
    finishReports,
    progressInsight,
  ]);

  const hasChartPoint = aggregated.daySeries7.some(
    (d) => d.pain != null || d.effort1to5 != null
  );

  return (
    <div
      className="rounded-2xl border border-slate-200/90 bg-white shadow-sm mb-5 overflow-hidden"
      dir="rtl"
    >
      <div
        className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3"
        style={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)',
              }}
            >
              <Sparkles className="w-5 h-5 text-violet-700" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                מרכז ניתוח קליני חכם
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {presentation.labelHe} · {presentation.subtitleHe}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-start sm:justify-end shrink-0">
            {unreadFromPatient > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-900">
                <MessageSquare className="w-3.5 h-3.5" />
                {unreadFromPatient} הודעות שלא נקראו
              </span>
            )}
            {lastAlertIso && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-900 border border-red-100">
                <ShieldAlert className="w-3.5 h-3.5" />
                התראת בטיחות אחרונה:{' '}
                {new Date(lastAlertIso).toLocaleString('he-IL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {patient.currentStreak > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                <Activity className="w-3.5 h-3.5" />
                רצף {patient.currentStreak} ימים
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-slate-700">נתונים — כאב ומאמץ לאורך זמן</p>
            <span className="text-[10px] text-slate-400 tabular-nums">7 ימים קליניים</span>
          </div>
          {hasChartPoint ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2" dir="ltr">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={aggregated.daySeries7}
                  margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                  <YAxis
                    yAxisId="pain"
                    orientation="left"
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    width={34}
                    tick={{ fontSize: 10, fill: '#7c3aed' }}
                    label={{
                      value: 'כאב 1–10',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#6d28d9',
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    yAxisId="effort"
                    orientation="right"
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    width={36}
                    tick={{ fontSize: 10, fill: '#b45309' }}
                    label={{
                      value: 'מאמץ 1–5',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#b45309',
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      fontSize: 11,
                    }}
                    formatter={(value, name) => {
                      if (name === 'כאב') return [`${value}/10`, name];
                      if (name === 'מאמץ') return [`${value}/5`, name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    yAxisId="pain"
                    type="monotone"
                    dataKey="pain"
                    name="כאב"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#7c3aed' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="effort"
                    type="monotone"
                    dataKey="effort1to5"
                    name="מאמץ"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#d97706' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-10 rounded-xl border border-dashed border-slate-200 bg-slate-50/30">
              אין מספיק נקודות לגרף — דיווחי כאב ומאמץ אחרי אימונים ימלאו את המסלולים.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-violet-100 bg-violet-50/25 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
            <span className="text-xs font-bold text-violet-900">סיכום AI קליני (מבוסס הגרף)</span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
            {narrative.graphAnchoredSummary}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="w-4 h-4 text-slate-700 shrink-0" />
            <span className="text-xs font-bold text-slate-900">פעולות מומלצות — הצעד הבא</span>
          </div>
          <ol className="text-sm text-slate-800 space-y-2 list-decimal list-inside leading-relaxed font-medium">
            {narrative.recommendedActions.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
