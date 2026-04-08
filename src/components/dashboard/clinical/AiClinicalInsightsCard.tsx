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
import { Sparkles, AlertTriangle, Stethoscope, ListChecks } from 'lucide-react';
import type {
  BodyArea,
  DailyHistoryEntry,
  ExercisePlan,
  Patient,
  PatientExerciseFinishReport,
  SelfCareSessionReport,
} from '../../../types';
import { aggregateClinicalInsights } from '../../../services/clinicalInsightsAggregation';
import { buildClinicalInsightsNarrative } from '../../../ai/clinicalInsightsNarrative';

function firstNameFrom(full: string): string {
  const p = full.trim().split(/\s+/);
  return p[0] ?? full;
}

type Props = {
  patient: Patient;
  clinicalToday: string;
  plan: ExercisePlan | undefined;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
  selfSelectedZones: BodyArea[];
  selfCareReports: SelfCareSessionReport[];
  finishReports: PatientExerciseFinishReport[];
};

export default function AiClinicalInsightsCard({
  patient,
  clinicalToday,
  plan,
  dailyHistoryForPatient,
  selfSelectedZones,
  selfCareReports,
  finishReports,
}: Props) {
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
    const narrative = buildClinicalInsightsNarrative(aggregated, firstNameFrom(patient.name));
    return { aggregated, narrative };
  }, [
    patient,
    clinicalToday,
    plan,
    dailyHistoryForPatient,
    selfSelectedZones,
    selfCareReports,
    finishReports,
  ]);

  const hasChartPoint = aggregated.daySeries7.some(
    (d) => d.pain != null || d.effort10 != null
  );
  const compliancePct =
    aggregated.compliance.rate != null
      ? Math.round(aggregated.compliance.rate * 100)
      : null;

  return (
    <div
      className="rounded-2xl p-[2px] shadow-md mb-5"
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,55,0.95) 0%, rgba(147,51,234,0.85) 48%, rgba(99,102,241,0.75) 100%)',
        boxShadow: '0 12px 40px -12px rgba(91, 33, 182, 0.35)',
      }}
    >
      <div
        className="rounded-2xl bg-white overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #faf8ff 0%, #ffffff 52%, #fffef8 100%)',
        }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-violet-100/80 flex items-start gap-3" dir="rtl">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #f5e6a8 0%, #e9d5ff 45%, #ddd6fe 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
            }}
          >
            <Sparkles className="w-5 h-5 text-violet-800" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">תובנות AI קליניות</h2>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              סיכום מבוסס נתונים: תרגול, כאב, עמידה בתוכנית ואזורי Avatar · 7 ימים קליניים אחרונים
            </p>
            {compliancePct != null && aggregated.compliance.plannedSum > 0 && (
              <p className="text-[11px] font-semibold text-violet-900/90 mt-2">
                עמידה בתוכנית: {compliancePct}% ({aggregated.compliance.completedSum}/
                {aggregated.compliance.plannedSum} תרגילים מתוכננים בחלון)
              </p>
            )}
            {aggregated.compliance.plannedSum === 0 && (
              <p className="text-[11px] text-amber-800 font-medium mt-2">
                אין תרגילים בתוכנית — הגדרת תוכנית תאפשר חישוב עמידה.
              </p>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4" dir="rtl">
          <section className="rounded-xl border border-violet-100/90 bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2 text-violet-950 mb-2">
              <Stethoscope className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wide text-violet-800/90">
                מגמה קלינית
              </span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">{narrative.trendParagraph}</p>
          </section>

          {narrative.selfCareAlerts.length > 0 && (
            <section className="rounded-xl border border-amber-200/90 bg-amber-50/60 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-950 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-900">התראת טיפול עצמי</span>
              </div>
              <ul className="text-sm text-amber-950 space-y-2 list-disc list-inside leading-relaxed">
                {narrative.selfCareAlerts.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {narrative.redFlags.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
              <div className="flex items-center gap-2 text-red-950 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-xs font-bold text-red-900">דגלים אדומים</span>
              </div>
              <ul className="text-sm text-red-950 space-y-2 list-disc list-inside leading-relaxed">
                {narrative.redFlags.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {hasChartPoint ? (
            <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-3">
              <p className="text-xs font-bold text-slate-700 mb-2 text-end" dir="rtl">
                כאב מול מאמץ · 7 ימים קליניים (ציר 0–10)
              </p>
              <div className="w-full" dir="ltr" style={{ height: 168 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={aggregated.daySeries7}
                    margin={{ top: 4, right: 8, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                    />
                    <YAxis
                      domain={[0, 10]}
                      width={28}
                      ticks={[0, 5, 10]}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: 11,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="pain"
                      name="כאב (ממוצע יומי)"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#7c3aed' }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="effort10"
                      name="מאמץ (0–10)"
                      stroke="#ca8a04"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: '#ca8a04' }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed text-end" dir="rtl">
                כאב: אזור ראשי קליני. מאמץ: סשן מדווח, או ממוצע מדיווחי סיום / self-care באותו יום.
              </p>
            </section>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4 rounded-xl border border-dashed border-slate-200">
              אין מספיק נקודות לגרף כאב/מאמץ בחלון השבוע.
            </p>
          )}

          <section className="rounded-xl border border-violet-100 bg-violet-50/30 px-4 py-3">
            <div className="flex items-center gap-2 text-violet-950 mb-2">
              <ListChecks className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-xs font-bold text-violet-900">פעולות מומלצות</span>
            </div>
            <ol className="text-sm text-slate-800 space-y-2 list-decimal list-inside leading-relaxed font-medium">
              {narrative.recommendedActions.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
