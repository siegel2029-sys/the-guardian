import { useMemo } from 'react';
import { X, Activity, Info } from 'lucide-react';
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
import type { PainRecord } from '../../types';
import { addClinicalDays } from '../../utils/clinicalCalendar';

const WINDOW_DAYS = 14;

export type PainTrendKind = 'improving' | 'worsening' | 'stable' | 'insufficient';

export type PainAnalyticsModalProps = {
  open: boolean;
  onClose: () => void;
  painHistory: PainRecord[];
  /** YYYY-MM-DD — סוף חלון הקליני (כמו ב־PatientContext) */
  clinicalToday: string;
};

type ChartRow = {
  dateKey: string;
  label: string;
  pain: number | null;
};

function dayKeyFromRecord(dateIso: string): string {
  return dateIso.slice(0, 10);
}

function buildDailyPainSeries(
  painHistory: PainRecord[],
  clinicalToday: string,
  nDays: number
): ChartRow[] {
  const byDay = new Map<string, number[]>();
  for (const r of painHistory) {
    const k = dayKeyFromRecord(r.date);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(r.painLevel);
  }

  const rows: ChartRow[] = [];
  for (let i = 0; i < nDays; i++) {
    const dateKey = addClinicalDays(clinicalToday, -(nDays - 1 - i));
    const levels = byDay.get(dateKey);
    const pain =
      levels && levels.length > 0
        ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10
        : null;
    const d = new Date(dateKey + 'T12:00:00');
    const label = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
    rows.push({ dateKey, label, pain });
  }
  return rows;
}

export function classifyPainTrendFromDaily(rows: ChartRow[]): PainTrendKind {
  const firstWeek = rows.slice(0, 7).map((r) => r.pain).filter((v): v is number => v != null);
  const secondWeek = rows.slice(7).map((r) => r.pain).filter((v): v is number => v != null);
  if (firstWeek.length >= 2 && secondWeek.length >= 2) {
    const m1 = firstWeek.reduce((s, v) => s + v, 0) / firstWeek.length;
    const m2 = secondWeek.reduce((s, v) => s + v, 0) / secondWeek.length;
    return trendFromMeans(m1, m2);
  }
  const seq = rows.map((r) => r.pain).filter((v): v is number => v != null);
  if (seq.length < 4) return 'insufficient';
  const mid = Math.floor(seq.length / 2);
  const a = seq.slice(0, mid);
  const b = seq.slice(mid);
  if (a.length === 0 || b.length === 0) return 'insufficient';
  const m1 = a.reduce((s, v) => s + v, 0) / a.length;
  const m2 = b.reduce((s, v) => s + v, 0) / b.length;
  return trendFromMeans(m1, m2);
}

function trendFromMeans(olderWeekAvg: number, newerWeekAvg: number): PainTrendKind {
  const delta = newerWeekAvg - olderWeekAvg;
  if (delta < -0.35) return 'improving';
  if (delta > 0.35) return 'worsening';
  return 'stable';
}

function trendCopy(kind: PainTrendKind): string {
  switch (kind) {
    case 'improving':
      return 'נהדר! אנחנו רואים ירידה הדרגתית ברמת הכאב שלך.';
    case 'worsening':
    case 'stable':
      return 'המגמה יציבה. המשך בתרגול והתייעץ עם הפיזיותרפיסט במידת הצורך.';
    default:
      return 'אין עדיין מספיק דיווחי כאב בתקופה הזו כדי לחשב מגמה אמינה. אחרי מספר דיווחים הגרף והניתוח יתעדכנו.';
  }
}

export default function PainAnalyticsModal({
  open,
  onClose,
  painHistory,
  clinicalToday,
}: PainAnalyticsModalProps) {
  const chartRows = useMemo(
    () => buildDailyPainSeries(painHistory, clinicalToday, WINDOW_DAYS),
    [painHistory, clinicalToday]
  );

  const trendKind = useMemo(() => classifyPainTrendFromDaily(chartRows), [chartRows]);
  const trendText = trendCopy(trendKind);

  const hasAnyPoint = chartRows.some((r) => r.pain != null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pain-analytics-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="סגור רקע"
        onClick={onClose}
      />
      <div
        className="relative z-[96] w-full max-w-lg max-h-[min(92dvh,720px)] flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_64px_-12px_rgba(15,23,42,0.35)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-b from-teal-50/80 to-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 border border-teal-200/80 shrink-0">
              <Activity className="h-5 w-5 text-teal-700" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="pain-analytics-title" className="text-base font-bold text-slate-900 leading-tight">
                מעקב כאב — תצוגה מפורטת
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {WINDOW_DAYS} הימים האחרונים (לוח קליני)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            aria-label="סגור"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-4 space-y-5">
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-2.5">מגמת כאב (ממוצע יומי)</h3>
            {!hasAnyPoint ? (
              <p className="text-sm text-slate-500 text-center py-8 leading-relaxed rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
                עדיין אין דיווחי כאב בטווח התאריכים. דיווחים אחרי תרגולים יופיעו בגרף.
              </p>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2" dir="ltr">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                        direction: 'rtl',
                        textAlign: 'right',
                      }}
                      formatter={(value) => {
                        const n = typeof value === 'number' ? value : Number(value);
                        const ok = Number.isFinite(n);
                        return [ok ? `${n} / 10` : '—', 'ממוצע יומי'];
                      }}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as ChartRow | undefined;
                        return p ? `תאריך: ${p.dateKey}` : '';
                      }}
                    />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <ReferenceLine y={10} stroke="#cbd5e1" />
                    <Line
                      type="monotone"
                      dataKey="pain"
                      name="כאב"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#0f766e', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <h3 className="text-sm font-bold text-slate-900 mb-2">ניתוח מגמה</h3>
            <p className="text-sm text-slate-700 leading-relaxed">{trendText}</p>
          </section>

          <section className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3 flex gap-2.5">
            <Info className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 text-xs text-slate-700 leading-relaxed space-y-1.5">
              <p className="font-bold text-slate-900">סולם הכאב 0–10</p>
              <p>
                <strong>0</strong> — אין כאב. <strong>1–3</strong> — כאב קל. <strong>4–6</strong> — בינוני.{' '}
                <strong>7–9</strong> — חזק. <strong>10</strong> — הכי חזק שאפשר לדמיין.
              </p>
              <p>
                דווחו על הכאב <strong>באזור המטופל בו אתם מתמקדים כרגע</strong>, ברגע הדיווח (לא «הכי גרוע
                השבוע»). עקביות בדיווח עוזרת למטפל להתאים את התוכנית.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
