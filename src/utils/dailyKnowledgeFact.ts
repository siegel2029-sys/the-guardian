import type { KnowledgeFact } from '../types';
import { useEffect, useState } from 'react';
import { getClinicalDate } from './clinicalCalendar';
import { DEV_MOCK_DATE_CHANGED_EVENT } from './debugMockDate';

/** Local calendar YYYY-MM-DD — used as a stable daily key for all users on the same local date. */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 1-based day-of-year in the local timezone for the given calendar day. */
export function getLocalDayOfYearForYmd(ymd: string): number {
  const [y, mo, da] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !mo || !da) return 1;
  const d = new Date(y, mo - 1, da);
  d.setHours(0, 0, 0, 0);
  const start = new Date(y, 0, 1);
  start.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** Non-negative modulo — JS `%` can be negative for large sums. */
function positiveMod(n: number, modulus: number): number {
  if (modulus <= 0) return 0;
  const m = n % modulus;
  return m < 0 ? m + modulus : m;
}

/**
 * One approved fact per clinical calendar day (YYYY-MM-DD): stable for all users that day,
 * not random per visit. Cycles through the sorted catalog as the date advances.
 */
export function selectDailyApprovedKnowledgeFact(
  approvedFacts: KnowledgeFact[],
  calendarDayYmd: string
): KnowledgeFact | null {
  if (approvedFacts.length === 0) return null;
  const sorted = [...approvedFacts].sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.length === 1) return sorted[0];

  const dayOfYear = getLocalDayOfYearForYmd(calendarDayYmd);
  const year = parseInt(calendarDayYmd.slice(0, 4), 10) || 0;
  // year * 367 + dayOfYear changes every clinical day and avoids identical slots each Jan 1
  const index = positiveMod(year * 367 + dayOfYear, sorted.length);
  return sorted[index] ?? sorted[0];
}

/**
 * Re-renders when the clinical calendar day changes (04:00 local rollover), including if the tab
 * was backgrounded across rollover or the machine wakes from sleep.
 */
export function useLocalCalendarDayKey(): string {
  const [key, setKey] = useState(() => getClinicalDate());

  useEffect(() => {
    const sync = () => {
      const next = getClinicalDate();
      setKey((prev) => (prev !== next ? next : prev));
    };

    const id = window.setInterval(sync, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const onDevMock = () => sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(DEV_MOCK_DATE_CHANGED_EVENT, onDevMock as EventListener);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(DEV_MOCK_DATE_CHANGED_EVENT, onDevMock as EventListener);
    };
  }, []);

  return key;
}
