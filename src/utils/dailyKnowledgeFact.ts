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
 * Fingerprints catalog id order — when the KB set stays the same but the calendar advances,
 * the daily index mixes day + catalog so neighboring days rarely stick to only adjacent facts.
 */
function catalogFingerprint(sortedIds: string[]): number {
  let h = 2166136261;
  const joined = sortedIds.join('\x1e');
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One approved fact per calendar day: stable for all users on that local date (not random per visit).
 * With multiple facts, cycles through the catalog in a well-mixed order as the date changes.
 */
export function selectDailyApprovedKnowledgeFact(
  approvedFacts: KnowledgeFact[],
  calendarDayYmd: string
): KnowledgeFact | null {
  if (approvedFacts.length === 0) return null;
  const sorted = [...approvedFacts].sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.length === 1) return sorted[0];

  const dayOfYear = getLocalDayOfYearForYmd(calendarDayYmd);
  const fp = catalogFingerprint(sorted.map((f) => f.id));

  let h = 2166136261;
  for (let i = 0; i < calendarDayYmd.length; i++) {
    h ^= calendarDayYmd.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const dayHash = h >>> 0;

  const index = (dayHash + dayOfYear * 1103515245 + fp) % sorted.length;
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
