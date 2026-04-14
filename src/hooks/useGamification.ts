import { useCallback, useRef, useState } from 'react';
import type { KnowledgeFact } from '../types';
import { PATIENT_REWARDS } from '../config/patientRewards';
import {
  GEAR_BY_ID,
  isGearItemId,
  type GearEquipSlot,
} from '../config/gearCatalog';
import { applyXpCoinsLevelUp } from '../utils/gamification-utils';
import {
  getMuscleEvolutionStage,
  type MuscleEvolutionStage,
} from '../body/anatomicalEvolution';
import { getClinicalDate } from '../utils/clinicalCalendar';
import { supabase } from '../lib/supabase';
import { fetchAppKnowledgeBaseFromSupabase } from '../services/gamificationService';
import {
  KNOWLEDGE_TEASER_MAX_CHARS,
  normalizeKnowledgeFactsList,
} from '../utils/knowledgeFactNormalize';
import type { Patient } from '../types';
import {
  defaultPatientGear,
  gearSlotToStateKey,
  type PatientGearState,
} from '../context/patientGearUtils';
import {
  defaultPatientRewardMeta,
  type PatientRewardMeta,
} from '../context/patientDomainHelpers';

/**
 * מסע ההר (Mountain Climb) — שלבי נוף לפי רמה 1–30.
 * רמה 1: דשא בלבד · רמות 2–10: קצה ההר ברקע · 11–16 שביל · 17–20 אדמה · 21–29 עלייה · 30 פסגה.
 */
export type MountainClimbJourneyPhase =
  /** Level 1–10: The Approach — דשא; מרמה 2: קצה ההר ברחוק */
  | 'approach'
  /** Level 11–16: The Path — שביל, מעבר לשיפולי ההר */
  | 'path'
  /** Level 17–20: Arrival at the Base — אדמה; ברמה 20 תחתית ההר, צלע סלע דומיננטית */
  | 'mountain_base'
  /** Level 21–29: The Ascent — קרקע קשה, פסגה מעל, אוויר דליל, בלי צמחייה */
  | 'ascent'
  /** Level 30: The Summit — פסגה, עננים, אוויר גבוה */
  | 'summit';

/** סוג הקרקע המוצג (תואם עברית במוצר) */
export type MountainGroundKind = 'דשא' | 'שביל' | 'אדמה' | 'קרקע קשה' | 'פסגה';

export interface MountainClimbEnvironmentState {
  /** רמה מחושבת לנוף (1–30; מעל 30 נשארים בוויזואל של פסגה) */
  normalizedLevel: number;
  phase: MountainClimbJourneyPhase;
  groundKind: MountainGroundKind;
  /**
   * תיאורי נוף לשימוש בקוד / נגישות — דשא, קצה ההר, שביל, תחתית ההר, פסגה, אוויר דליל.
   */
  sceneryDescriptionHe: string;
  /** 0–1 בתוך המקטע הנוכחי */
  segmentT: number;
  showVegetation: boolean;
  /** רמות 21–29 — אוויר נראה דליל יותר */
  thinAir: boolean;
  /** רמה 20+ — רקע מושלם על ידי צלע סלע */
  rockFaceDominant: boolean;
  /** 0–1 — בין 21 ל־29 (מקטע עלייה): קרקע/ערפל/עננים; הפסגה המושלגת עצמה מונעת ע״י snowyPeakJourneyT */
  summitApproachProgress: number;
  /** אבן דרך: הגעה לתחתית ההר */
  atMountainBase: boolean;
  /** רמה 1 במקטע הגישה — רק דשא, בלי פסגה ברקע */
  mountainSvgVisible: boolean;
  /**
   * 0–1 — רמות 2–30: אותה פסגה מושלגת מתקרבת ברציפות (ללא החלפת נכס).
   * רמה 2 → 0 (רחוק, מטושטש מעט), רמה 30 → 1 (גדול ודומיננטי).
   */
  snowyPeakJourneyT: number;
}

/** מזג יומי יציב (לא תלוי ברמה) */
export type MountainDailyWeather = 'בהיר' | 'מעונן' | 'גשום';

/** מבקרים יומיים בנוף — יציב לכל היום */
export type MountainDailyVisitors = 'ציפורים' | 'חיות' | 'ללא';

export interface MountainDailyEnvironmentState {
  /** מפתח יומי מקומי — לפי `toDateString()` של היום הקליני */
  dayKeyLocal: string;
  /** זרע יומי יציב לגלגולים (FNV על dayKeyLocal) */
  daySeed: number;
  /** גרדיאנט שמיים יומי (ייחודי ליום) */
  skyGradientCss: string;
  /** תווית עברית לפלטת השמיים (זריחה, כחול, סגול...) */
  skyPaletteLabelHe: string;
  weather: MountainDailyWeather;
  visitors: MountainDailyVisitors;
}

export interface MountainBackdropContext {
  climb: MountainClimbEnvironmentState;
  daily: MountainDailyEnvironmentState;
}

function hashDaySeedString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * זרע יומי מ־תאריך קליני — משתמש ב־`Date(...).toDateString()` כדי שהיום יישאר קבוע בכל הסשנים.
 */
export function daySeedFromClinicalYmd(ymd: string): { dayKeyLocal: string; seed: number } {
  const t = typeof ymd === 'string' ? ymd.trim() : '';
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (!m) {
    const d = new Date();
    const dayKeyLocal = d.toDateString();
    return { dayKeyLocal, seed: hashDaySeedString(dayKeyLocal) };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const local = new Date(y, mo - 1, da);
  const dayKeyLocal = local.toDateString();
  return { dayKeyLocal, seed: hashDaySeedString(dayKeyLocal) };
}

const SKY_GRADIENTS_CSS: readonly string[] = [
  'linear-gradient(180deg, #0ea5e9 0%, #38bdf8 16%, #7dd3fc 30%, #fef08a 46%, #fde047 56%, #bbf7d0 74%, #4ade80 100%)',
  'linear-gradient(180deg, #020617 0%, #1e3a8a 20%, #2563eb 38%, #38bdf8 58%, #bae6fd 78%, #f0f9ff 100%)',
  'linear-gradient(180deg, #1e1b4b 0%, #4c1d95 22%, #7c3aed 42%, #c4b5fd 62%, #fce7f3 82%, #fdf4ff 100%)',
  'linear-gradient(180deg, #0c4a6e 0%, #0ea5e9 18%, #f97316 45%, #fb923c 62%, #fcd34d 82%, #fef3c7 100%)',
  'linear-gradient(180deg, #042f2e 0%, #0d9488 24%, #5eead4 48%, #a7f3d0 72%, #ecfdf5 100%)',
  'linear-gradient(180deg, #0f172a 0%, #334155 18%, #f43f5e 42%, #fda4af 60%, #fde68a 82%, #fffbeb 100%)',
];

const SKY_PALETTE_LABELS_HE: readonly string[] = [
  'זריחה בהירה',
  'כחול עמוק',
  'סגול רך',
  'שקיעה כתומה',
  'טורקיז',
  'בוקר ורוד',
];

/**
 * שמיים, מזג ומבקרים — משתנים לפי התאריך בלבד (לא לפי רמת המטופל).
 */
export function getMountainDailyEnvironmentState(clinicalYmd: string): MountainDailyEnvironmentState {
  const { dayKeyLocal, seed } = daySeedFromClinicalYmd(clinicalYmd);
  const paletteIdx = seed % SKY_GRADIENTS_CSS.length;
  const skyGradientCss = SKY_GRADIENTS_CSS[paletteIdx] ?? SKY_GRADIENTS_CSS[0];
  const skyPaletteLabelHe = SKY_PALETTE_LABELS_HE[paletteIdx] ?? SKY_PALETTE_LABELS_HE[0];

  const wRoll = (seed >> 4) % 10;
  let weather: MountainDailyWeather;
  if (wRoll === 0) weather = 'גשום';
  else if (wRoll === 1 || wRoll === 2) weather = 'מעונן';
  else weather = 'בהיר';

  const vRoll = (seed >> 8) % 7;
  let visitors: MountainDailyVisitors;
  if (vRoll === 0) visitors = 'ציפורים';
  else if (vRoll === 1) visitors = 'חיות';
  else visitors = 'ללא';

  return {
    dayKeyLocal,
    daySeed: seed,
    skyGradientCss,
    skyPaletteLabelHe,
    weather,
    visitors,
  };
}

/**
 * שורת מזג/טבע לגארדי — מופיעה לעיתים (לא בכל יום), יציבה ליום הקליני.
 */
export function getGuardiMountainAmbientLine(clinicalYmd: string, level?: number): string | null {
  void level;
  const daily = getMountainDailyEnvironmentState(clinicalYmd);
  if ((daily.daySeed % 7) >= 4) return null;
  if (daily.weather === 'גשום') return 'קצת גשם בחוץ — נשמע לי מרענן.';
  if (daily.weather === 'מעונן') return 'עננים היום — הרוח קרירה בבירור.';
  if (daily.visitors === 'ציפורים') return 'שמת לב לציפורים בשמיים?';
  if (daily.visitors === 'חיות') return 'יש לי הרגשה שאנחנו לא לבד בשביל היום...';
  return 'תראה איזה יום יפה בחוץ!';
}

function mountainPhaseForLevel(lv: number): MountainClimbJourneyPhase {
  if (lv >= 30) return 'summit';
  if (lv >= 21) return 'ascent';
  if (lv >= 17) return 'mountain_base';
  if (lv >= 11) return 'path';
  return 'approach';
}

function mountainGroundKindForPhase(phase: MountainClimbJourneyPhase): MountainGroundKind {
  switch (phase) {
    case 'approach':
      return 'דשא';
    case 'path':
      return 'שביל';
    case 'mountain_base':
      return 'אדמה';
    case 'ascent':
      return 'קרקע קשה';
    case 'summit':
    default:
      return 'פסגה';
  }
}

function mountainSegmentT(lv: number, phase: MountainClimbJourneyPhase): number {
  switch (phase) {
    case 'approach':
      return Math.min(1, Math.max(0, (lv - 1) / 9));
    case 'path':
      return Math.min(1, Math.max(0, (lv - 11) / 5));
    case 'mountain_base':
      return Math.min(1, Math.max(0, (lv - 17) / 3));
    case 'ascent':
      return Math.min(1, Math.max(0, (lv - 21) / 8));
    case 'summit':
    default:
      return 1;
  }
}

function mountainSceneryDescriptionHe(
  phase: MountainClimbJourneyPhase,
  opts: {
    atMountainBase: boolean;
    thinAir: boolean;
    mountainSvgVisible: boolean;
  }
): string {
  const parts: string[] = [];
  switch (phase) {
    case 'approach':
      parts.push('דשא');
      if (opts.mountainSvgVisible) parts.push('קצה ההר');
      break;
    case 'path':
      parts.push('שביל', 'שיפולי ההר');
      break;
    case 'mountain_base':
      parts.push('אדמה');
      if (opts.atMountainBase) parts.push('תחתית ההר', 'צלע סלע');
      break;
    case 'ascent':
      parts.push('קרקע קשה', 'פסגה', 'אוויר דליל', 'ללא צמחייה');
      break;
    case 'summit':
    default:
      parts.push('פסגה', 'סלע', 'עננים', 'אוויר גבוה');
      break;
  }
  return parts.join(' · ');
}

/**
 * מצב נוף למסע ההר — מעודכן כשהרמה משתנה; רמות מעל 30 נשארות בוויזואל של רמה 30 (פסגה).
 */
export function getMountainClimbEnvironmentState(level: number): MountainClimbEnvironmentState {
  const raw = Number.isFinite(level) ? Math.floor(Number(level)) : 1;
  const normalizedLevel = Math.min(30, Math.max(1, raw));
  const phase = mountainPhaseForLevel(normalizedLevel);
  const segmentT = mountainSegmentT(normalizedLevel, phase);
  const groundKind = mountainGroundKindForPhase(phase);
  const atMountainBase = normalizedLevel >= 20;
  const rockFaceDominant = normalizedLevel >= 20;
  const thinAir = normalizedLevel >= 21 && normalizedLevel < 30;
  const showVegetation = normalizedLevel < 21;
  const summitApproachProgress =
    phase === 'ascent' ? segmentT : phase === 'summit' ? 1 : 0;

  const mountainSvgVisible =
    phase !== 'approach' || normalizedLevel >= 2;
  const snowyPeakJourneyT =
    normalizedLevel <= 1
      ? 0
      : Math.min(1, Math.max(0, (normalizedLevel - 2) / 28));

  const sceneryDescriptionHe = mountainSceneryDescriptionHe(phase, {
    atMountainBase,
    thinAir,
    mountainSvgVisible,
  });

  return {
    normalizedLevel,
    phase,
    groundKind,
    sceneryDescriptionHe,
    segmentT,
    showVegetation,
    thinAir,
    rockFaceDominant,
    summitApproachProgress,
    atMountainBase,
    mountainSvgVisible,
    snowyPeakJourneyT,
  };
}

export function getMountainBackdropContext(
  level: number,
  clinicalYmd: string
): MountainBackdropContext {
  return {
    climb: getMountainClimbEnvironmentState(level),
    daily: getMountainDailyEnvironmentState(clinicalYmd),
  };
}

/**
 * תוספת גובה (יחידות Three.js) לאווטאר המטופל במסע ההר — 0 ברמה 1, עולה עד ~0.19 ברמה 30.
 * גארדי (מנטור 2D) הוא שכבת UI נפרדת ולא משתמש בערך זה.
 */
export function getPatientAvatarMountainElevationY(level: number): number {
  const L = Math.min(30, Math.max(1, Math.floor(Number(level)) || 1));
  return ((L - 1) / 29) * 0.19;
}

/** פוזה קלינית: מנוחה (כופף קל) · פעיל · כוח (חזה החוצה) */
export type PatientAvatarPostureTier = 'rest' | 'active' | 'power';

/** רמות 1–10 מנוחה, 11–25 פעיל, 26–30 כוח — קשור לרמת המטופל במסע */
export function getPatientAvatarPostureTier(level: number): PatientAvatarPostureTier {
  const L = Math.min(30, Math.max(1, Math.floor(Number(level)) || 1));
  if (L <= 10) return 'rest';
  if (L <= 25) return 'active';
  return 'power';
}

/**
 * היסט pitch לציר X של המותן (רדיאנים) — נוסף על אנימציית ההליכה.
 * חיובי = כיפוף קדימה קל (מנוחה), שלילי = חזה החוצה (כוח).
 */
export function getPatientAvatarPostureTorsoPitchOffset(level: number): number {
  const L = Math.min(30, Math.max(1, Math.floor(Number(level)) || 1));
  if (L <= 10) return 0.065;
  if (L <= 25) return 0.018;
  return -0.055;
}

/**
 * קנה מידה [כתפיים X, גובה Y, עומק Z] — מתרחב מעט עם הרמה (1→~1.07).
 */
export function getPatientAvatarPhysiqueScale(level: number): [number, number, number] {
  const L = Math.min(30, Math.max(1, Math.floor(Number(level)) || 1));
  const t = (L - 1) / 29;
  return [1 + t * 0.072, 1 + t * 0.038, 1 + t * 0.048];
}

/**
 * הילה «כוח» — מרמה 15; עוצמה ועובי עולים עד רמה 30.
 */
export function getPatientAvatarStrengthAura(level: number): {
  enabled: boolean;
  intensity: number;
  thickness: number;
} {
  const L = Math.min(30, Math.max(1, Math.floor(Number(level)) || 1));
  if (L < 15) return { enabled: false, intensity: 0, thickness: 0 };
  const u = (L - 15) / 15;
  return {
    enabled: true,
    intensity: 0.12 + u * 0.88,
    thickness: 0.05 + u * 0.28,
  };
}

/**
 * שלב ויזואלי לשרירים — אבני דרך 10, 20, 30; מעל 30 לפי אבולוציה כללית.
 */
export function getPatientAvatarMuscleVisualStage(level: number): MuscleEvolutionStage {
  const L = Math.max(1, Math.floor(Number(level)) || 1);
  if (L <= 30) {
    if (L < 10) return 'post_injury';
    if (L < 20) return 'active_rehab';
    if (L < 30) return 'strengthening';
    return 'power';
  }
  return getMuscleEvolutionStage(L);
}

export type PatientRewardFeedback = {
  id: number;
  xpAdded: number;
  coinsAdded: number;
  streakBonusXp?: number;
  message?: string;
};

export type GearPurchaseResult =
  | 'ok'
  | 'insufficient'
  | 'insufficient_xp'
  | 'already_owned'
  | 'invalid';

export type UseGamificationParams = {
  allPatients: Patient[];
  setAllPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  patientRewardMetaByPatientId: Record<string, PatientRewardMeta>;
  setPatientRewardMetaByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, PatientRewardMeta>>
  >;
  patientGearByPatientId: Record<string, PatientGearState>;
  setPatientGearByPatientId: React.Dispatch<
    React.SetStateAction<Record<string, PatientGearState>>
  >;
  knowledgeFacts: KnowledgeFact[];
  setKnowledgeFacts: React.Dispatch<React.SetStateAction<KnowledgeFact[]>>;
};

/**
 * XP, רמות, מטבעות, מסע ההר (שדות Patient), חנות ציוד, בסיס הידע של Guardi,
 * ופידבק ויזואלי אחרי אימון (כולל הודעות מ-computeExerciseCompletionRewards).
 */
export function useGamification({
  allPatients,
  setAllPatients,
  patientRewardMetaByPatientId,
  setPatientRewardMetaByPatientId,
  patientGearByPatientId,
  setPatientGearByPatientId,
  knowledgeFacts,
  setKnowledgeFacts,
}: UseGamificationParams) {
  const [rewardFeedback, setRewardFeedback] = useState<PatientRewardFeedback | null>(null);
  const rewardFeedbackIdRef = useRef(0);

  const pushRewardFeedback = useCallback(
    (xpAdded: number, coinsAdded: number, streakBonusXp?: number, message?: string) => {
      rewardFeedbackIdRef.current += 1;
      setRewardFeedback({
        id: rewardFeedbackIdRef.current,
        xpAdded,
        coinsAdded,
        streakBonusXp: streakBonusXp && streakBonusXp > 0 ? streakBonusXp : undefined,
        message,
      });
    },
    []
  );

  const clearRewardFeedback = useCallback(() => setRewardFeedback(null), []);

  const grantPatientCoins = useCallback(
    (patientId: string, amount: number) => {
      if (amount <= 0) return;
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, coins: p.coins + amount } : p))
      );
      pushRewardFeedback(0, amount);
    },
    [pushRewardFeedback, setAllPatients]
  );

  const markArticleAsRead = useCallback(
    (
      patientId: string,
      articleId: string,
      options?: { readerConfirmed?: boolean; didYouKnowLocalCalendarYmd?: string }
    ) => {
      if (!options?.readerConfirmed) return false;
      const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
      const dykYmd = options.didYouKnowLocalCalendarYmd;
      let granted = false;
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.readArticleIds.includes(articleId)) return prev;
        granted = true;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            readArticleIds: [...cur.readArticleIds, articleId],
            dykRewardClaimedLocalYmd:
              dykYmd !== undefined ? dykYmd : cur.dykRewardClaimedLocalYmd,
            dykTipOpenedLocalYmd:
              dykYmd !== undefined ? dykYmd : cur.dykTipOpenedLocalYmd,
          },
        };
      });
      if (!granted) return false;
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? applyXpCoinsLevelUp(p, rxp, rcoins) : p
        )
      );
      pushRewardFeedback(rxp, rcoins, undefined, 'תוכן הידעת נקרא');
      return true;
    },
    [pushRewardFeedback, setAllPatients, setPatientRewardMetaByPatientId]
  );

  const hasReadArticle = useCallback(
    (patientId: string, articleId: string) =>
      (patientRewardMetaByPatientId[patientId]?.readArticleIds ?? []).includes(articleId),
    [patientRewardMetaByPatientId]
  );

  const getDidYouKnowRewardClaimedLocalYmd = useCallback(
    (patientId: string) =>
      patientRewardMetaByPatientId[patientId]?.dykRewardClaimedLocalYmd ?? null,
    [patientRewardMetaByPatientId]
  );

  const recordDidYouKnowTipOpened = useCallback(
    (patientId: string, localCalendarYmd: string) => {
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.dykTipOpenedLocalYmd === localCalendarYmd) return prev;
        return {
          ...prev,
          [patientId]: { ...cur, dykTipOpenedLocalYmd: localCalendarYmd },
        };
      });
    },
    [setPatientRewardMetaByPatientId]
  );

  const getDidYouKnowTipOpenedLocalYmd = useCallback(
    (patientId: string) =>
      patientRewardMetaByPatientId[patientId]?.dykTipOpenedLocalYmd ?? null,
    [patientRewardMetaByPatientId]
  );

  const recordArticleLinkOpened = useCallback(
    (patientId: string, articleId: string) => {
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.articleLinkOpenedIds.includes(articleId)) return prev;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            articleLinkOpenedIds: [...cur.articleLinkOpenedIds, articleId],
          },
        };
      });
    },
    [setPatientRewardMetaByPatientId]
  );

  const hasArticleLinkOpened = useCallback(
    (patientId: string, articleId: string) =>
      (patientRewardMetaByPatientId[patientId]?.articleLinkOpenedIds ?? []).includes(articleId),
    [patientRewardMetaByPatientId]
  );

  const removeKnowledgeFact = useCallback(
    (factId: string) => {
      setKnowledgeFacts((prev) => prev.filter((f) => f.id !== factId));
    },
    [setKnowledgeFacts]
  );

  const addManualKnowledgeFact = useCallback(
    (input: { teaser: string; title: string; explanation: string; sourceUrl: string }) => {
      const title = input.title.trim();
      const explanation = input.explanation.trim();
      let teaser = input.teaser.trim().slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
      if (!teaser && title) teaser = title.slice(0, KNOWLEDGE_TEASER_MAX_CHARS);
      let sourceUrl = input.sourceUrl.trim();
      if (!title || !explanation || !sourceUrl) return;
      if (!/^https?:\/\//i.test(sourceUrl)) {
        sourceUrl = `https://${sourceUrl}`;
      }
      try {
        const u = new URL(sourceUrl);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
        sourceUrl = u.toString();
      } catch {
        return;
      }
      const id = `dyk-m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const row: KnowledgeFact = {
        id,
        teaser,
        title,
        explanation,
        sourceUrl,
        isApproved: true,
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      setKnowledgeFacts((prev) => [...prev, row]);
    },
    [setKnowledgeFacts]
  );

  const refreshKnowledgeBaseFromCloud = useCallback(async () => {
    if (!supabase) return;
    const kbRow = await fetchAppKnowledgeBaseFromSupabase(supabase);
    if (kbRow) {
      setKnowledgeFacts(normalizeKnowledgeFactsList(kbRow.items));
    }
  }, [setKnowledgeFacts]);

  const hasDailyLoginBonusPending = useCallback(
    (patientId: string) => {
      const day = getClinicalDate();
      return (patientRewardMetaByPatientId[patientId]?.lastLoginBonusClinicalDate ?? null) !== day;
    },
    [patientRewardMetaByPatientId]
  );

  const getPatientGear = useCallback(
    (patientId: string) => patientGearByPatientId[patientId] ?? defaultPatientGear(),
    [patientGearByPatientId]
  );

  const purchaseGearItem = useCallback(
    (patientId: string, rawId: string): GearPurchaseResult => {
      if (!isGearItemId(rawId)) return 'invalid';
      const entry = GEAR_BY_ID[rawId];
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return 'invalid';
      if (patient.xp < entry.xpRequired) return 'insufficient_xp';
      if (patient.coins < entry.priceCoins) return 'insufficient';

      if (entry.id === 'streak_shield') {
        setAllPatients((prev) =>
          prev.map((p) =>
            p.id === patientId ? { ...p, coins: p.coins - entry.priceCoins } : p
          )
        );
        setPatientGearByPatientId((prev) => {
          const cur = prev[patientId] ?? defaultPatientGear();
          return {
            ...prev,
            [patientId]: {
              ...cur,
              streakShieldCharges: cur.streakShieldCharges + 1,
            },
          };
        });
        return 'ok';
      }

      const owned = patientGearByPatientId[patientId]?.ownedGearIds ?? [];
      if (owned.includes(rawId)) return 'already_owned';

      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, coins: p.coins - entry.priceCoins } : p
        )
      );
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        if (cur.ownedGearIds.includes(rawId)) return prev;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            ownedGearIds: [...cur.ownedGearIds, rawId],
          },
        };
      });
      return 'ok';
    },
    [allPatients, patientGearByPatientId, setAllPatients, setPatientGearByPatientId]
  );

  const equipGearItem = useCallback(
    (patientId: string, rawId: string): boolean => {
      if (!isGearItemId(rawId)) return false;
      const entry = GEAR_BY_ID[rawId];
      if (entry.equipSlot === 'none') return false;
      const g = patientGearByPatientId[patientId] ?? defaultPatientGear();
      if (!g.ownedGearIds.includes(rawId)) return false;
      if (entry.equipSlot === 'functional_passive') {
        setPatientGearByPatientId((prev) => {
          const cur = prev[patientId] ?? defaultPatientGear();
          return {
            ...prev,
            [patientId]: { ...cur, equippedPassiveId: rawId },
          };
        });
        return true;
      }
      const slotKey = gearSlotToStateKey(entry.equipSlot);
      if (!slotKey) return false;
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        return {
          ...prev,
          [patientId]: { ...cur, [slotKey]: rawId },
        };
      });
      return true;
    },
    [patientGearByPatientId, setPatientGearByPatientId]
  );

  const unequipGearSlot = useCallback(
    (patientId: string, slot: GearEquipSlot) => {
      if (slot === 'functional_passive') {
        setPatientGearByPatientId((prev) => {
          const cur = prev[patientId] ?? defaultPatientGear();
          return {
            ...prev,
            [patientId]: { ...cur, equippedPassiveId: null },
          };
        });
        return;
      }
      if (slot === 'none') return;
      const key = gearSlotToStateKey(slot);
      if (!key) return;
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        return {
          ...prev,
          [patientId]: { ...cur, [key]: null },
        };
      });
    },
    [setPatientGearByPatientId]
  );

  const claimDailyLoginBonusIfNeeded = useCallback(
    (patientId: string) => {
      const clinicalDay = getClinicalDate();
      const { xp: bxp } = PATIENT_REWARDS.FIRST_LOGIN_OF_DAY;
      if (bxp <= 0) return false;
      let granted = false;
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.lastLoginBonusClinicalDate === clinicalDay) {
          return prev;
        }
        granted = true;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            lastLoginBonusClinicalDate: clinicalDay,
          },
        };
      });
      if (!granted) return false;
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? applyXpCoinsLevelUp(p, bxp, 0) : p))
      );
      pushRewardFeedback(bxp, 0, undefined, 'כניסה יומית');
      return true;
    },
    [pushRewardFeedback, setAllPatients, setPatientRewardMetaByPatientId]
  );

  return {
    rewardFeedback,
    clearRewardFeedback,
    pushRewardFeedback,
    grantPatientCoins,
    markArticleAsRead,
    hasReadArticle,
    getDidYouKnowRewardClaimedLocalYmd,
    recordDidYouKnowTipOpened,
    getDidYouKnowTipOpenedLocalYmd,
    recordArticleLinkOpened,
    hasArticleLinkOpened,
    hasDailyLoginBonusPending,
    getPatientGear,
    purchaseGearItem,
    equipGearItem,
    unequipGearSlot,
    claimDailyLoginBonusIfNeeded,
    knowledgeFacts,
    addManualKnowledgeFact,
    removeKnowledgeFact,
    refreshKnowledgeBaseFromCloud,
    getMountainDailyEnvironmentState,
    getMountainBackdropContext,
    getGuardiMountainAmbientLine,
    getPatientAvatarMountainElevationY,
    getPatientAvatarPostureTier,
    getPatientAvatarPostureTorsoPitchOffset,
    getPatientAvatarPhysiqueScale,
    getPatientAvatarStrengthAura,
    getPatientAvatarMuscleVisualStage,
  };
}
