import { X, Activity } from 'lucide-react';
import type { PainRecord } from '../../types';

interface PatientPainProgressSheetProps {
  open: boolean;
  onClose: () => void;
  painHistory: PainRecord[];
}

export default function PatientPainProgressSheet({
  open,
  onClose,
  painHistory,
}: PatientPainProgressSheetProps) {
  if (!open) return null;

  const slice = painHistory.slice(-10);
  const avg =
    slice.length > 0
      ? slice.reduce((s, r) => s + r.painLevel, 0) / slice.length
      : null;

  return (
    <div
      className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15, 118, 110, 0.3)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden"
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
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: '#ccfbf1' }}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-600" />
            <h2 id="pain-progress-title" className="text-base font-bold text-teal-900">
              מעקב כאב שלי
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

        <div className="p-5">
          {slice.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6 leading-relaxed">
              עדיין אין דיווחי כאב. אחרי שתסמנו תרגיל כבוצע ותמלאו את הדיווח, הנתונים יופיעו כאן.
            </p>
          ) : (
            <>
              {avg != null && (
                <p className="text-xs text-slate-600 mb-4 text-center">
                  ממוצע ב־{slice.length} הדיווחים האחרונים:{' '}
                  <span className="font-bold text-teal-800">{avg.toFixed(1)}</span> / 10
                </p>
              )}
              <p className="text-xs text-slate-500 mb-3 font-medium">דיווחים אחרונים</p>
              <div className="flex items-end justify-between gap-1 min-h-[120px]">
                {slice.map((record, i) => {
                  const heightPct = Math.max((record.painLevel / 10) * 100, 8);
                  const color =
                    record.painLevel <= 3
                      ? '#10b981'
                      : record.painLevel <= 6
                        ? '#f59e0b'
                        : '#ef4444';
                  return (
                    <div key={`${record.date}-${i}`} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-slate-600">
                        {record.painLevel}
                      </span>
                      <div
                        className="w-full rounded-t-md min-h-[6px] transition-all duration-300"
                        style={{
                          height: `${heightPct * 0.45}px`,
                          maxHeight: '72px',
                          background: color,
                        }}
                      />
                      <span className="text-[8px] text-slate-400 leading-tight text-center">
                        {new Date(record.date).toLocaleDateString('he-IL', {
                          day: 'numeric',
                          month: 'numeric',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                {[
                  { label: 'קל (0–3)', color: '#10b981' },
                  { label: 'בינוני (4–6)', color: '#f59e0b' },
                  { label: 'חמור (7–10)', color: '#ef4444' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
