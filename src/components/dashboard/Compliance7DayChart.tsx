import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  build7dComplianceFromLocalHistory,
  fetch7dComplianceFromSupabase,
  type DayCompliancePoint,
} from '../../services/sessionHistoryAnalytics';
import type { DailyHistoryEntry } from '../../types';

type Props = {
  patientId: string;
  clinicalToday: string;
  localDayMap: Record<string, DailyHistoryEntry> | undefined;
  plannedExerciseCount: number;
};

export default function Compliance7DayChart({
  patientId,
  clinicalToday,
  localDayMap,
  plannedExerciseCount,
}: Props) {
  const localPoints = useMemo(
    () => build7dComplianceFromLocalHistory(localDayMap, clinicalToday),
    [localDayMap, clinicalToday]
  );
  const [remotePoints, setRemotePoints] = useState<DayCompliancePoint[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetch7dComplianceFromSupabase(
        supabase,
        patientId,
        clinicalToday,
        plannedExerciseCount
      );
      if (cancelled) return;
      if (remote) {
        setRemotePoints(remote);
        setLoadErr(null);
      } else {
        setLoadErr('לא ניתן לטעון היסטוריה מהענן — מוצגים נתונים מקומיים.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, clinicalToday, plannedExerciseCount]);

  const points = remotePoints ?? localPoints;
  const source: 'מקומי' | 'Supabase' = remotePoints ? 'Supabase' : 'מקומי';

  const avg =
    points.length > 0
      ? Math.round(points.reduce((s, p) => s + p.pct, 0) / points.length)
      : 0;

  const chartData = points.map((p) => ({
    ...p,
    name: p.label,
  }));

  return (
    <div
      className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm mb-5"
      dir="rtl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-medical-success shrink-0" />
            ציות לתוכנית — 7 ימים אחרונים
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            אחוז השלמת משימות מתוכננות ליום (לפי יום קליני). מקור נתונים: {source}
            {source === 'Supabase' ? ' (session_history)' : ''}.
          </p>
        </div>
        <div className="text-end">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            ממוצע תקופה
          </p>
          <p className="text-2xl font-black tabular-nums text-medical-success">{avg}%</p>
        </div>
      </div>

      {loadErr && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
          {loadErr}
        </p>
      )}

      <div className="w-full h-[220px] min-h-[200px]" style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748b' }}
              interval={0}
              angle={-12}
              textAnchor="end"
              height={48}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v) => `${v}%`}
              width={44}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #ccfbf1',
                fontSize: 12,
                direction: 'rtl',
                textAlign: 'right',
              }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value);
                return [`${Number.isFinite(n) ? n : 0}%`, 'ציות'];
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as DayCompliancePoint | undefined;
                return row ? `${row.clinicalDate}` : '';
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              name="ציות"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#34d399', stroke: '#059669', strokeWidth: 1 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
