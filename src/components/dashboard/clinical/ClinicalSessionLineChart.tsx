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
  ReferenceLine,
} from 'recharts';
import type { Patient } from '../../../types';
import { effortRatingToVas10 } from '../../../utils/patientPainMetrics';

type Row = {
  label: string;
  pain: number | null;
  effort10: number;
  trend: number | null;
};

function lastPainOnDate(
  painHistory: { date: string; painLevel: number }[],
  date: string
): number | null {
  const day = painHistory.filter((r) => r.date === date);
  if (day.length === 0) return null;
  return day[day.length - 1].painLevel;
}

function linearTrendOverIndices(values: (number | null)[]): (number | null)[] {
  const pts: { x: number; y: number }[] = [];
  values.forEach((y, x) => {
    if (y != null && !Number.isNaN(y)) pts.push({ x, y });
  });
  if (pts.length < 2) return values.map(() => null);
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = pts.length;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    const y0 = pts[0]?.y ?? null;
    return values.map(() => y0);
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => Math.round((slope * i + intercept) * 10) / 10);
}

export default function ClinicalSessionLineChart({ patient }: { patient: Patient }) {
  const chartData = useMemo((): Row[] => {
    const sessions = [...patient.analytics.sessionHistory].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const last7 = sessions.slice(-7);
    const ph = patient.analytics.painHistory;

    const painSeries: (number | null)[] = last7.map((s) => lastPainOnDate(ph, s.date));
    const trend = linearTrendOverIndices(painSeries);

    return last7.map((s, i) => ({
      label: s.date.slice(5).replace('-', '/'),
      pain: painSeries[i],
      effort10: Math.round(effortRatingToVas10(s.difficultyRating) * 10) / 10,
      trend: trend[i],
    }));
  }, [patient.analytics.sessionHistory, patient.analytics.painHistory]);

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-10">אין מספיק סשנים לגרף (נדרשים נתוני אימון)</p>
    );
  }

  return (
    <div className="w-full" dir="ltr">
      <p className="text-xs font-semibold text-slate-700 mb-2 text-end" dir="rtl">
        שבעת הסשנים האחרונים · ציר אנכי 0–10 (VAS)
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b' }}
            label={{ value: 'סשן (תאריך)', position: 'bottom', offset: 0, fill: '#475569', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            label={{
              value: 'דירוג 0–10 (VAS)',
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
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
          <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="pain"
            name="כאב (VAS)"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#2563eb' }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="effort10"
            name="מאמץ (0–10)"
            stroke="#0891b2"
            strokeWidth={2}
            dot={{ r: 3, fill: '#0891b2' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="trend"
            name="מגמה (כאב)"
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-slate-500 mt-2 leading-relaxed text-end" dir="rtl">
        מאמץ: דירוג המאמץ המדווח אחרי אימון (1–5), מוצג במקבילה ל־VAS על בסיס 0–10.
      </p>
    </div>
  );
}
