import { Activity, TrendingDown, MapPin, AlertCircle } from 'lucide-react';
import { bodyAreaLabels } from '../../types';
import type { PatientAnalytics, BodyArea } from '../../types';

interface PainAnalyticsProps {
  analytics: PatientAnalytics;
  primaryBodyArea: BodyArea;
}

function PainBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    value <= 3 ? '#10b981' : value <= 6 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-sm font-semibold text-slate-700 w-8 text-left">{value.toFixed(1)}</span>
    </div>
  );
}

function PainDot({ level }: { level: number }) {
  const color =
    level === 0
      ? '#94a3b8'
      : level <= 3
      ? '#10b981'
      : level <= 6
      ? '#f59e0b'
      : '#ef4444';
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: color }}
    >
      {level}
    </div>
  );
}

export default function PainAnalytics({ analytics, primaryBodyArea }: PainAnalyticsProps) {
  // ── Full empty state ─────────────────────────────────────────
  if (analytics.painHistory.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-teal-100 shadow-sm flex flex-col items-center text-center gap-3" dir="rtl">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: '#f0fffe' }}>
          <AlertCircle className="w-6 h-6 text-slate-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-500">אין נתוני כאב</p>
          <p className="text-xs text-slate-400 mt-1">דיווחי הכאב של המטופל יופיעו כאן לאחר הסשן הראשון</p>
        </div>
      </div>
    );
  }

  const last7 = analytics.painHistory.slice(-7);

  // ── All computations derived live from painHistory ────────────
  const currentPain = last7.length > 0 ? last7[last7.length - 1].painLevel : 0;
  const currentDate = last7.length > 0 ? last7[last7.length - 1].date : null;

  // Overall average from entire painHistory
  const computedAvgOverall =
    analytics.painHistory.length > 0
      ? analytics.painHistory.reduce((s, r) => s + r.painLevel, 0) / analytics.painHistory.length
      : 0;

  // Average for primary body area only
  const primaryAreaRecords = analytics.painHistory.filter((r) => r.bodyArea === primaryBodyArea);
  const computedAvgPrimaryArea =
    primaryAreaRecords.length > 0
      ? primaryAreaRecords.reduce((s, r) => s + r.painLevel, 0) / primaryAreaRecords.length
      : null;

  // Segmented pain by area (computed from painHistory, not static painByArea)
  const areaMap: Partial<Record<BodyArea, number[]>> = {};
  for (const record of analytics.painHistory) {
    if (!areaMap[record.bodyArea]) areaMap[record.bodyArea] = [];
    areaMap[record.bodyArea]!.push(record.painLevel);
  }
  const segmentedPain = Object.entries(areaMap).map(([area, levels]) => ({
    area: area as BodyArea,
    avg: (levels as number[]).reduce((s: number, v: number) => s + v, 0) / (levels as number[]).length,
    count: (levels as number[]).length,
  })).sort((a, b) => b.avg - a.avg);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── 3 Summary cards – all dynamic ─────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* 1. Current Pain */}
        <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm text-center">
          <Activity className="w-5 h-5 mx-auto mb-2" style={{ color: '#0d9488' }} />
          <p className="text-xs text-slate-500 mb-1">כאב נוכחי</p>
          <PainDot level={currentPain} />
          <p className="text-xs text-slate-400 mt-1">
            {currentDate
              ? new Date(currentDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
              : '—'}
          </p>
        </div>

        {/* 2. Average Overall Pain (computed from painHistory) */}
        <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm text-center">
          <TrendingDown className="w-5 h-5 mx-auto mb-2" style={{ color: '#f59e0b' }} />
          <p className="text-xs text-slate-500 mb-1">ממוצע כללי</p>
          <PainDot level={Math.round(computedAvgOverall)} />
          <p className="text-xs text-slate-400 mt-1">
            {computedAvgOverall.toFixed(1)} / 10
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5">
            מ-{analytics.painHistory.length} דיווחים
          </p>
        </div>

        {/* 3. Average for primary area (segmented data) */}
        <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm text-center">
          <MapPin className="w-5 h-5 mx-auto mb-2" style={{ color: '#8b5cf6' }} />
          <p className="text-xs text-slate-500 mb-1 truncate">
            {bodyAreaLabels[primaryBodyArea]}
          </p>
          <PainDot level={computedAvgPrimaryArea != null ? Math.round(computedAvgPrimaryArea) : 0} />
          <p className="text-xs text-slate-400 mt-1">
            {computedAvgPrimaryArea != null
              ? `${computedAvgPrimaryArea.toFixed(1)} / 10`
              : 'אין נתונים'}
          </p>
          {primaryAreaRecords.length > 0 && (
            <p className="text-[9px] text-slate-400 mt-0.5">
              מ-{primaryAreaRecords.length} דיווחים
            </p>
          )}
        </div>
      </div>

      {/* ── Segmented pain by area (live from painHistory) ────── */}
      <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">כאב ממוצע לפי אזור גוף</h4>
        {segmentedPain.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">אין נתוני כאב</p>
        ) : (
          <div className="space-y-3">
            {segmentedPain.map(({ area, avg, count }) => (
              <div key={area}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">{bodyAreaLabels[area]}</span>
                  <span className="text-[10px] text-slate-400">{count} דיווחים</span>
                </div>
                <PainBar value={avg} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last 7 Days Mini History */}
      <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">היסטוריית כאב – 7 ימים אחרונים</h4>
        <div className="flex items-end justify-between gap-1">
          {last7.map((record, i) => {
            const heightPct = Math.max((record.painLevel / 10) * 100, 5);
            const color =
              record.painLevel <= 3
                ? '#10b981'
                : record.painLevel <= 6
                ? '#f59e0b'
                : '#ef4444';
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate-400 font-medium">{record.painLevel}</span>
                <div
                  className="w-full rounded-t-md min-h-[4px] transition-all duration-300"
                  style={{ height: `${heightPct * 0.5}px`, background: color, maxHeight: '50px' }}
                />
                <span className="text-[8px] text-slate-400">
                  {new Date(record.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                </span>
              </div>
            );
          })}
        </div>
        {/* Pain Legend */}
        <div className="flex items-center justify-end gap-3 mt-3">
          {[
            { label: 'קל (0-3)', color: '#10b981' },
            { label: 'בינוני (4-6)', color: '#f59e0b' },
            { label: 'חמור (7-10)', color: '#ef4444' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
