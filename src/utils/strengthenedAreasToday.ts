import type { BodyArea, PatientExerciseFinishReport } from '../types';
import { bodyAreaLabels } from '../types';
import { getAppDate } from './debugMockDate';

const labelToArea = new Map<string, BodyArea>(
  (Object.keys(bodyAreaLabels) as BodyArea[]).map((a) => [bodyAreaLabels[a], a])
);

/** Map Hebrew zone label from finish reports to `BodyArea`. */
export function zoneLabelToBodyArea(zone: string | undefined): BodyArea | undefined {
  if (!zone) return undefined;
  return labelToArea.get(zone.trim());
}

function isSameLocalCalendarDay(isoTimestamp: string, now: Date): boolean {
  const d = new Date(isoTimestamp);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Body areas that have at least one exercise finish report today (local date),
 * using `zone` / legacy `zoneName` matched to {@link bodyAreaLabels}.
 */
export function getStrengthenedBodyAreasToday(
  reports: PatientExerciseFinishReport[],
  now: Date = getAppDate()
): BodyArea[] {
  const set = new Set<BodyArea>();
  for (const r of reports) {
    if (!isSameLocalCalendarDay(r.timestamp, now)) continue;
    const z = r.zone ?? r.zoneName;
    const area = zoneLabelToBodyArea(z);
    if (area) set.add(area);
  }
  return [...set];
}
