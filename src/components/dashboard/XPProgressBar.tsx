interface XPProgressBarProps {
  xp: number;
  xpForNextLevel: number;
  level: number;
}

export default function XPProgressBar({ xp, xpForNextLevel, level }: XPProgressBarProps) {
  const pct = Math.min((xp / xpForNextLevel) * 100, 100);

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black shadow-sm"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {level}
          </div>
          <span className="text-sm font-semibold text-slate-700">רמה {level}</span>
        </div>
        <span className="text-xs text-slate-500">
          {xp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
        </span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #0d9488, #10b981, #34d399)',
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-slate-400">
          עוד {(xpForNextLevel - xp).toLocaleString()} XP לרמה {level + 1}
        </span>
        <span className="text-[10px] text-teal-600 font-medium">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
