import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  allRedFlagsAnswered,
  buildQuestionnaireData,
  clinicalProfileSchema,
  convertOnboardingLead,
  DURATION_OPTIONS,
  EMPTY_RED_FLAG_ANSWERS,
  hasAnyRedFlag,
  HIGH_PAIN_THRESHOLD,
  isGenericPlanBlocked,
  leadContactSchema,
  allowChatForOnboardingLeadStatus,
  subscriptionTierForOnboardingLeadStatus,
  leadImpliesUnassistedPlan,
  normalizeIsraeliPhone,
  portalUsernameFromLeadId,
  saveOnboardingLead,
  updateLeadStatus,
  updateOnboardingLeadStatus,
  type ClinicalProfile,
  type RedFlagAnswers,
} from './onboardingLeadService';

const validClinical: ClinicalProfile = {
  painLocation: 'גב תחתון',
  painLevel: 5,
  aggravatingEasing: 'ישיבה מחמירה, הליכה מקלה',
  duration: DURATION_OPTIONS[2],
  hardestActivities: 'לגרוב גרביים, לשבת שעה',
  movementFear: 3,
  rehabGoal: 'לחזור לרוץ',
};

const allNo: RedFlagAnswers = {
  trauma: false,
  caudaEquina: false,
  systemic: false,
  motorWeakness: false,
  nightPain: false,
};

describe('red-flag hard-stop logic', () => {
  it('flags when any single answer is yes', () => {
    expect(hasAnyRedFlag({ ...allNo, caudaEquina: true })).toBe(true);
    expect(hasAnyRedFlag({ ...allNo, nightPain: true })).toBe(true);
  });

  it('does not flag when all answers are no', () => {
    expect(hasAnyRedFlag(allNo)).toBe(false);
  });

  it('does not flag unanswered (null) questions', () => {
    expect(hasAnyRedFlag(EMPTY_RED_FLAG_ANSWERS)).toBe(false);
  });

  it('requires every question to be explicitly answered', () => {
    expect(allRedFlagsAnswered(EMPTY_RED_FLAG_ANSWERS)).toBe(false);
    expect(allRedFlagsAnswered({ ...allNo, trauma: null })).toBe(false);
    expect(allRedFlagsAnswered(allNo)).toBe(true);
    expect(allRedFlagsAnswered({ ...allNo, trauma: true })).toBe(true);
  });
});

describe('clinicalProfileSchema', () => {
  it('accepts a fully-filled profile', () => {
    expect(clinicalProfileSchema.safeParse(validClinical).success).toBe(true);
  });

  it('rejects empty or whitespace-only text fields', () => {
    for (const field of ['painLocation', 'aggravatingEasing', 'hardestActivities', 'rehabGoal'] as const) {
      expect(clinicalProfileSchema.safeParse({ ...validClinical, [field]: '' }).success).toBe(false);
      expect(clinicalProfileSchema.safeParse({ ...validClinical, [field]: '   ' }).success).toBe(false);
    }
  });

  it('rejects unset (null) scale values', () => {
    expect(clinicalProfileSchema.safeParse({ ...validClinical, painLevel: null }).success).toBe(false);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, movementFear: null }).success).toBe(false);
  });

  it('enforces pain 0-10 and fear 1-5 bounds', () => {
    expect(clinicalProfileSchema.safeParse({ ...validClinical, painLevel: 0 }).success).toBe(true);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, painLevel: 10 }).success).toBe(true);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, painLevel: 11 }).success).toBe(false);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, painLevel: -1 }).success).toBe(false);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, movementFear: 1 }).success).toBe(true);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, movementFear: 5 }).success).toBe(true);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, movementFear: 0 }).success).toBe(false);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, movementFear: 6 }).success).toBe(false);
  });

  it('rejects a duration outside the fixed Hebrew options', () => {
    expect(clinicalProfileSchema.safeParse({ ...validClinical, duration: '' }).success).toBe(false);
    expect(clinicalProfileSchema.safeParse({ ...validClinical, duration: 'שנה' }).success).toBe(false);
  });
});

describe('leadContactSchema', () => {
  const validContact = { fullName: 'ישראל ישראלי', phone: '050-1234567', email: 'a@b.co.il' };

  it('accepts valid contact details', () => {
    expect(leadContactSchema.safeParse(validContact).success).toBe(true);
  });

  it('accepts common Israeli phone formats', () => {
    for (const phone of ['0501234567', '050-123-4567', '+972501234567', '972501234567', '02-6123456', '077 123 4567']) {
      expect(leadContactSchema.safeParse({ ...validContact, phone }).success).toBe(true);
    }
  });

  it('rejects invalid phones', () => {
    for (const phone of ['', '12345', '05012345', '1501234567', 'abc']) {
      expect(leadContactSchema.safeParse({ ...validContact, phone }).success).toBe(false);
    }
  });

  it('rejects empty name and malformed email', () => {
    expect(leadContactSchema.safeParse({ ...validContact, fullName: '' }).success).toBe(false);
    expect(leadContactSchema.safeParse({ ...validContact, fullName: 'א' }).success).toBe(false);
    expect(leadContactSchema.safeParse({ ...validContact, email: 'not-an-email' }).success).toBe(false);
    expect(leadContactSchema.safeParse({ ...validContact, email: '' }).success).toBe(false);
  });
});

describe('normalizeIsraeliPhone', () => {
  it('strips separators and converts +972 to leading 0', () => {
    expect(normalizeIsraeliPhone('050-123 4567')).toBe('0501234567');
    expect(normalizeIsraeliPhone('+972-50-1234567')).toBe('0501234567');
    expect(normalizeIsraeliPhone('972501234567')).toBe('0501234567');
    expect(normalizeIsraeliPhone('(02) 612.3456')).toBe('026123456');
  });
});

describe('high-pain plan gating', () => {
  it('blocks the generic plan exactly at the threshold and above', () => {
    expect(HIGH_PAIN_THRESHOLD).toBe(8);
    expect(isGenericPlanBlocked(7)).toBe(false);
    expect(isGenericPlanBlocked(8)).toBe(true);
    expect(isGenericPlanBlocked(10)).toBe(true);
  });

  it('does not block for low or unset pain', () => {
    expect(isGenericPlanBlocked(0)).toBe(false);
    expect(isGenericPlanBlocked(null)).toBe(false);
  });
});

describe('buildQuestionnaireData', () => {
  it('produces snake_case JSONB payload with all answers', () => {
    const payload = buildQuestionnaireData(allNo, validClinical);
    expect(payload).toEqual({
      version: 1,
      red_flags: allNo,
      clinical: {
        pain_location: 'גב תחתון',
        pain_level: 5,
        aggravating_easing: 'ישיבה מחמירה, הליכה מקלה',
        duration: DURATION_OPTIONS[2],
        hardest_activities: 'לגרוב גרביים, לשבת שעה',
        movement_fear: 3,
        rehab_goal: 'לחזור לרוץ',
      },
    });
  });

  it('includes legal consent and truthfulness declaration when provided', () => {
    const payload = buildQuestionnaireData(allNo, validClinical, {
      termsAccepted: true,
      privacyAccepted: true,
      medicalDisclaimerAccepted: true,
      answersTruthful: true,
      declarationText:
        'אני מאשר/ת את תנאי השימוש, מדיניות הפרטיות וההצהרה הרפואית, ומצהיר/ה כי כל הפרטים והתשובות שמסרתי בשאלון זה הינם נכונים, מדויקים ומלאים.',
      acceptedAt: '2026-08-05T12:00:00.000Z',
    });
    expect(payload.legal).toEqual({
      terms_accepted: true,
      privacy_accepted: true,
      medical_disclaimer_accepted: true,
      answers_truthful: true,
      declaration_text:
        'אני מאשר/ת את תנאי השימוש, מדיניות הפרטיות וההצהרה הרפואית, ומצהיר/ה כי כל הפרטים והתשובות שמסרתי בשאלון זה הינם נכונים, מדויקים ומלאים.',
      accepted_at: '2026-08-05T12:00:00.000Z',
    });
  });
});

describe('lead care-track helpers', () => {
  it('treats only Paybox as the unassisted checkout track', () => {
    expect(leadImpliesUnassistedPlan('pending_paybox')).toBe(true);
    expect(leadImpliesUnassistedPlan('abandoned')).toBe(false);
    expect(leadImpliesUnassistedPlan('pending_zoom')).toBe(false);
    expect(leadImpliesUnassistedPlan('converted')).toBe(false);
  });

  it('maps lead status to allowChat for convert', () => {
    expect(allowChatForOnboardingLeadStatus('pending_paybox')).toBe(false);
    expect(allowChatForOnboardingLeadStatus('pending_zoom')).toBe(true);
    expect(allowChatForOnboardingLeadStatus('abandoned')).toBe(true);
    expect(allowChatForOnboardingLeadStatus('converted')).toBe(true);
  });

  it('maps lead status to subscriptionTier for convert', () => {
    expect(subscriptionTierForOnboardingLeadStatus('pending_paybox')).toBe('generic');
    expect(subscriptionTierForOnboardingLeadStatus('pending_zoom')).toBe('premium');
    expect(subscriptionTierForOnboardingLeadStatus('abandoned')).toBe('premium');
    expect(subscriptionTierForOnboardingLeadStatus('converted')).toBe('premium');
  });

  it('builds a valid-length portal username from a lead uuid', () => {
    const username = portalUsernameFromLeadId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(username.startsWith('L')).toBe(true);
    expect(username.length).toBeGreaterThanOrEqual(2);
    expect(username.length).toBeLessThanOrEqual(32);
    expect(/^[A-Z0-9]+$/.test(username)).toBe(true);
  });
});

function mockClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('saveOnboardingLead', () => {
  const input = {
    leadId: null,
    contact: { fullName: 'ישראל ישראלי', phone: '+972-50-1234567', email: 'a@b.co.il' },
    painLevel: 6,
    questionnaire: { version: 1 },
  };

  it('inserts via RPC with normalized phone and abandoned status, returning the lead id', async () => {
    const { client, rpc } = mockClient({ data: 'lead-uuid-1', error: null });
    const result = await saveOnboardingLead(input, client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('lead-uuid-1');
    expect(rpc).toHaveBeenCalledWith('save_onboarding_lead', {
      p_lead_id: null,
      p_full_name: 'ישראל ישראלי',
      p_phone: '0501234567',
      p_email: 'a@b.co.il',
      p_pain_level: 6,
      p_status: 'abandoned',
      p_questionnaire: { version: 1 },
    });
  });

  it('returns a generic Hebrew failure when the RPC errors', async () => {
    const { client } = mockClient({ data: null, error: { message: 'boom' } });
    const result = await saveOnboardingLead(input, client);
    expect(result.ok).toBe(false);
  });

  it('fails gracefully when Supabase is not configured', async () => {
    const result = await saveOnboardingLead(input, null);
    expect(result.ok).toBe(false);
  });
});

describe('updateOnboardingLeadStatus', () => {
  it('sends only the lead id and pending status', async () => {
    const { client, rpc } = mockClient({ data: 'lead-uuid-1', error: null });
    const result = await updateOnboardingLeadStatus('lead-uuid-1', 'pending_paybox', client);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('save_onboarding_lead', {
      p_lead_id: 'lead-uuid-1',
      p_full_name: null,
      p_phone: null,
      p_email: null,
      p_pain_level: null,
      p_status: 'pending_paybox',
      p_questionnaire: null,
    });
  });

  it('supports the zoom track', async () => {
    const { client, rpc } = mockClient({ data: 'lead-uuid-1', error: null });
    await updateOnboardingLeadStatus('lead-uuid-1', 'pending_zoom', client);
    expect(rpc).toHaveBeenCalledWith(
      'save_onboarding_lead',
      expect.objectContaining({ p_status: 'pending_zoom' })
    );
  });

  it('fails when the RPC reports an error', async () => {
    const { client } = mockClient({ data: null, error: { message: 'lead_not_found' } });
    const result = await updateOnboardingLeadStatus('missing', 'pending_zoom', client);
    expect(result.ok).toBe(false);
  });
});

describe('convertOnboardingLead / updateLeadStatus', () => {
  function mockUpdateClient(result: {
    data: { id: string } | null;
    error: { message: string } | null;
  }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const select = vi.fn(() => ({ maybeSingle }));
    const neq = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ neq }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const rpc = vi.fn();
    return {
      client: { from, rpc } as unknown as SupabaseClient,
      from,
      update,
      rpc,
    };
  }

  it('marks a lead converted via direct table UPDATE (not the public RPC)', async () => {
    const { client, update, rpc } = mockUpdateClient({
      data: { id: 'lead-uuid-1' },
      error: null,
    });
    const result = await convertOnboardingLead('lead-uuid-1', client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('lead-uuid-1');
    expect(update).toHaveBeenCalledWith({ status: 'converted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('routes updateLeadStatus(converted) to the therapist UPDATE path', async () => {
    const { client, update } = mockUpdateClient({
      data: { id: 'lead-uuid-1' },
      error: null,
    });
    const result = await updateLeadStatus('lead-uuid-1', 'converted', client);
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ status: 'converted' });
  });

  it('routes updateLeadStatus(pending_*) to the public RPC', async () => {
    const { client, rpc } = mockClient({ data: 'lead-uuid-1', error: null });
    const result = await updateLeadStatus('lead-uuid-1', 'pending_paybox', client);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'save_onboarding_lead',
      expect.objectContaining({ p_status: 'pending_paybox' })
    );
  });
});
