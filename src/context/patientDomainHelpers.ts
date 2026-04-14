import type { BodyArea, ExerciseSession, PainLevel, PainRecord, Patient } from '../types';
import { bodyAreaIsClinicalFocus } from '../body/bodyPickMapping';

export type PatientRewardMeta = {
  readArticleIds: string[];
  lastLoginBonusClinicalDate: string | null;
  articleLinkOpenedIds: string[];
  dykRewardClaimedLocalYmd: string | null;
  dykTipOpenedLocalYmd: string | null;
};

export function defaultPatientRewardMeta(): PatientRewardMeta {
  return {
    readArticleIds: [],
    lastLoginBonusClinicalDate: null,
    articleLinkOpenedIds: [],
    dykRewardClaimedLocalYmd: null,
    dykTipOpenedLocalYmd: null,
  };
}

export const NEUTRAL_PRIMARY_BODY_AREA: BodyArea = 'neck';

export function applyTherapistClinicalCycle(p: Patient, area: BodyArea): Patient {
  const sec = [...(p.secondaryClinicalBodyAreas ?? [])];
  if (sec.includes(area)) {
    return { ...p, secondaryClinicalBodyAreas: sec.filter((a) => a !== area) };
  }
  if (p.primaryBodyArea === area) {
    if (area === NEUTRAL_PRIMARY_BODY_AREA) {
      return { ...p, secondaryClinicalBodyAreas: [...sec, area] };
    }
    return {
      ...p,
      primaryBodyArea: NEUTRAL_PRIMARY_BODY_AREA,
      secondaryClinicalBodyAreas: sec.includes(area) ? sec : [...sec, area],
    };
  }
  if (bodyAreaIsClinicalFocus(area, p.primaryBodyArea)) {
    return { ...p, secondaryClinicalBodyAreas: [...sec, area] };
  }
  return {
    ...p,
    primaryBodyArea: area,
    secondaryClinicalBodyAreas: sec.filter((a) => a !== area),
  };
}

export function buildEmptySession(patientId: string, clinicalDate: string) {
  return { patientId, date: clinicalDate, completedIds: [], sessionXp: 0 };
}

export function clampPain(n: number): PainLevel {
  const r = Math.round(Math.min(10, Math.max(0, n)));
  return r as PainLevel;
}

export function clampEffort(n: number): 1 | 2 | 3 | 4 | 5 {
  const r = Math.round(Math.min(5, Math.max(1, n)));
  return r as 1 | 2 | 3 | 4 | 5;
}

export function recomputePatientAnalyticsAggregates(
  painHistory: PainRecord[],
  sessionHistory: ExerciseSession[]
): Pick<Patient['analytics'], 'averageOverallPain' | 'averageDifficulty' | 'totalSessions' | 'painByArea'> {
  const averageOverallPain =
    painHistory.length === 0
      ? 0
      : Math.round((painHistory.reduce((s, r) => s + r.painLevel, 0) / painHistory.length) * 10) /
        10;
  const painByArea: Partial<Record<BodyArea, number>> = {};
  const byArea = new Map<BodyArea, { sum: number; n: number }>();
  for (const r of painHistory) {
    const cur = byArea.get(r.bodyArea) ?? { sum: 0, n: 0 };
    cur.sum += r.painLevel;
    cur.n++;
    byArea.set(r.bodyArea, cur);
  }
  for (const [a, v] of byArea) {
    painByArea[a] = Math.round((v.sum / v.n) * 10) / 10;
  }
  const averageDifficulty =
    sessionHistory.length === 0
      ? 0
      : Math.round(
          (sessionHistory.reduce((s, x) => s + x.difficultyRating, 0) / sessionHistory.length) * 10
        ) / 10;
  return {
    averageOverallPain,
    painByArea,
    averageDifficulty,
    totalSessions: sessionHistory.length,
  };
}

export function devClinicalDayKey(dateIso: string): string {
  return dateIso.slice(0, 10);
}

export function devSliceExerciseIdsForCompleted(planIds: string[], completed: number): string[] {
  if (completed <= 0 || planIds.length === 0) return [];
  const n = Math.min(completed, planIds.length);
  return planIds.slice(0, n);
}
