import type {
  ProtocolTrackingMilestone,
  ProtocolTrackingState,
  ProtocolTrackingWeek,
  TreatmentProtocolWeek,
} from '../types';

function asStringList(v: unknown, max = 32): string[] {
  if (!Array.isArray(v)) {
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return [];
  }
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
    .filter(Boolean)
    .slice(0, max);
}

/** Normalize AI `two_month_protocol` (array or text) → structured weeks (any length). */
export function parseTreatmentProtocolFromAi(raw: unknown): TreatmentProtocolWeek[] {
  if (typeof raw === 'string' && raw.trim()) {
    const text = raw.trim();
    const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    if (blocks.length <= 1) {
      const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length === 0) return [];
      return [{ weekNumber: 1, title: 'פרוטוקול טיפול', milestones: lines }];
    }
    return blocks.map((block, idx) => {
      const lines = block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const title = lines[0] ?? `שבוע ${idx + 1}`;
      const milestones = lines.length > 1 ? lines.slice(1) : lines;
      return { weekNumber: idx + 1, title, milestones };
    });
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, idx) => {
      if (typeof item === 'string') {
        const t = item.trim();
        return t
          ? { weekNumber: idx + 1, title: `שבוע ${idx + 1}`, milestones: [t] }
          : null;
      }
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const weekNumber =
        typeof o.week === 'number' && Number.isFinite(o.week)
          ? o.week
          : typeof o.weekNumber === 'number' && Number.isFinite(o.weekNumber)
            ? o.weekNumber
            : idx + 1;
      const title =
        (typeof o.title === 'string' && o.title.trim()) ||
        (typeof o.focus === 'string' && o.focus.trim()) ||
        `שבוע ${weekNumber}`;
      const milestones = asStringList(o.milestones ?? o.steps ?? o.items);
      if (milestones.length === 0 && !title) return null;
      return { weekNumber, title, milestones };
    })
    .filter((w): w is TreatmentProtocolWeek => w != null);
}

export function normalizeProtocolWeeksForDisplay(
  protocol: TreatmentProtocolWeek[] | string | undefined
): TreatmentProtocolWeek[] {
  if (!protocol) return [];
  if (typeof protocol === 'string') return parseTreatmentProtocolFromAi(protocol);
  return protocol;
}

function milestoneId(weekNumber: number, index: number): string {
  return `w${weekNumber}-m${index}`;
}

/** Build unchecked tracking state for however many weeks the protocol contains. */
export function buildInitialTrackingState(protocol: TreatmentProtocolWeek[]): ProtocolTrackingState {
  return protocol.map(
    (week): ProtocolTrackingWeek => ({
      weekNumber: week.weekNumber,
      milestones: week.milestones.map(
        (label, index): ProtocolTrackingMilestone => ({
          id: milestoneId(week.weekNumber, index),
          label,
          completed: false,
        })
      ),
    })
  );
}

/**
 * Preserve completion by weekNumber + milestone index only (never label text).
 * Falls back to positional week index when weekNumber is absent in prior state.
 */
export function syncTrackingStateWithProtocol(
  existing: ProtocolTrackingState,
  protocol: TreatmentProtocolWeek[]
): ProtocolTrackingState {
  return protocol.map((week, weekIdx) => {
    const prevWeek =
      existing.find((w) => w.weekNumber === week.weekNumber) ?? existing[weekIdx];
    const prevMilestones = prevWeek?.milestones ?? [];

    return {
      weekNumber: week.weekNumber,
      milestones: week.milestones.map((label, milestoneIdx) => {
        const prev = prevMilestones[milestoneIdx];
        const completed = prev?.completed ?? false;
        return {
          id: prev?.id ?? milestoneId(week.weekNumber, milestoneIdx),
          label,
          completed,
          ...(completed && prev?.completedAt ? { completedAt: prev.completedAt } : {}),
        };
      }),
    };
  });
}

export function resolveProtocolTrackingState(
  protocol: TreatmentProtocolWeek[] | string | undefined,
  existing?: ProtocolTrackingState
): ProtocolTrackingState {
  const weeks = normalizeProtocolWeeksForDisplay(protocol);
  if (weeks.length === 0) return existing ?? [];
  if (!existing?.length) return buildInitialTrackingState(weeks);
  return syncTrackingStateWithProtocol(existing, weeks);
}
