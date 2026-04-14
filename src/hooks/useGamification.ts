import { useCallback, useRef, useState } from 'react';
import type { KnowledgeFact } from '../types';
import { PATIENT_REWARDS } from '../config/patientRewards';
import {
  GEAR_BY_ID,
  isGearItemId,
  type GearEquipSlot,
} from '../config/gearCatalog';
import { applyXpCoinsLevelUp } from '../utils/gamification-utils';
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
  };
}
