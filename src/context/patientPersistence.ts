import type {
  Patient,
  Message,
  ExercisePlan,
  DailySession,
  AiSuggestion,
  SafetyAlert,
} from '../types';

export const PATIENT_STATE_STORAGE_KEY = 'guardian-patient-state-v1';

export type PersistedPatientStateV1 = {
  version: 1;
  patients: Patient[];
  messages: Message[];
  exercisePlans: ExercisePlan[];
  dailySessions: DailySession[];
  aiSuggestions: AiSuggestion[];
  selectedPatientId: string;
  safetyAlerts: SafetyAlert[];
  exerciseSafetyLockedPatientIds: Record<string, boolean>;
};

export function loadPersistedPatientState(): PersistedPatientStateV1 | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PATIENT_STATE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPatientStateV1;
    if (data?.version !== 1 || !Array.isArray(data.patients)) return null;
    return data;
  } catch {
    return null;
  }
}

export function savePersistedPatientState(state: PersistedPatientStateV1): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PATIENT_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}
