import type { KnowledgeFact } from '../types';
import { useEffect, useState } from 'react';
import { DEV_MOCK_DATE_CHANGED_EVENT, getAppDate } from './debugMockDate';

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

/**
 * One approved fact per calendar day, same for every user on that local date.
 * Facts are sorted by `id` so cloud/API order does not change the daily index.
 */
export function selectDailyApprovedKnowledgeFact(
  approvedFacts: KnowledgeFact[],
  calendarDayYmd: string
): KnowledgeFact | null {
  if (approvedFacts.length === 0) return null;
  const sorted = [...approvedFacts].sort((a, b) => a.id.localeCompare(b.id));
  const dayOfYear = getLocalDayOfYearForYmd(calendarDayYmd);
  const index = dayOfYear % sorted.length;
  return sorted[index] ?? null;
}

/**
 * Re-renders when the local calendar date changes (midnight), including if the tab
 * was backgrounded across midnight or the machine wakes from sleep.
 */
export function useLocalCalendarDayKey(): string {
  const [key, setKey] = useState(() => formatLocalYmd(getAppDate()));

  useEffect(() => {
    const sync = () => {
      const next = formatLocalYmd(getAppDate());
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
