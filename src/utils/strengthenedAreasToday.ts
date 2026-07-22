import type { BodyArea, PatientExerciseFinishReport } from '../types';
import { bodyAreaLabels } from '../types';
import { getAppDate } from './debugMockDate';

/**
 * Hebrew zone labels that map to more than one BodyArea key.
 * `bodyAreaLabels` intentionally shares copy for anterior/posterior torso pairs.
 */
const ZONE_LABEL_AREA_GROUPS: BodyArea[][] = [
  ['chest', 'back_upper'],
  ['abdomen', 'back_lower'],
];

const labelToAreas = new Map<string, BodyArea[]>();
for (const area of Object.keys(bodyAreaLabels) as BodyArea[]) {
  const label = bodyAreaLabels[area];
  const list = labelToAreas.get(label) ?? [];
  list.push(area);
  labelToAreas.set(label, list);
}

/** Map Hebrew zone label from finish reports to a primary `BodyArea` (first match). */
export function zoneLabelToBodyArea(zone: string | undefined): BodyArea | undefined {
  if (!zone) return undefined;
  const areas = labelToAreas.get(zone.trim());
  return areas?.[0];
}

/** All BodyArea keys that share a given Hebrew zone label. */
export function zoneLabelToBodyAreas(zone: string | undefined): BodyArea[] {
  if (!zone) return [];
  return labelToAreas.get(zone.trim()) ?? [];
}

/** True when two areas are the same or share a torso zone alias group. */
export function bodyAreasShareActiveZone(a: BodyArea, b: BodyArea): boolean {
  if (a === b) return true;
  return ZONE_LABEL_AREA_GROUPS.some((group) => group.includes(a) && group.includes(b));
}

/**
 * Whether a finish report belongs to the patient's active clinical area.
 * Handles duplicate Hebrew labels (chest↔back_upper, abdomen↔back_lower).
 * Reports without a zone are included (legacy rows).
 */
export function reportMatchesActiveArea(
  report: PatientExerciseFinishReport,
  primary: BodyArea
): boolean {
  const zone = report.zone ?? report.zoneName;
  if (!zone?.trim()) return true;
  const candidates = zoneLabelToBodyAreas(zone);
  if (candidates.length === 0) return true;
  return candidates.some((area) => bodyAreasShareActiveZone(area, primary));
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
    for (const area of zoneLabelToBodyAreas(z)) {
      set.add(area);
    }
  }
  return [...set];
}
