import { describe, expect, it } from 'vitest';
import {
  isAiLedPlanReviewAllowed,
  normalizePatientSubscriptionTier,
  resolvePatientSubscriptionTier,
} from './patientSubscriptionTier';

describe('patientSubscriptionTier', () => {
  it('defaults unknown values to premium', () => {
    expect(normalizePatientSubscriptionTier(undefined)).toBe('premium');
    expect(normalizePatientSubscriptionTier(null)).toBe('premium');
    expect(normalizePatientSubscriptionTier('Premium')).toBe('premium');
    expect(normalizePatientSubscriptionTier('other')).toBe('premium');
  });

  it('accepts generic case-insensitively', () => {
    expect(normalizePatientSubscriptionTier('generic')).toBe('generic');
    expect(normalizePatientSubscriptionTier('GENERIC')).toBe('generic');
  });

  it('gates AI-led plan review to generic only', () => {
    expect(isAiLedPlanReviewAllowed('generic')).toBe(true);
    expect(isAiLedPlanReviewAllowed('premium')).toBe(false);
    expect(isAiLedPlanReviewAllowed(undefined)).toBe(false);
  });

  it('resolves from Patient-like objects', () => {
    expect(resolvePatientSubscriptionTier({ subscriptionTier: 'generic' })).toBe('generic');
    expect(resolvePatientSubscriptionTier({})).toBe('premium');
    expect(resolvePatientSubscriptionTier(null)).toBe('premium');
  });
});
