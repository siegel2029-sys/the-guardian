import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_RED_FLAG_ANSWERS,
  RED_FLAG_IDS,
  type RedFlagAnswers,
  type RedFlagId,
} from '../services/onboardingLeadService';

/**
 * Wizard state for the /join self-service funnel, persisted to sessionStorage on
 * every change so mobile users survive a refresh mid-flow. sessionStorage (not
 * localStorage) keeps contact details from lingering on shared devices; storage
 * is cleared on completion and on a red-flag hard stop.
 */

export const ONBOARDING_WIZARD_STORAGE_KEY = 'physioshield-onboarding-wizard-v1';

export type OnboardingStep = 'redFlags' | 'clinical' | 'contact' | 'disclaimer' | 'plans';

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'redFlags',
  'clinical',
  'contact',
  'disclaimer',
  'plans',
];

export type ClinicalDraft = {
  painLocation: string;
  painLevel: number | null;
  aggravatingEasing: string;
  duration: string;
  hardestActivities: string;
  movementFear: number | null;
  rehabGoal: string;
};

export type ContactDraft = {
  fullName: string;
  phone: string;
  email: string;
};

export type ChosenPlan = 'paybox' | 'zoom';

export type OnboardingWizardState = {
  step: OnboardingStep;
  redFlags: RedFlagAnswers;
  clinical: ClinicalDraft;
  contact: ContactDraft;
  disclaimerAccepted: boolean;
  leadId: string | null;
  hardStopped: boolean;
  chosenPlan: ChosenPlan | null;
  completed: boolean;
};

export const INITIAL_WIZARD_STATE: OnboardingWizardState = {
  step: 'redFlags',
  redFlags: { ...EMPTY_RED_FLAG_ANSWERS },
  clinical: {
    painLocation: '',
    painLevel: null,
    aggravatingEasing: '',
    duration: '',
    hardestActivities: '',
    movementFear: null,
    rehabGoal: '',
  },
  contact: { fullName: '', phone: '', email: '' },
  disclaimerAccepted: false,
  leadId: null,
  hardStopped: false,
  chosenPlan: null,
  completed: false,
};

function isValidStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEP_ORDER as string[]).includes(value);
}

/** Defensive rehydration — malformed/legacy payloads fall back to a fresh wizard. */
export function parsePersistedWizardState(raw: string | null): OnboardingWizardState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingWizardState> | null;
    if (!parsed || typeof parsed !== 'object' || !isValidStep(parsed.step)) return null;
    // A hard-stopped or completed session never resumes.
    if (parsed.hardStopped === true || parsed.completed === true) return null;

    const redFlags: RedFlagAnswers = { ...EMPTY_RED_FLAG_ANSWERS };
    if (parsed.redFlags && typeof parsed.redFlags === 'object') {
      for (const id of RED_FLAG_IDS) {
        const answer = (parsed.redFlags as Record<RedFlagId, unknown>)[id];
        if (typeof answer === 'boolean') redFlags[id] = answer;
      }
    }

    const clinicalSource = (parsed.clinical ?? {}) as Partial<Record<keyof ClinicalDraft, unknown>>;
    const contactSource = (parsed.contact ?? {}) as Partial<Record<keyof ContactDraft, unknown>>;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const intOrNull = (v: unknown): number | null =>
      typeof v === 'number' && Number.isInteger(v) ? v : null;

    return {
      step: parsed.step,
      redFlags,
      clinical: {
        painLocation: str(clinicalSource.painLocation),
        painLevel: intOrNull(clinicalSource.painLevel),
        aggravatingEasing: str(clinicalSource.aggravatingEasing),
        duration: str(clinicalSource.duration),
        hardestActivities: str(clinicalSource.hardestActivities),
        movementFear: intOrNull(clinicalSource.movementFear),
        rehabGoal: str(clinicalSource.rehabGoal),
      },
      contact: {
        fullName: str(contactSource.fullName),
        phone: str(contactSource.phone),
        email: str(contactSource.email),
      },
      disclaimerAccepted: parsed.disclaimerAccepted === true,
      leadId: typeof parsed.leadId === 'string' && parsed.leadId ? parsed.leadId : null,
      hardStopped: false,
      chosenPlan:
        parsed.chosenPlan === 'paybox' || parsed.chosenPlan === 'zoom'
          ? parsed.chosenPlan
          : null,
      completed: false,
    };
  } catch {
    return null;
  }
}

function readPersistedState(): OnboardingWizardState {
  try {
    return (
      parsePersistedWizardState(sessionStorage.getItem(ONBOARDING_WIZARD_STORAGE_KEY)) ??
      INITIAL_WIZARD_STATE
    );
  } catch {
    return INITIAL_WIZARD_STATE;
  }
}

function clearPersistedState(): void {
  try {
    sessionStorage.removeItem(ONBOARDING_WIZARD_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode / quota) — in-memory state still works.
  }
}

export function useOnboardingWizard() {
  const [state, setState] = useState<OnboardingWizardState>(readPersistedState);

  useEffect(() => {
    // Hard-stopped / completed sessions must not persist contact or clinical data.
    if (state.hardStopped || state.completed) {
      clearPersistedState();
      return;
    }
    try {
      sessionStorage.setItem(ONBOARDING_WIZARD_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Non-fatal: the wizard keeps working in memory.
    }
  }, [state]);

  const patch = useCallback((partial: Partial<OnboardingWizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setStep = useCallback((step: OnboardingStep) => patch({ step }), [patch]);

  const setRedFlagAnswer = useCallback((id: RedFlagId, answer: boolean) => {
    setState((prev) => ({ ...prev, redFlags: { ...prev.redFlags, [id]: answer } }));
  }, []);

  const updateClinical = useCallback((partial: Partial<ClinicalDraft>) => {
    setState((prev) => ({ ...prev, clinical: { ...prev.clinical, ...partial } }));
  }, []);

  const updateContact = useCallback((partial: Partial<ContactDraft>) => {
    setState((prev) => ({ ...prev, contact: { ...prev.contact, ...partial } }));
  }, []);

  const setDisclaimerAccepted = useCallback(
    (accepted: boolean) => patch({ disclaimerAccepted: accepted }),
    [patch]
  );

  const setLeadId = useCallback((leadId: string) => patch({ leadId }), [patch]);

  /** Red-flag hard stop: block the flow and purge persisted answers immediately. */
  const triggerHardStop = useCallback(() => {
    clearPersistedState();
    setState((prev) => ({ ...prev, hardStopped: true }));
  }, []);

  /** Successful checkout-intent handoff: remember the plan and purge storage. */
  const completeWizard = useCallback((plan: ChosenPlan) => {
    clearPersistedState();
    setState((prev) => ({ ...prev, chosenPlan: plan, completed: true }));
  }, []);

  const resetWizard = useCallback(() => {
    clearPersistedState();
    setState({
      ...INITIAL_WIZARD_STATE,
      redFlags: { ...EMPTY_RED_FLAG_ANSWERS },
      clinical: { ...INITIAL_WIZARD_STATE.clinical },
      contact: { ...INITIAL_WIZARD_STATE.contact },
    });
  }, []);

  return {
    state,
    setStep,
    setRedFlagAnswer,
    updateClinical,
    updateContact,
    setDisclaimerAccepted,
    setLeadId,
    triggerHardStop,
    completeWizard,
    resetWizard,
  };
}
