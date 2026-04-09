import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, ChevronLeft, Calendar, Check } from 'lucide-react';
import type { DailyHistoryEntry } from '../../types';
import { clinicalDateToLocalMidnight } from '../../utils/clinicalCalendar';

const CELL_W = 40;
const CELL_H = 38;
const GAP = 4;

const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const WD = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** מרכז תא בלוח (RTL: עמודה 0 = ימין) */
function cellCenter(
  _year: number,
  _month: number,
  calendarDay: number,
  firstWeekday: number
): { x: number; y: number } {
  const index = firstWeekday + calendarDay - 1;
  const row = Math.floor(index / 7);
  const col = index % 7;
  const colRtl = 6 - col;
  const x = GAP + colRtl * (CELL_W + GAP) + CELL_W / 2;
  const y = GAP + row * (CELL_H + GAP) + CELL_H / 2;
  return { x, y };
}

function buildStreakSegments(
  year: number,
  month: number,
  daysInMonth: number,
  firstWeekday: number,
  entries: Record<string, DailyHistoryEntry | undefined>
): { x1: number; y1: number; x2: number; y2: number }[] {
  const qualifying: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymd(year, month, d);
    const e = entries[key];
    if (e && e.exercisesCompleted > 0) {
      qualifying.push(d);
    }
  }
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let i = 0;
  while (i < qualifying.length) {
    let j = i;
    while (j + 1 < qualifying.length && qualifying[j + 1] === qualifying[j] + 1) {
      j += 1;
    }
    const c1 = cellCenter(year, month, qualifying[i], firstWeekday);
    const c2 = cellCenter(year, month, qualifying[j], firstWeekday);
    lines.push({ x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y });
    i = j + 1;
  }
  return lines;
}

const WORKOUT_GLOW =
  '0 0 0 2px rgba(34, 197, 94, 0.55), 0 0 12px rgba(34, 197, 94, 0.45), 0 0 22px rgba(34, 197, 94, 0.2)';

function cellStyle(
  entry: DailyHistoryEntry | undefined,
  isToday: boolean,
  hasCompletedWorkout: boolean
): CSSProperties {
  const base: CSSProperties = {
    width: CELL_W,
    height: CELL_H,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    border: isToday ? '2px solid #0d9488' : '1px solid rgba(15,118,110,0.15)',
    boxSizing: 'border-box',
    position: 'relative',
  };
  const withWorkoutGlow = (s: CSSProperties): CSSProperties => {
    if (!hasCompletedWorkout) return s;
    const prev = s.boxShadow;
    return {
      ...s,
      boxShadow: prev ? `${prev}, ${WORKOUT_GLOW}` : WORKOUT_GLOW,
    };
  };
  if (!entry || entry.status === 'empty') {
    return withWorkoutGlow({
      ...base,
      background: 'rgba(241,245,249,0.9)',
      color: '#94a3b8',
    });
  }
  if (entry.status === 'gold') {
    return withWorkoutGlow({
      ...base,
      background: 'linear-gradient(145deg, #fde68a, #f59e0b)',
      color: '#78350f',
      boxShadow: isToday ? '0 0 0 2px #0d9488' : '0 2px 8px rgba(245, 158, 11, 0.35)',
    });
  }
  if (entry.status === 'silver') {
    return withWorkoutGlow({
      ...base,
      background: 'linear-gradient(145deg, #e2e8f0, #cbd5e1)',
      color: '#334155',
    });
  }
  /* stasis — קרח */
  return withWorkoutGlow({
    ...base,
    background: 'linear-gradient(145deg, #dbeafe, #93c5fd)',
    color: '#1e3a5f',
    borderColor: '#7dd3fc',
  });
}

interface ClinicalMonthCalendarProps {
  /** מפת תאריך קליני → רשומה */
  dayMap: Record<string, DailyHistoryEntry>;
  clinicalToday: string;
}

export default function ClinicalMonthCalendar({ dayMap, clinicalToday }: ClinicalMonthCalendarProps) {
  const anchor = useMemo(() => clinicalDateToLocalMidnight(clinicalToday), [clinicalToday]);
  const [offset, setOffset] = useState(0);

  const { year, month, daysInMonth, firstWeekday, gridRows } = useMemo(() => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dim = new Date(y, m, 0).getDate();
    const fwd = new Date(y, m - 1, 1).getDay();
    const cells = fwd + dim;
    const rows = Math.ceil(cells / 7);
    return { year: y, month: m, daysInMonth: dim, firstWeekday: fwd, gridRows: rows };
  }, [anchor, offset]);

  const streakLines = useMemo(
    () => buildStreakSegments(year, month, daysInMonth, firstWeekday, dayMap),
    [year, month, daysInMonth, firstWeekday, dayMap]
  );

  const gridW = 7 * CELL_W + 8 * GAP;
  const gridH = gridRows * CELL_H + (gridRows + 1) * GAP;

  return (
    <section
      className="rounded-2xl border p-4 mb-5"
      style={{
        borderColor: '#a7f3d0',
        background: 'linear-gradient(135deg, rgba(240,253,250,0.95), #ffffff)',
      }}
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-5 h-5 text-teal-600 shrink-0" />
          <h2 className="text-sm font-bold text-teal-950 truncate">
            לוח קליני — {MONTH_NAMES[month - 1]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-800"
            aria-label="חודש קודם"
            onClick={() => setOffset((o) => o - 1)}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-800"
            aria-label="חודש הבא"
            onClick={() => setOffset((o) => o + 1)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-slate-600 mb-2 px-0.5">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(145deg,#fde68a,#f59e0b)' }} />
          זהב — כל התוכנית הושלמה בלי דיווח כאב גבוה (≥7) באותו יום
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(145deg,#e2e8f0,#cbd5e1)' }} />
          כסף — חלקי
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(145deg,#dbeafe,#93c5fd)' }} />
          קרח — סטזיס / ללא ביצוע
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ boxShadow: WORKOUT_GLOW, background: 'rgba(187, 247, 208, 0.95)' }}
          />
          וי — בוצע לפחות תרגיל אחד
        </span>
        <span className="inline-flex items-center gap-1 text-teal-700">
          קו — רצף ימים עם פעילות
        </span>
      </div>

      <div className="flex justify-center overflow-x-auto">
        <div className="relative" style={{ width: gridW, minHeight: gridH + 28 }}>
          <div
            className="grid gap-1 mb-1"
            style={{
              gridTemplateColumns: `repeat(7, ${CELL_W}px)`,
              gap: GAP,
              padding: GAP,
            }}
          >
            {WD.map((w) => (
              <div
                key={w}
                className="text-[10px] font-semibold text-center text-slate-500"
                style={{ width: CELL_W }}
              >
                {w}
              </div>
            ))}
          </div>

          <div className="relative" style={{ width: gridW, height: gridH }}>
            <div
              className="grid absolute top-0 left-0 z-[1]"
              style={{
                gridTemplateColumns: `repeat(7, ${CELL_W}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${CELL_H}px)`,
                gap: GAP,
                padding: GAP,
                width: gridW,
                height: gridH,
              }}
            >
              {Array.from({ length: firstWeekday + daysInMonth }, (_, idx) => {
                const dayNum = idx - firstWeekday + 1;
                if (dayNum < 1 || dayNum > daysInMonth) {
                  return (
                    <div
                      key={`pad-${idx}`}
                      style={{ width: CELL_W, height: CELL_H }}
                    />
                  );
                }
                const key = ymd(year, month, dayNum);
                const entry = dayMap[key];
                const isToday = key === clinicalToday;
                const hasWorkout = entry != null && entry.exercisesCompleted > 0;
                return (
                  <div
                    key={key}
                    style={cellStyle(entry, isToday, hasWorkout)}
                    title={
                      entry
                        ? `${key}: ${entry.status} (${entry.exercisesCompleted}/${entry.exercisesPlanned})`
                        : key
                    }
                  >
                    {hasWorkout && (
                      <span
                        className="absolute top-0.5 start-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500/95 text-white shadow-sm"
                        aria-hidden
                      >
                        <Check className="h-2 w-2 stroke-[3]" />
                      </span>
                    )}
                    {dayNum}
                  </div>
                );
              })}
            </div>
            <svg
              className="absolute inset-0 z-[2] overflow-visible pointer-events-none"
              width={gridW}
              height={gridH}
              aria-hidden
            >
              {streakLines.map((ln, idx) => (
                <line
                  key={idx}
                  x1={ln.x1}
                  y1={ln.y1}
                  x2={ln.x2}
                  y2={ln.y2}
                  stroke="#b45309"
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 mt-2 text-center leading-relaxed">
        יום נספר מ־04:00 — תואם לפרוטוקול הקליני. רצף וצבעים נשמרים אחרי רענון.
      </p>
    </section>
  );
}
