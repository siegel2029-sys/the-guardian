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
import type { PatientProgressChartPoint } from '../../utils/patientProgressChartData';

export const PROGRESS_TRACKING_LEGEND_ITEMS = [
  { label: 'כאב (VAS)', color: '#dc2626', dashed: false },
  { label: 'מאמץ (1–10)', color: '#2563eb', dashed: false },
  { label: 'מגמת התקדמות (קלינית)', color: '#0f172a', dashed: true },
] as const;

export function ProgressTrackingChartLegend() {
  return (
    <div
      className="flex flex-row flex-wrap items-center justify-center gap-4 pt-5"
      dir="rtl"
      role="list"
      aria-label="מקרא גרף"
    >
      {PROGRESS_TRACKING_LEGEND_ITEMS.map((item) => (
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

export type ProgressTrackingLineChartProps = {
  data: PatientProgressChartPoint[];
  /** Chart height in px (default 300). */
  height?: number;
  emptyMessage?: string;
};

export default function ProgressTrackingLineChart({
  data,
  height = 300,
  emptyMessage = 'אין דיווחי תרגול באזור הפעיל בטווח התאריכים שנבחר',
}: ProgressTrackingLineChartProps) {
  const hasSignal = data.some((row) => row.pain != null || row.effort != null);

  if (!hasSignal) {
    return (
      <p className="text-sm text-slate-500 text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/80">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="w-full min-w-[280px]" dir="ltr">
        <ResponsiveContainer width="100%" height={height} minWidth={280} minHeight={240}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
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
              name="מאמץ (1–10)"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3, fill: '#2563eb' }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trend"
              name="מגמת התקדמות (קלינית)"
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
      <ProgressTrackingChartLegend />
    </>
  );
}
