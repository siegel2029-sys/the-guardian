import { X, Activity } from 'lucide-react';
import type { PainRecord, ExerciseSession, BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';

interface PatientPainProgressSheetProps {
  open: boolean;
  onClose: () => void;
  painHistory: PainRecord[];
  sessionHistory: ExerciseSession[];
  /** פסקה מותאמת אישית ממנוע Guardian */
  aiNarrative?: string;
}

function mergeTimeline(
  painHistory: PainRecord[],
  sessionHistory: ExerciseSession[],
  maxPoints: number
) {
  const painByDate = new Map<string, number[]>();
  for (const r of painHistory) {
    const d = r.date.slice(0, 10);
    if (!painByDate.has(d)) painByDate.set(d, []);
    painByDate.get(d)!.push(r.painLevel);
  }
  const diffByDate = new Map<string, number>();
  for (const s of sessionHistory) {
    const d = s.date.slice(0, 10);
    diffByDate.set(d, s.difficultyRating);
  }

  const allDates = new Set<string>([...painByDate.keys(), ...diffByDate.keys()]);
  const sorted = [...allDates].sort();
  const slice = sorted.slice(-maxPoints);

  return slice.map((date) => {
    const pains = painByDate.get(date);
    const painAvg =
      pains && pains.length > 0 ? pains.reduce((a, b) => a + b, 0) / pains.length : null;
    const difficulty = diffByDate.get(date) ?? null;
    return { date, painAvg, difficulty };
  });
}

function painByJoint(painHistory: PainRecord[]): { area: BodyArea; avg: number; n: number }[] {
  const m = new Map<BodyArea, number[]>();
  for (const r of painHistory) {
    if (!m.has(r.bodyArea)) m.set(r.bodyArea, []);
    m.get(r.bodyArea)!.push(r.painLevel);
  }
  return [...m.entries()]
    .map(([area, levels]) => ({
      area,
      avg: levels.reduce((a, b) => a + b, 0) / levels.length,
      n: levels.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

export default function PatientPainProgressSheet({
  open,
  onClose,
  painHistory,
  sessionHistory,
  aiNarrative,
}: PatientPainProgressSheetProps) {
  if (!open) return null;

  const timeline = mergeTimeline(painHistory, sessionHistory, 14);
  const joints = painByJoint(painHistory);

  const W = 320;
  const H = 140;
  const padL = 28;
  const padR = 28;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = Math.max(timeline.length, 1);
  const xAt = (i: number) => padL + (innerW * i) / Math.max(n - 1, 1);

  const yPain = (p: number) => padT + innerH * (1 - p / 10);
  const yDiff = (d: number) => padT + innerH * (1 - d / 5);

  const painPts = timeline
    .map((t, i) =>
      t.painAvg != null ? { x: xAt(i), y: yPain(t.painAvg) } : null
    )
    .filter((p): p is { x: number; y: number } => p != null);
  const diffPts = timeline
    .map((t, i) =>
      t.difficulty != null ? { x: xAt(i), y: yDiff(t.difficulty) } : null
    )
    .filter((p): p is { x: number; y: number } => p != null);

  const painPoly = painPts.map((p) => `${p.x},${p.y}`).join(' ');
  const diffPoly = diffPts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div
      className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15, 118, 110, 0.3)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 55%)',
          borderColor: '#99f6e4',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pain-progress-title"
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
          style={{ borderColor: '#ccfbf1', background: 'linear-gradient(180deg, #f0fdfa, #ffffff)' }}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-600" />
            <h2 id="pain-progress-title" className="text-base font-bold text-teal-900">
              דוח כאב אינטראקטיבי
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-teal-600 hover:bg-teal-100/80"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {aiNarrative ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed text-slate-700"
              style={{
                borderColor: '#99f6e4',
                background: 'linear-gradient(135deg, #f0fdfa, #ffffff)',
              }}
            >
              <p className="text-[10px] font-bold text-teal-800 uppercase tracking-wide mb-1">
                סיכום מותאם (Guardian)
              </p>
              <p>{aiNarrative}</p>
            </div>
          ) : null}

          {timeline.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6 leading-relaxed">
              עדיין אין מספיק דיווחים. אחרי תרגולים ודיווחי כאב/קושי הנתונים יוצגו כאן.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">כאב מול קושי לאורך זמן</p>
                <p className="text-[11px] text-slate-500 mb-2">
                  קו כתום: ממוצע כאב ליום (0–10) · קו סגול: קושי מדווח באימון (1–5)
                </p>
                <div className="rounded-2xl border border-teal-100 bg-white/80 p-2 overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[280px]" style={{ maxHeight: 160 }}>
                    <line x1={padL} y1={yPain(0)} x2={W - padR} y2={yPain(0)} stroke="#e2e8f0" strokeWidth="1" />
                    <line x1={padL} y1={yPain(5)} x2={W - padR} y2={yPain(5)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1={padL} y1={yPain(10)} x2={W - padR} y2={yPain(10)} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={4} y={yPain(10) + 4} fontSize="9" fill="#64748b">
                      10
                    </text>
                    <text x={4} y={yPain(0) + 4} fontSize="9" fill="#64748b">
                      0
                    </text>
                    <text x={W - padR + 4} y={yDiff(5) + 4} fontSize="8" fill="#7c3aed">
                      ק5
                    </text>
                    <text x={W - padR + 4} y={yDiff(1) + 4} fontSize="8" fill="#7c3aed">
                      ק1
                    </text>
                    {painPts.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#ea580c"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        points={painPoly}
                      />
                    )}
                    {painPts.length === 1 && (
                      <circle cx={painPts[0].x} cy={painPts[0].y} r="4" fill="#ea580c" />
                    )}
                    {diffPts.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="2"
                        strokeDasharray="5 3"
                        strokeLinejoin="round"
                        points={diffPoly}
                      />
                    )}
                    {diffPts.length === 1 && (
                      <circle cx={diffPts[0].x} cy={diffPts[0].y} r="3.5" fill="#7c3aed" />
                    )}
                  </svg>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-orange-600 rounded" />
                    כאב
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-violet-600 rounded border-dashed" style={{ borderTopWidth: 2 }} />
                    קושי
                  </span>
                </div>
                <div className="flex justify-between gap-0.5 mt-2 text-[8px] text-slate-400 px-1">
                  {timeline.map((t) => (
                    <span key={t.date} className="flex-1 text-center truncate" title={t.date}>
                      {new Date(t.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">פירוק לפי מפרק / אזור (מדיווחי כאב)</p>
                {joints.length === 0 ? (
                  <p className="text-xs text-slate-400">אין פירוק לפי אזור</p>
                ) : (
                  <ul className="space-y-2">
                    {joints.map(({ area, avg, n }) => (
                      <li key={area} className="flex items-center gap-2 text-xs">
                        <span className="w-28 shrink-0 text-slate-600">{bodyAreaLabels[area]}</span>
                        <div className="flex-1 h-2 rounded-full bg-teal-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (avg / 10) * 100)}%`,
                              background:
                                avg <= 3 ? '#10b981' : avg <= 6 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="w-12 text-end font-mono text-slate-600">{avg.toFixed(1)}</span>
                        <span className="text-slate-400 w-14 text-end">{n} דיווחים</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
