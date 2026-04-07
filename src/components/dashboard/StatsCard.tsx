import type { ReactNode } from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: ReactNode;
  iconBg: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  highlight?: boolean;
}

export default function StatsCard({
  label,
  value,
  subtext,
  icon,
  iconBg,
  trend,
  trendValue,
  highlight = false,
}: StatsCardProps) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#94a3b8';
  const trendSymbol = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <div
      className="bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow duration-200"
      style={{
        borderColor: highlight ? '#0d9488' : '#e0f2f1',
        borderWidth: highlight ? 2 : 1,
      }}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
          <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
          {trendValue && trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-sm font-medium" style={{ color: trendColor }}>
                {trendSymbol} {trendValue}
              </span>
            </div>
          )}
        </div>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
