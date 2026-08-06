import { describe, expect, it } from 'vitest';
import {
  computeGapAwareWeeklyAdherence,
  computeLongestSessionGapDays,
  ADHERENCE_NONEMPTY_FLOOR_PERCENT,
  CRITICAL_GAP_THRESHOLD_DAYS,
  GAP_PENALTY_PERCENT,
} from './clinicalAdherence';
import { addClinicalDays } from './clinicalCalendar';

describe('computeLongestSessionGapDays', () => {
  it('returns full window length when no sessions', () => {
    expect(
      computeLongestSessionGapDays({
        windowStart: '2026-07-01',
        windowEnd: '2026-07-10',
        sessionDateSet: new Set(),
      })
    ).toBe(10);
  });

  it('resets gap after a session day', () => {
    expect(
      computeLongestSessionGapDays({
        windowStart: '2026-07-01',
        windowEnd: '2026-07-10',
        sessionDateSet: new Set(['2026-07-03', '2026-07-08']),
      })
    ).toBe(4); // Jul 4–7
  });
});

describe('computeGapAwareWeeklyAdherence', () => {
  const today = '2026-08-06';

  it('caps weekly adherence at 100% when sessions exceed target (no rollover)', () => {
    // Target 3: one week with 5 sessions, three empty weeks → avg 25% before penalty
    const heavyWeekStart = addClinicalDays(today, -6);
    const sessions: string[] = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(addClinicalDays(heavyWeekStart, i));
    }
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: sessions,
      targetWorkoutsPerWeek: 3,
      lookbackDays: 28,
    });
    expect(result.weeklyBuckets).toHaveLength(4);
    const latest = result.weeklyBuckets[result.weeklyBuckets.length - 1];
    expect(latest.sessionDays).toBe(5);
    expect(latest.cappedRate).toBe(1);
    // Empty weeks are 0 — excess from binge week does not inflate them
    expect(result.weeklyBuckets.filter((b) => b.cappedRate === 0).length).toBe(3);
    expect(result.adherenceBeforePenalty).toBe(25);
  });

  it('applies gap penalty but floors nonzero work above absolute 0%', () => {
    // One session at start of lookback, then long silence → critical gap
    const first = addClinicalDays(today, -27);
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: [first],
      targetWorkoutsPerWeek: 3,
      lookbackDays: 28,
    });
    expect(result.longestGapDays).toBeGreaterThan(CRITICAL_GAP_THRESHOLD_DAYS);
    expect(result.hasCriticalGaps).toBe(true);
    expect(result.gapPenaltyApplied).toBe(GAP_PENALTY_PERCENT);
    expect(result.sessionDaysInLookback).toBe(1);
    const rawAfterPenalty = Math.round(
      (result.adherenceBeforePenalty ?? 0) - GAP_PENALTY_PERCENT
    );
    expect(result.adherencePercent).toBe(
      Math.max(ADHERENCE_NONEMPTY_FLOOR_PERCENT, rawAfterPenalty)
    );
    expect(result.adherencePercent).toBeGreaterThanOrEqual(ADHERENCE_NONEMPTY_FLOOR_PERCENT);
    expect(result.adherencePercent).toBeGreaterThan(0);
  });

  it('allows absolute 0% when no sessions were logged in the lookback', () => {
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: [],
      targetWorkoutsPerWeek: 3,
      lookbackDays: 28,
    });
    expect(result.sessionDaysInLookback).toBe(0);
    expect(result.adherencePercent).toBe(0);
  });

  it('floors score when historical sessions exist outside lookback with critical gap', () => {
    const oldSession = addClinicalDays(today, -60);
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: [oldSession],
      targetWorkoutsPerWeek: 3,
      lookbackDays: 28,
    });
    expect(result.sessionDaysInLookback).toBe(0);
    expect(result.hasCriticalGaps).toBe(true);
    expect(result.adherencePercent).toBeGreaterThanOrEqual(ADHERENCE_NONEMPTY_FLOOR_PERCENT);
  });

  it('does not apply gap penalty when gaps stay within threshold', () => {
    // Sessions every 3 days across lookback
    const sessions: string[] = [];
    for (let i = 0; i < 28; i += 3) {
      sessions.push(addClinicalDays(today, -(27 - i)));
    }
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: sessions,
      targetWorkoutsPerWeek: 3,
      lookbackDays: 28,
    });
    expect(result.longestGapDays).toBeLessThanOrEqual(CRITICAL_GAP_THRESHOLD_DAYS);
    expect(result.hasCriticalGaps).toBe(false);
    expect(result.gapPenaltyApplied).toBe(0);
    expect(result.adherencePercent).toBe(result.adherenceBeforePenalty);
  });

  it('clamps invalid targets to 1–7', () => {
    const result = computeGapAwareWeeklyAdherence({
      clinicalToday: today,
      sessionDatesChronological: [today],
      targetWorkoutsPerWeek: 99,
    });
    expect(result.targetWorkoutsPerWeek).toBe(7);
  });
});