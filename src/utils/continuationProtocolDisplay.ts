import type { TreatmentProtocolWeek } from '../types';
import { normalizeProtocolWeeksForDisplay } from './protocolTrackingState';

export function formatContinuationProtocol(
  protocol: TreatmentProtocolWeek[] | string | undefined
): string {
  if (!protocol) return '';
  if (typeof protocol === 'string') return protocol.trim();
  const weeks = normalizeProtocolWeeksForDisplay(protocol);
  if (weeks.length === 0) return '';
  return weeks
    .map((week) => {
      const header = week.title?.trim() || `שבוע ${week.weekNumber}`;
      const milestones = week.milestones.filter(Boolean);
      if (milestones.length === 0) return header;
      return `${header}\n${milestones.map((m) => `• ${m}`).join('\n')}`;
    })
    .join('\n\n');
}
