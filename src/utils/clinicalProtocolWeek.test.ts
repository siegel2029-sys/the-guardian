import { describe, expect, it } from 'vitest';
import {
  computeClinicalProtocolContext,
  computeCurrentProtocolWeek,
  computeEffectiveProtocolWeek,
  PROTOCOL_FREEZE_ADHERENCE_THRESHOLD,
} from './clinicalProtocolWeek';
import { addClinicalDays } from './clinicalCalendar';

const protocol = [
  { weekNumber: 1, title: 'שבוע 1', milestones: ['a'] },
  { weekNumber: 2, title: 'שבוע 2', milestones: ['b'] },
  { weekNumber: 3, title: 'שבוע 3', milestones: ['c'] },
  { weekNumber: 4, title: 'שבוע 4', milestones: ['d'] },
  { weekNumber: 5, title: 'שבוע 5', milestones: ['e'] },
  { weekNumber: 6, title: 'שבוע 6', milestones: ['f'] },
  { weekNumber: 7, title: 'שבוע 7', milestones: ['g'] },
  { weekNumber: 8, title: 'שבוע 8', milestones: ['h'] },
];

describe('computeEffectiveProtocolWeek', () => {
  const start = '2026-06-01';
  const today = '2026-08-06'; // ~9+ weeks later chronologically

  it('uses chronological week when adherence is healthy and no critical gap', () => {
    const result = computeEffectiveProtocolWeek({
      protocolStartDate: start,
      clinicalToday: today,
      totalWeeks: 8,
      sessionDatesChronological: [
        addClinicalDays(today, -2),
        addClinicalDays(today, -5),
        addClinicalDays(today, -8),
      ],
      adherencePercent: 80,
      hasCriticalGaps: false,
    });
    expect(result.frozen).toBe(false);
    expect(result.effectiveWeek).toBe(result.chronologicalWeek);
    expect(result.chronologicalWeek).toBe(8);
  });

  it('freezes at last-activity week when critical gap leaves calendar ahead', () => {
    const lastSession = addClinicalDays(start, 10); // still early in protocol
    const result = computeEffectiveProtocolWeek({
      protocolStartDate: start,
      clinicalToday: today,
      totalWeeks: 8,
      sessionDatesChronological: [lastSession],
      adherencePercent: 5,
      hasCriticalGaps: true,
    });
    expect(result.chronologicalWeek).toBe(8);
    expect(result.effectiveWeek).toBeLessThan(result.chronologicalWeek!);
    expect(result.frozen).toBe(true);
    expect(result.freezeReason).toBe('critical_gap');
  });

  it('freezes on low adherence even without critical-gap flag', () => {
    const lastSession = addClinicalDays(start, 14);
    const result = computeEffectiveProtocolWeek({
      protocolStartDate: start,
      clinicalToday: today,
      totalWeeks: 8,
      sessionDatesChronological: [lastSession],
      adherencePercent: PROTOCOL_FREEZE_ADHERENCE_THRESHOLD - 1,
      hasCriticalGaps: false,
    });
    expect(result.frozen).toBe(true);
    expect(result.freezeReason).toBe('low_adherence');
    expect(result.effectiveWeek).toBeLessThan(result.chronologicalWeek!);
  });

  it('does not show freeze when effective week equals chronological (week 1, no sessions)', () => {
    const result = computeEffectiveProtocolWeek({
      protocolStartDate: today,
      clinicalToday: today,
      totalWeeks: 8,
      sessionDatesChronological: [],
      adherencePercent: 0,
      hasCriticalGaps: true,
    });
    expect(result.chronologicalWeek).toBe(1);
    expect(result.effectiveWeek).toBe(1);
    expect(result.frozen).toBe(false);
  });

  it('freezes past week 1 when last session is older than critical gap threshold', () => {
    const lastSession = addClinicalDays(today, -20);
    const result = computeEffectiveProtocolWeek({
      protocolStartDate: start,
      clinicalToday: today,
      totalWeeks: 8,
      sessionDatesChronological: [lastSession],
      adherencePercent: 10,
      hasCriticalGaps: true,
    });
    expect(result.frozen).toBe(true);
    expect(result.effectiveWeek).toBe(
      computeCurrentProtocolWeek(start, lastSession, 8)
    );
    expect(result.effectiveWeek).toBeLessThan(result.chronologicalWeek!);
  });
});

describe('computeClinicalProtocolContext', () => {
  it('returns frozen context with Hebrew-resolvable week after long gap', () => {
    const start = '2026-06-01';
    const today = '2026-08-06';
    const ctx = computeClinicalProtocolContext({
      protocolStartDate: start,
      clinicalToday: today,
      treatmentProtocol: protocol,
      sessionDatesChronological: [addClinicalDays(start, 7)],
      adherencePercent: 5,
      hasCriticalGaps: true,
    });
    expect(ctx.protocolProgressionFrozen).toBe(true);
    expect(ctx.currentProtocolWeek).toBeLessThan(ctx.chronologicalProtocolWeek!);
    expect(ctx.currentProtocolName).toBeTruthy();
  });
});
