import { useState, useMemo, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { getStrengthenedBodyAreasToday } from '../../utils/strengthenedAreasToday';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Zap,
  MessageCircle,
  Coins,
  Activity,
  LogOut,
  Send,
  User,
  Bot,
  Clock,
  Settings,
  Home,
  ShoppingBag,
  Siren,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { useAuth } from '../../context/AuthContext';
import { getTherapistDisplayName } from '../../context/authPersistence';
import BodyMap3D from '../body-map/BodyMap3D';
import GordyVictorySequence from './GordyVictorySequence';
import GordyCompanion, { type GordyTransientAppearance } from './GordyCompanion';
import GordyFullScreenCelebration from './GordyFullScreenCelebration';
import ExerciseReportModal from './ExerciseReportModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import PortalExerciseCard from './PortalExerciseCard';
import ExerciseVideoTimerModal, {
  type ExerciseTrainingCompletePayload,
} from './ExerciseVideoTimerModal';
import GuardianAssistantFAB from './GuardianAssistantFAB';
import { formatTime } from '../dashboard/ManagePlanModal';
import type { StrengthExerciseLevelDef } from '../../data/strengthExerciseDatabase';
import { getStrengthChainForArea } from '../../data/strengthExerciseDatabase';
import { bodyAreaBlocksSelfCare } from '../../body/bodyPickMapping';
import EmergencyStopModal from './EmergencyStopModal';
import DidYouKnowBubble from './DidYouKnowBubble';
import PatientAiPlanSuggestionModal from './PatientAiPlanSuggestionModal';
import PainAnalyticsModal from './PainAnalyticsModal';
import ClinicalMonthCalendar from './ClinicalMonthCalendar';
import type { AiSuggestion, PatientExercise, BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import {
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
} from '../../safety/clinicalEmergencyScreening';
import { PATIENT_REWARDS, exerciseBaseXp } from '../../config/patientRewards';
import { RewardLabel } from '../ui/RewardLabel';
import StackedDumbbellsIcon from '../icons/StackedDumbbellsIcon';
import GearStoreArmory from './GearStoreArmory';
import { buildEquippedGearSnapshot } from '../../utils/gearSnapshot';
import PortalPatientDebugPanel from './PortalPatientDebugPanel';
import PatientRedFlagEmergencyModal from './PatientRedFlagEmergencyModal';
import PatientHeroesHallTab from './PatientHeroesHallTab';
import PatientPortalSettingsModal from './PatientPortalSettingsModal';
import { fetchAiPlanAdjustmentSuggestion } from '../../ai/geminiAiPlanAdjustment';
import { computeStreakForPatient } from '../../utils/exerciseStreak';

type PortalTab = 'home' | 'activity' | 'gear' | 'messages' | 'heroes';

function tabFromPortalPath(pathname: string): PortalTab {
  const idx = pathname.indexOf('/patient-portal');
  if (idx === -1) return 'home';
  const rest = pathname.slice(idx + '/patient-portal'.length).replace(/^\/+|\/+$/g, '');
  if (!rest) return 'home';
  if (rest === 'activity' || rest === 'gear' || rest === 'messages' || rest === 'heroes') return rest;
  return 'home';
}

function portalHrefForTab(tab: PortalTab): string {
  if (tab === 'home') return '/patient-portal';
  return `/patient-portal/${tab}`;
}

/** אזור לחיצה נוח לאגודל + משוב ויזואלי לכרטיסי ניווט */
const PORTAL_PROGRESS_NAV_SURFACE =
  'cursor-pointer touch-manipulation select-none motion-safe:transition-[transform,opacity] duration-200 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] motion-safe:hover:opacity-[0.94] motion-safe:active:opacity-[0.88] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical-primary';

function activateOnEnterSpace(e: KeyboardEvent, fn: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

/** מניעת כפילות חגיגת סיום תחת React StrictMode (אותו מפתח ביום) */
const gordySessionCompleteDedupe = new Set<string>();

function portalTrainingAiPlanModalAckKey(patientId: string, clinicalDay: string): string {
  return `portal_training_ai_adjustment_ack_${patientId}_${clinicalDay}`;
}

/** תצוגת יום למטופל — מוצגת רק ב־/patient-portal (מפת גוף, תרגילים, לוח שנה). */
export default function PatientDailyView() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessionRole,
    logout,
    patientMustChangePassword,
    completePatientPasswordChange,
    patientLoginId,
    changePatientLoginId,
  } = useAuth();
  const {
    selectedPatient,
    messages,
    getExercisePlan,
    getTodaySession,
    submitExerciseReport,
    sendPatientMessage,
    getPatientMessages,
    markMessageRead,
    submitPatientAiPlanAdjustmentRequest,
    markArticleAsRead,
    hasReadArticle,
    hasDailyLoginBonusPending,
    getPatientGear,
    purchaseGearItem,
    equipGearItem,
    unequipGearSlot,
    claimDailyLoginBonusIfNeeded,
    rewardFeedback,
    clearRewardFeedback,
    submitGuardianRepsIncreaseRequest,
    sendAiClinicalAlert,
    emergencyModalPatientId,
    setEmergencyModalPatientId,
    isPatientExerciseSafetyLocked,
    safetyAlerts,
    clinicalToday,
    dailyHistoryByPatient,
    getSelfCareZones,
    toggleSelfCareZone,
    logSelfCareSession,
    appendPatientExerciseFinishReport,
    getPatientExerciseFinishReports,
    getSelfCareStrengthTier,
    setSelfCareStrengthTier,
    knowledgeFacts,
  } = usePatient();

  const [reportFor, setReportFor] = useState<PatientExercise | null>(null);
  const [reportInitialEffort, setReportInitialEffort] = useState<
    1 | 2 | 3 | 4 | 5 | undefined
  >(undefined);
  const [detailFor, setDetailFor] = useState<PatientExercise | null>(null);
  const [messageText, setMessageText] = useState('');
  const [painAnalyticsOpen, setPainAnalyticsOpen] = useState(false);
  const [loadSafetyNudge, setLoadSafetyNudge] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwFormError, setPwFormError] = useState<string | null>(null);
  const [portalTab, setPortalTab] = useState<PortalTab>(() =>
    tabFromPortalPath(typeof window !== 'undefined' ? window.location.pathname : '/patient-portal')
  );
  const [gordyTransient, setGordyTransient] = useState<GordyTransientAppearance | null>(null);

  useEffect(() => {
    setPortalTab(tabFromPortalPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (portalTab !== 'activity') return;
    const id = location.hash.replace(/^#/, '');
    if (id !== 'today-missions') return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(t);
  }, [portalTab, location.pathname, location.hash]);

  useEffect(() => {
    if (portalTab !== 'home') return;
    const id = location.hash.replace(/^#/, '');
    if (id !== 'patient-clinical-dashboard') return;
    const t = window.setTimeout(() => {
      document.getElementById('patient-clinical-dashboard')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
    return () => clearTimeout(t);
  }, [portalTab, location.pathname, location.hash]);

  useEffect(() => {
    setGordyTransient(null);
  }, [portalTab]);

  useEffect(() => {
    if (!gordyTransient) return;
    const left = gordyTransient.until - Date.now();
    if (left <= 0) {
      setGordyTransient(null);
      return;
    }
    const t = window.setTimeout(() => setGordyTransient(null), left);
    return () => clearTimeout(t);
  }, [gordyTransient]);
  const [exerciseVideoModal, setExerciseVideoModal] = useState<
    | null
    | { kind: 'rehab'; exercise: PatientExercise; xpAward: number; coinsAward: number }
    | {
        kind: 'selfCare';
        bodyArea: BodyArea;
        exercise: StrengthExerciseLevelDef;
        xpAward: number;
        coinsAward: number;
      }
  >(null);
  const [redFlagOpen, setRedFlagOpen] = useState(false);
  const [redFlagSirenAssetFailed, setRedFlagSirenAssetFailed] = useState(false);
  const [trainingAiPlanModalOpen, setTrainingAiPlanModalOpen] = useState(false);
  const [trainingAiPlanModalLoading, setTrainingAiPlanModalLoading] = useState(false);
  const [trainingAiPlanModalSuggestion, setTrainingAiPlanModalSuggestion] = useState<AiSuggestion | null>(
    null
  );
  const [trainingAiPlanModalInfo, setTrainingAiPlanModalInfo] = useState<string | null>(null);

  const careGiverName = useMemo(
    () => (selectedPatient ? getTherapistDisplayName(selectedPatient.therapistId) : ''),
    [selectedPatient?.therapistId]
  );

  const careGiverShort = useMemo(() => {
    if (!careGiverName) return '';
    return careGiverName.replace(/^ד"ר\s+/u, '').split(/\s+/)[0] || careGiverName;
  }, [careGiverName]);

  const portalMessages = useMemo(
    () => (selectedPatient ? getPatientMessages(selectedPatient.id) : []),
    [selectedPatient, getPatientMessages, messages]
  );

  const unreadForPatient = useMemo(
    () =>
      portalMessages.filter(
        (m) => !m.isRead && !m.fromPatient
      ).length,
    [portalMessages]
  );

  useEffect(() => {
    if (!selectedPatient || portalTab !== 'messages') return;
    portalMessages.forEach((m) => {
      if (!m.fromPatient && !m.isRead) markMessageRead(m.id);
    });
  }, [selectedPatient?.id, portalTab, portalMessages, markMessageRead]);

  const plan = selectedPatient ? getExercisePlan(selectedPatient.id) : undefined;
  const session = selectedPatient ? getTodaySession(selectedPatient.id) : null;
  const exercises = plan?.exercises ?? [];

  const activeAreas = useMemo(
    () => [...new Set(exercises.map((e) => e.targetArea))],
    [exercises]
  );

  const completedSet = useMemo(
    () => new Set(session?.completedIds ?? []),
    [session?.completedIds]
  );

  const patientDayMap = useMemo(
    () =>
      selectedPatient ? dailyHistoryByPatient[selectedPatient.id] ?? {} : {},
    [selectedPatient, dailyHistoryByPatient]
  );

  const displayStreak = useMemo(
    () =>
      selectedPatient
        ? computeStreakForPatient(selectedPatient, patientDayMap, clinicalToday)
        : 0,
    [selectedPatient, patientDayMap, clinicalToday]
  );

  const approvedKnowledgeFacts = useMemo(
    () => knowledgeFacts.filter((f) => f.isApproved),
    [knowledgeFacts]
  );

  const exerciseSafetyLocked = selectedPatient
    ? isPatientExerciseSafetyLocked(selectedPatient.id)
    : false;
  const redFlagPortalLock = selectedPatient?.redFlagActive === true;
  const exercisesLocked = exerciseSafetyLocked || redFlagPortalLock;

  useEffect(() => {
    if (exercisesLocked) setExerciseVideoModal(null);
  }, [exercisesLocked]);

  /** Green zones (excludes clinical); synced with 3D picks + context. */
  const selectedZones = selectedPatient ? getSelfCareZones(selectedPatient.id) : [];

  const strengthenedAreasToday = useMemo(() => {
    if (!selectedPatient) return [] as BodyArea[];
    return getStrengthenedBodyAreasToday(getPatientExerciseFinishReports(selectedPatient.id));
  }, [selectedPatient, getPatientExerciseFinishReports]);

  const prevPatientIdRef = useRef<string | undefined>(undefined);
  const [coinKick, setCoinKick] = useState(false);
  const [gordyVictoryBurst, setGordyVictoryBurst] = useState(0);
  const [gordyVictoryRewards, setGordyVictoryRewards] = useState<{
    xp: number;
    coins: number;
    streak?: number;
  }>({ xp: 0, coins: 0 });

  useEffect(() => {
    const pid = selectedPatient?.id;
    if (prevPatientIdRef.current !== undefined && pid !== prevPatientIdRef.current) {
      clearRewardFeedback();
    }
    prevPatientIdRef.current = pid;
  }, [selectedPatient?.id, clearRewardFeedback]);

  useEffect(() => {
    if (!selectedPatient) return;
    const granted = claimDailyLoginBonusIfNeeded(selectedPatient.id);
    if (granted) {
      setGordyTransient({
        key: `daily_${clinicalToday}_${Date.now()}`,
        mood: 'joy',
        bubble: 'בוקר טוב! ההתמדה שלכם נספרת — יום חזק 💚',
        until: Date.now() + 6000,
      });
    }
  }, [selectedPatient, clinicalToday, claimDailyLoginBonusIfNeeded]);

  useEffect(() => {
    if (!rewardFeedback) return;
    setCoinKick(true);
    const hasVictoryLoot =
      rewardFeedback.xpAdded > 0 ||
      rewardFeedback.coinsAdded > 0 ||
      (rewardFeedback.streakBonusXp != null && rewardFeedback.streakBonusXp > 0);
    if (hasVictoryLoot) {
      setGordyVictoryBurst((k) => k + 1);
      setGordyVictoryRewards({
        xp: rewardFeedback.xpAdded,
        coins: rewardFeedback.coinsAdded,
        streak: rewardFeedback.streakBonusXp,
      });
    }
    const t0 = window.setTimeout(() => setCoinKick(false), 720);
    const t1 = window.setTimeout(() => clearRewardFeedback(), 2400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [rewardFeedback?.id, clearRewardFeedback]);

  const clinicalRehabExercises = useMemo(() => {
    if (!selectedPatient) return [];
    const sec = selectedPatient.secondaryClinicalBodyAreas ?? [];
    return exercises.filter((e) =>
      bodyAreaBlocksSelfCare(e.targetArea, selectedPatient.primaryBodyArea, sec)
    );
  }, [exercises, selectedPatient]);

  type MissionRow =
    | { kind: 'rehab'; exercise: PatientExercise }
    | {
        kind: 'strength';
        area: BodyArea;
        exercise: StrengthExerciseLevelDef;
        strengthTier: 0 | 1 | 2;
      };

  const strengthMissionRows = useMemo((): MissionRow[] => {
    if (!selectedPatient) return [];
    return [...selectedZones]
      .sort((a, b) => a.localeCompare(b))
      .map((area) => {
        const chain = getStrengthChainForArea(area);
        const strengthTier = getSelfCareStrengthTier(selectedPatient.id, area);
        const exercise = chain.levels[strengthTier];
        return {
          kind: 'strength' as const,
          area,
          exercise,
          strengthTier,
        };
      });
  }, [selectedZones, selectedPatient, getSelfCareStrengthTier]);

  const combinedMissionItems = useMemo((): MissionRow[] => {
    const rehab: MissionRow[] = clinicalRehabExercises.map((exercise) => ({
      kind: 'rehab' as const,
      exercise,
    }));
    return [...rehab, ...strengthMissionRows];
  }, [clinicalRehabExercises, strengthMissionRows]);

  const totalMissions = combinedMissionItems.length;
  const completedMissionCount = useMemo(
    () => combinedMissionItems.filter((row) => completedSet.has(row.exercise.id)).length,
    [combinedMissionItems, completedSet]
  );

  const trainingTabContextKey = useMemo(() => {
    const zoneKey = [...selectedZones].sort().join(',');
    const exKey = [...exercises.map((e) => e.id)].sort().join(',');
    return `${zoneKey}|${exKey}`;
  }, [selectedZones, exercises]);

  const acknowledgeTrainingAiPlanModal = useCallback(() => {
    if (selectedPatient) {
      try {
        sessionStorage.setItem(portalTrainingAiPlanModalAckKey(selectedPatient.id, clinicalToday), '1');
      } catch {
        /* ייתכן מצב פרטי / חסימת אחסון */
      }
    }
    setTrainingAiPlanModalOpen(false);
    setTrainingAiPlanModalSuggestion(null);
    setTrainingAiPlanModalInfo(null);
  }, [selectedPatient, clinicalToday]);

  const handleTrainingAiPlanApprove = useCallback(() => {
    if (trainingAiPlanModalSuggestion) {
      submitPatientAiPlanAdjustmentRequest(trainingAiPlanModalSuggestion);
    }
    acknowledgeTrainingAiPlanModal();
  }, [
    trainingAiPlanModalSuggestion,
    submitPatientAiPlanAdjustmentRequest,
    acknowledgeTrainingAiPlanModal,
  ]);

  useEffect(() => {
    if (!selectedPatient || portalTab !== 'activity' || patientMustChangePassword || exercisesLocked) {
      setTrainingAiPlanModalOpen(false);
      return;
    }

    try {
      if (sessionStorage.getItem(portalTrainingAiPlanModalAckKey(selectedPatient.id, clinicalToday)) === '1') {
        setTrainingAiPlanModalOpen(false);
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    setTrainingAiPlanModalOpen(true);
    setTrainingAiPlanModalLoading(true);
    setTrainingAiPlanModalSuggestion(null);
    setTrainingAiPlanModalInfo(null);

    const patient = selectedPatient;
    const clinical = clinicalRehabExercises;

    void (async () => {
      const sug = await fetchAiPlanAdjustmentSuggestion({ patient, clinicalExercises: clinical });
      if (cancelled) return;
      setTrainingAiPlanModalLoading(false);
      if (sug) {
        setTrainingAiPlanModalSuggestion(sug);
        setTrainingAiPlanModalInfo(null);
      } else {
        setTrainingAiPlanModalSuggestion(null);
        setTrainingAiPlanModalInfo(
          'אין כרגע תרגילי שיקום בתוכנית שאפשר להציע עבורם שינוי אוטומטי. המשיכו לפי הנחיות המטפל או בחרו אזורי כוח בלשונית בית.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- תרגילי שיקום נלכדים דרך מפתח ההקשר
  }, [
    portalTab,
    selectedPatient?.id,
    patientMustChangePassword,
    clinicalToday,
    trainingTabContextKey,
    exercisesLocked,
    clinicalRehabExercises,
  ]);

  const [sessionCelebrationBurst, setSessionCelebrationBurst] = useState(0);
  useEffect(() => {
    if (!selectedPatient || exercisesLocked || totalMissions === 0) return;
    const sk = `gordy_full_celebrate_${selectedPatient.id}_${clinicalToday}`;
    if (sessionStorage.getItem(sk) === '1') return;
    if (completedMissionCount !== totalMissions) return;
    const dedupeKey = `${selectedPatient.id}|${clinicalToday}|${totalMissions}`;
    if (gordySessionCompleteDedupe.has(dedupeKey)) return;
    gordySessionCompleteDedupe.add(dedupeKey);
    setSessionCelebrationBurst((n) => n + 1);
  }, [
    selectedPatient?.id,
    clinicalToday,
    completedMissionCount,
    totalMissions,
    exercisesLocked,
  ]);

  const endSessionCelebration = () => {
    if (selectedPatient) {
      sessionStorage.setItem(
        `gordy_full_celebrate_${selectedPatient.id}_${clinicalToday}`,
        '1'
      );
    }
    setSessionCelebrationBurst(0);
  };

  const gordyCompanionEligible =
    (portalTab === 'home' || portalTab === 'activity') &&
    !patientMustChangePassword &&
    !!selectedPatient &&
    combinedMissionItems.length > 0 &&
    !detailFor &&
    !reportFor &&
    !exerciseVideoModal &&
    !trainingAiPlanModalOpen;

  const gordyCompanionContextAnimation: string | undefined =
    portalTab === 'activity'
      ? 'Exercise1'
      : portalTab === 'home' || portalTab === 'heroes'
        ? 'Wave'
        : undefined;

  const pushExerciseCompleteMilestone = () => {
    setGordyTransient({
      key: `like_${Date.now()}`,
      mood: 'like',
      bubble: 'כל הכבוד! עוד צעד קטן בדרך לשיקום 👍',
      until: Date.now() + 5500,
    });
  };

  const handleTrainingComplete = (payload: ExerciseTrainingCompletePayload) => {
    const m = exerciseVideoModal;
    if (!selectedPatient || !m) return;
    if (m.kind === 'selfCare') {
      const strengthTier = getSelfCareStrengthTier(selectedPatient.id, m.bodyArea);
      const strengthTierLabel =
        strengthTier === 0 ? 'קל' : strengthTier === 1 ? 'בינוני' : 'קשה';
      submitExerciseReport(selectedPatient.id, m.exercise.id, payload.painLevel, payload.effort, m.xpAward, {
        skipPainHistory: true,
        completionSource: 'self-care',
        sessionBodyArea: m.bodyArea,
      });
      logSelfCareSession(
        selectedPatient.id,
        m.exercise.id,
        m.exercise.name,
        payload.effort
      );
      appendPatientExerciseFinishReport(selectedPatient.id, {
        exerciseId: m.exercise.id,
        exerciseName: m.exercise.name,
        zone: bodyAreaLabels[m.bodyArea],
        difficultyScore: payload.effort,
        painLevel: payload.painLevel,
        source: 'self-care',
        selfCareDifficultyTier: strengthTier,
        selfCareDifficultyLabel: strengthTierLabel,
      });
      if (payload.effort === 5) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
      else setLoadSafetyNudge(null);
      pushExerciseCompleteMilestone();
    } else {
      const pain = payload.painLevel;
      submitExerciseReport(selectedPatient.id, m.exercise.id, pain, payload.effort, m.xpAward, {
        completionSource: 'rehab',
        sessionBodyArea: m.exercise.targetArea,
      });
      appendPatientExerciseFinishReport(selectedPatient.id, {
        exerciseId: m.exercise.id,
        exerciseName: m.exercise.name,
        zone: bodyAreaLabels[m.exercise.targetArea],
        difficultyScore: payload.effort,
        painLevel: payload.painLevel,
        source: 'therapist',
      });
      if (pain >= 7) setLoadSafetyNudge(PAIN_SURGE_PATIENT_COPY);
      else if (payload.effort === 5) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
      else setLoadSafetyNudge(null);
      pushExerciseCompleteMilestone();
    }
  };

  const handleAvatarZoneClick = (area: BodyArea) => {
    if (!selectedPatient) return;
    if (
      bodyAreaBlocksSelfCare(
        area,
        selectedPatient.primaryBodyArea,
        selectedPatient.secondaryClinicalBodyAreas ?? []
      )
    ) {
      return;
    }
    toggleSelfCareZone(selectedPatient.id, area);
  };

  const latestEmergencyReason = useMemo(() => {
    if (!selectedPatient) return undefined;
    const hit = [...safetyAlerts]
      .filter((a) => a.patientId === selectedPatient.id && a.severity === 'emergency')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return hit?.reasonHebrew;
  }, [safetyAlerts, selectedPatient?.id]);

  useEffect(() => {
    setLoadSafetyNudge(null);
  }, [selectedPatient?.id]);

  const lastPainRecord = selectedPatient?.analytics.painHistory.slice(-1)[0];

  const openExerciseDetail = (ex: PatientExercise) => {
    setDetailFor(ex);
  };

  const closeExerciseDetail = () => {
    setDetailFor(null);
  };

  const handleRequestCompleteFromDetail = (ex: PatientExercise) => {
    closeExerciseDetail();
    if (!completedSet.has(ex.id)) {
      setReportFor(ex);
    }
  };

  const handleReportSubmit = (painLevel: number, effortRating: number) => {
    if (!reportFor || !selectedPatient) return;
    const xp = reportFor.xpReward;
    submitExerciseReport(selectedPatient.id, reportFor.id, painLevel, effortRating, xp, {
      completionSource: 'rehab',
      sessionBodyArea: reportFor.targetArea,
    });
    if (painLevel >= 7) setLoadSafetyNudge(PAIN_SURGE_PATIENT_COPY);
    else if (effortRating === 5) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
    else setLoadSafetyNudge(null);
    pushExerciseCompleteMilestone();
    setReportFor(null);
    setReportInitialEffort(undefined);
  };

  const submitPasswordChange = () => {
    setPwFormError(null);
    if (pwNew !== pwConfirm) {
      setPwFormError('הסיסמאות החדשות אינן תואמות.');
      return;
    }
    const r = completePatientPasswordChange(pwCurrent, pwNew);
    if (r === 'bad_current') setPwFormError('סיסמה נוכחית שגויה.');
    else if (r === 'invalid_new') setPwFormError('סיסמה חדשה קצרה מדי (לפחות 6 תווים).');
    else {
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    }
  };

  if (!selectedPatient) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-medical-bg font-sans"
        dir="rtl"
      >
        <p className="text-slate-800 font-semibold text-base mb-4">לא נבחר מטופל או שהחשבון אינו מקושר.</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {sessionRole === 'patient' && (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="px-5 py-3 rounded-2xl border-2 border-slate-300 text-slate-800 font-semibold text-base"
            >
              התנתקות
            </button>
          )}
        </div>
      </div>
    );
  }

  const xp = selectedPatient.xp;
  const next = selectedPatient.xpForNextLevel;
  const patientGearState = getPatientGear(selectedPatient.id);

  const goToDailyProgressTasks = () => {
    if (portalTab === 'activity') {
      window.requestAnimationFrame(() => {
        document.getElementById('today-missions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    navigate('/patient-portal/activity#today-missions');
  };

  const goToClinicalDashboardFromStreak = useCallback(() => {
    if (portalTab !== 'home') {
      navigate('/patient-portal#patient-clinical-dashboard');
      return;
    }
    void navigate('/patient-portal#patient-clinical-dashboard', { replace: true });
    window.requestAnimationFrame(() => {
      document.getElementById('patient-clinical-dashboard')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [navigate, portalTab]);

  return (
    <div
      className="min-h-screen flex flex-col max-w-lg mx-auto w-full relative bg-medical-bg font-sans"
      dir="rtl"
    >
      <GordyVictorySequence
        burstKey={gordyVictoryBurst}
        xpAdded={gordyVictoryRewards.xp}
        coinsAdded={gordyVictoryRewards.coins}
        streakBonusXp={gordyVictoryRewards.streak}
      />
      <header
        dir="ltr"
        className="relative grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 sm:gap-x-4 overflow-visible bg-white px-3 sm:px-4 py-3 border-b border-slate-200/80 shadow-md shadow-slate-200/40"
      >
        {/* טור 1 — שמאל: XP / מטבעות */}
        <div className="relative shrink-0 justify-self-start flex flex-col items-start justify-center gap-2">
          {rewardFeedback && (
            <div
              key={rewardFeedback.id}
              className="absolute top-full left-0 mt-1 flex flex-col items-start gap-0.5 pointer-events-none z-30"
            >
              {rewardFeedback.xpAdded > 0 && (
                <span className="text-xs font-black text-teal-600 tabular-nums drop-shadow-sm animate-portal-reward-float">
                  +{rewardFeedback.xpAdded} XP
                </span>
              )}
              {rewardFeedback.streakBonusXp != null && rewardFeedback.streakBonusXp > 0 && (
                <span
                  className="text-[10px] font-bold text-orange-600 tabular-nums animate-portal-reward-float"
                  style={{ animationDelay: '0.08s' }}
                >
                  רצף +{rewardFeedback.streakBonusXp} XP
                </span>
              )}
              {rewardFeedback.coinsAdded > 0 && (
                <span
                  className="text-xs font-black text-amber-600 tabular-nums animate-portal-reward-float"
                  style={{ animationDelay: '0.14s' }}
                >
                  +{rewardFeedback.coinsAdded} מטבעות
                </span>
              )}
            </div>
          )}
          {!patientMustChangePassword && (
            <span
              title={`${xp.toLocaleString()} / ${next.toLocaleString()} התקדמות לרמה הבאה`}
              className="inline-flex flex-col items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 shadow-sm cursor-help min-w-[3rem]"
              role="img"
              aria-label={`${xp.toLocaleString()} מתוך ${next.toLocaleString()} נקודות ניסיון — התקדמות לרמה הבאה`}
            >
              <Zap className="w-4 h-4 shrink-0 text-amber-500" strokeWidth={2.25} aria-hidden />
              <span className="tabular-nums leading-none">{xp.toLocaleString()}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/shop')}
            title="מטבעות למידה — חנות"
            aria-label="מטבעות למידה — מעבר לחנות"
            className={`inline-flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-sm font-bold text-slate-800 transition-transform duration-200 border-2 border-slate-200 bg-white hover:bg-amber-50/80 hover:border-amber-200/90 active:scale-[0.98] min-w-[3.25rem] ${
              coinKick ? 'motion-safe:scale-110' : ''
            }`}
          >
            <Coins
              className={`w-5 h-5 text-amber-600 motion-safe:transition-transform ${coinKick ? 'motion-safe:scale-125' : ''}`}
            />
            <span className="tabular-nums leading-none">{selectedPatient.coins}</span>
          </button>
        </div>

        {/* טור 2 — מרכז: רמה ושם בשורה; רצף מתחת לשם בלבד (ממורכז לעמודת השם) */}
        <div className="min-w-0 w-full max-w-full justify-self-stretch flex flex-col items-center justify-center gap-1 px-1 sm:px-2 text-center">
          {!patientMustChangePassword && (
            <>
              <div
                dir="ltr"
                className="flex w-full min-w-0 max-w-full flex-nowrap items-start justify-center gap-2"
              >
                <span className="shrink-0 pt-0.5 text-xs sm:text-sm font-bold tabular-nums text-emerald-600">
                  רמה {selectedPatient.level}
                </span>
                <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 text-center">
                  <span
                    className="w-full min-w-0 text-lg sm:text-xl font-bold text-slate-900 leading-snug tracking-tight break-words text-center [overflow-wrap:anywhere]"
                    dir="rtl"
                  >
                    {selectedPatient.name}
                  </span>
                  {hasDailyLoginBonusPending(selectedPatient.id) && (
                    <div className="flex justify-center items-center gap-1.5 flex-wrap" dir="rtl">
                      <RewardLabel
                        xp={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.xp}
                        coins={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.coins}
                      />
                      <span className="text-xs text-slate-500">כניסה יומית</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={goToClinicalDashboardFromStreak}
                    onKeyDown={(e) => activateOnEnterSpace(e, goToClinicalDashboardFromStreak)}
                    className="mx-auto text-xs font-black tabular-nums px-2.5 py-1 rounded-xl border w-fit max-w-full shrink-0 cursor-pointer touch-manipulation motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 hover:brightness-[1.03] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                    style={{
                      borderColor: 'rgba(249, 115, 22, 0.45)',
                      background: 'linear-gradient(135deg, rgba(255, 247, 237, 0.95), #fff7ed)',
                      color: '#9a3412',
                      boxShadow: '0 0 12px rgba(251, 146, 60, 0.2)',
                    }}
                    title="רצף ימים — לחצו ללוח קליני בתחתית הבית"
                    aria-label="רצף ימים — מעבר ללוח קליני"
                  >
                    רצף {displayStreak} {displayStreak === 1 ? 'יום' : 'ימים'} 🔥
                  </button>
                </div>
              </div>
            </>
          )}
          {patientMustChangePassword && (
            <p
              className="w-full min-w-0 text-lg sm:text-xl font-bold leading-snug tracking-tight text-slate-900 break-words text-center [overflow-wrap:anywhere]"
              dir="rtl"
            >
              {selectedPatient.name}
            </p>
          )}
          {patientMustChangePassword && hasDailyLoginBonusPending(selectedPatient.id) && (
            <div className="flex justify-center items-center gap-1.5 flex-wrap" dir="rtl">
              <RewardLabel
                xp={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.xp}
                coins={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.coins}
              />
              <span className="text-xs text-slate-500">כניסה יומית</span>
            </div>
          )}
        </div>

        {/* טור 3 — ימין: כפתורים */}
        <div className="shrink-0 justify-self-end flex flex-nowrap items-center justify-end gap-1.5">
          {sessionRole === 'patient' ? (
            <>
              <button
                type="button"
                onClick={() => setRedFlagOpen(true)}
                title="דיווח דחוף — Red Flag"
                className="flex shrink-0 items-center justify-center min-h-11 min-w-11 rounded-xl border border-red-200 bg-red-50/90 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
                aria-label="דיווח דחוף — Red Flag"
              >
                <span
                  className="red-flag-siren-stage inline-flex h-6 w-6 items-center justify-center [direction:ltr]"
                  aria-hidden
                >
                  <span className="red-flag-siren-rotor inline-flex h-6 w-6 items-center justify-center">
                    {redFlagSirenAssetFailed ? (
                      <Siren className="h-6 w-6 shrink-0" strokeWidth={2.25} />
                    ) : (
                      <img
                        src="/image_5f21a1.png"
                        alt=""
                        width={24}
                        height={24}
                        decoding="async"
                        draggable={false}
                        className="h-6 w-6 max-h-6 object-contain pointer-events-none select-none"
                        style={{ transform: 'translateZ(0.5px)' }}
                        onError={() => setRedFlagSirenAssetFailed(true)}
                      />
                    )}
                  </span>
                </span>
              </button>
              {!patientMustChangePassword && (
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(true)}
                  title="הגדרות"
                  className="flex shrink-0 items-center justify-center min-h-11 min-w-11 rounded-xl hover:bg-slate-50 border border-slate-200 text-slate-700"
                  aria-label="הגדרות"
                >
                  <Settings className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                title="התנתקות"
                className="flex shrink-0 items-center justify-center gap-1 min-h-11 ps-2 pe-2.5 rounded-xl hover:bg-slate-50 border border-slate-200 text-slate-700"
                aria-label="התנתקות"
              >
                <LogOut className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold hidden sm:inline">יציאה</span>
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex-1 px-4 py-4 pb-36">
        {portalTab === 'heroes' && selectedPatient && !patientMustChangePassword && <PatientHeroesHallTab />}

        {portalTab === 'home' && !!selectedPatient && (
          <section className="mb-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 overflow-hidden mx-auto w-full max-w-md touch-pan-y">
              <div className="relative w-full max-w-[300px] mx-auto aspect-[9/16] min-h-[420px] max-h-[min(640px,68dvh)] isolate overscroll-y-contain">
                <BodyMap3D
                  activeAreas={exercises.length === 0 ? [] : activeAreas}
                  primaryArea={selectedPatient.primaryBodyArea}
                  clinicalArea={selectedPatient.primaryBodyArea}
                  selfCareSelectedAreas={selectedZones}
                  secondaryClinicalBodyAreas={selectedPatient.secondaryClinicalBodyAreas}
                  stableInteraction={false}
                  patientPortalInteractive
                  painByArea={selectedPatient.analytics.painByArea}
                  level={selectedPatient.level}
                  xp={selectedPatient.xp}
                  xpForNextLevel={selectedPatient.xpForNextLevel}
                  streak={displayStreak}
                  strengthenedAreasToday={strengthenedAreasToday}
                  injuryHighlightSegments={selectedPatient.injuryHighlightSegments}
                  avatarScale={0.9}
                  equippedGear={buildEquippedGearSnapshot(patientGearState)}
                  minHeightPx={0}
                  wrapperClassName="h-full w-full min-h-0"
                  onAreaClick={handleAvatarZoneClick}
                />
              </div>
            </div>

            {!patientMustChangePassword && totalMissions > 0 && (
              <div
                role="button"
                tabIndex={0}
                onClick={goToDailyProgressTasks}
                onKeyDown={(e) => activateOnEnterSpace(e, goToDailyProgressTasks)}
                className={`mt-3 rounded-2xl p-4 min-h-[52px] border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/40 shadow-md shadow-emerald-900/5 ${PORTAL_PROGRESS_NAV_SURFACE}`}
                aria-label="התקדמות יומית — מעבר למשימות באימונים"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-bold text-emerald-950">התקדמות היום</span>
                  <span className="text-sm font-black tabular-nums text-emerald-800">
                    {completedMissionCount}/{totalMissions} משימות
                  </span>
                </div>
                <div
                  className="h-3 rounded-full bg-emerald-100/90 overflow-hidden border border-emerald-200/60 pointer-events-none"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full motion-safe:transition-all motion-safe:duration-500 ease-out bg-gradient-to-l from-emerald-500 to-medical-success shadow-sm"
                    style={{
                      width: `${totalMissions > 0 ? Math.round((completedMissionCount / totalMissions) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-emerald-900/75 mt-2 leading-relaxed pointer-events-none">
                  לחצו למעבר לאימונים ולהשלמת המשימות להיום.
                </p>
              </div>
            )}

            {!patientMustChangePassword && (
              <button
                type="button"
                onClick={() => setPainAnalyticsOpen(true)}
                className="mt-3 w-full text-start rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 overflow-hidden cursor-pointer touch-manipulation motion-safe:transition-[box-shadow,transform,border-color] motion-safe:duration-200 hover:shadow-lg hover:border-teal-200/90 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                aria-label="מעקב כאב — פתיחת גרף וניתוח מגמה"
              >
                <div className="px-4 pt-3 pb-2 border-b border-slate-100/90 bg-slate-50/60 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-medical-primary shrink-0" aria-hidden />
                    <p className="text-sm font-bold text-slate-900">מעקב כאב</p>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    דיווחים ומגמות — לחיצה לגרף וניתוח מגמה
                  </p>
                </div>
                <div className="min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 pointer-events-none">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 leading-snug">
                      ממוצע {selectedPatient.analytics.averageOverallPain.toFixed(1)}/10
                      {lastPainRecord != null && (
                        <span className="text-slate-600">
                          {' '}
                          · אחרון {lastPainRecord.painLevel}/10
                        </span>
                      )}
                      {lastPainRecord == null && ' · עדיין אין דיווחים — לחצו לפרטים'}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-medical-primary shrink-0">גרף</span>
                </div>
              </button>
            )}

            {unreadForPatient > 0 && (
              <button
                type="button"
                onClick={() => navigate(portalHrefForTab('messages'))}
                className="mt-3 w-full rounded-2xl border-2 border-medical-primary/25 bg-white px-4 py-3 flex items-center justify-between gap-3 text-start shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle className="w-6 h-6 text-medical-primary shrink-0" />
                  <span className="text-base font-bold text-slate-900">הודעות חדשות מהמטפל</span>
                </div>
                <span className="shrink-0 min-w-[1.75rem] h-8 px-2 rounded-full text-sm font-black flex items-center justify-center text-white bg-medical-primary">
                  {unreadForPatient > 9 ? '9+' : unreadForPatient}
                </span>
              </button>
            )}
            {selectedPatient && !patientMustChangePassword && (
              <button
                type="button"
                onClick={() => navigate(portalHrefForTab('heroes'))}
                className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3.5 flex items-center justify-center gap-2 text-base font-bold text-slate-800 shadow-sm"
              >
                <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
                היכל גיבורים
              </button>
            )}

            {!patientMustChangePassword && (
              <div
                id="patient-clinical-dashboard"
                className="scroll-mt-28 mt-8 mb-2 mx-auto w-full max-w-md"
              >
                <ClinicalMonthCalendar dayMap={patientDayMap} clinicalToday={clinicalToday} />
              </div>
            )}
          </section>
        )}

        {portalTab === 'messages' && selectedPatient && (
          <section className="mb-5 rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 overflow-hidden flex flex-col min-h-[min(70vh,520px)] max-h-[calc(100dvh-8rem)]">
            <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-7 h-7 text-medical-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold text-slate-900">מרכז הודעות</p>
                  <p className="text-sm text-slate-500 truncate">שיחה עם {careGiverName}</p>
                </div>
                {unreadForPatient > 0 && (
                  <span className="shrink-0 min-w-[1.75rem] h-8 px-2 rounded-full text-sm font-black flex items-center justify-center text-white bg-medical-primary">
                    {unreadForPatient > 9 ? '9+' : unreadForPatient}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3 p-3 min-h-0 bg-slate-50/80">
              <div className="flex-1 overflow-y-auto space-y-2 min-h-[160px] ps-0.5 pe-0.5">
                {portalMessages.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-10">אין הודעות עדיין</p>
                ) : (
                  [...portalMessages]
                    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                    .map((msg) => {
                      const fromMe = msg.fromPatient && !msg.aiClinicalAlert;
                      const isAi = !!msg.aiClinicalAlert;
                      const tier = msg.clinicalSafetyTier;
                      const alignEnd = fromMe;
                      const alertStyle =
                        isAi && tier === 'emergency'
                          ? { background: '#fef2f2', borderColor: '#f87171' }
                          : isAi && tier === 'high_priority'
                            ? { background: '#fffbeb', borderColor: '#fbbf24' }
                            : isAi
                              ? { background: '#eef2ff', borderColor: '#a5b4fc' }
                              : fromMe
                                ? { background: '#ecfdf5', borderColor: '#6ee7b7' }
                                : { background: '#ffffff', borderColor: '#e2e8f0' };
                      const senderLabel = isAi
                        ? tier === 'emergency'
                          ? 'עדכון דחוף'
                          : tier === 'high_priority'
                            ? 'עדכון בטיחות'
                            : 'עדכון מהמערכת'
                        : fromMe
                          ? 'אני'
                          : careGiverName;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${alignEnd ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className="max-w-[88%] rounded-2xl px-3 py-2.5 border-2 shadow-sm"
                            style={alertStyle}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              {isAi ? (
                                <Bot className="w-4 h-4 text-indigo-600 shrink-0" />
                              ) : (
                                <User className="w-4 h-4 text-medical-primary shrink-0" />
                              )}
                              <span className="text-xs font-bold text-slate-600">{senderLabel}</span>
                            </div>
                            <p className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {msg.content}
                            </p>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-500">
                                {new Date(msg.timestamp).toLocaleString('he-IL', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
              <div className="flex gap-2 items-end border-t-2 border-slate-200 pt-3 shrink-0">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`הודעה ל־${careGiverShort}…`}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-primary/30 bg-white"
                />
                <button
                  type="button"
                  disabled={!messageText.trim()}
                  onClick={() => {
                    if (!selectedPatient || !messageText.trim()) return;
                    sendPatientMessage(selectedPatient.id, messageText.trim());
                    setMessageText('');
                  }}
                  className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center text-white disabled:opacity-40 bg-medical-primary shadow-md"
                  aria-label="שלח הודעה"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </section>
        )}

        {portalTab === 'activity' && (
        <>
        <div
          className={
            trainingAiPlanModalOpen
              ? 'pointer-events-none select-none opacity-[0.35] motion-safe:transition-opacity motion-safe:duration-200'
              : undefined
          }
          aria-hidden={trainingAiPlanModalOpen || undefined}
        >
        <h1
          id="today-missions"
          className="text-xl font-bold text-slate-900 mb-2 tracking-tight scroll-mt-28"
        >
          המשימות להיום
        </h1>
        <p className="text-base text-slate-600 mb-4 leading-relaxed">
          קודם תרגילי השיקום מהמטפל, אחריהם תרגילי כוח לאזורים הירוקים במפה (בלשונית <strong>בית</strong>).
          בכל משימה: כפתור <strong>נגן</strong> פותח וידאו, טיימר 30 שניות ודיווח מאמץ. כוח/פרהאב מעניקים
          חצי מנקודות ה-XP והמטבעות לעומת השיקום.
        </p>

        {loadSafetyNudge && (
          <div
            className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed"
            role="status"
          >
            <p className="font-bold text-amber-900 mb-1">עדכון בטיחות</p>
            <p>{loadSafetyNudge}</p>
            <button
              type="button"
              onClick={() => setLoadSafetyNudge(null)}
              className="mt-2 text-xs font-semibold text-amber-800 underline"
            >
              סגירה
            </button>
          </div>
        )}

        {redFlagPortalLock && (
          <div
            className="mb-4 rounded-2xl border-2 border-red-600 bg-red-50 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm font-black text-red-950">תרגול נעול זמנית</p>
            <p className="text-xs text-red-900 mt-1 leading-relaxed">
              התרגילים נעולים זמנית עקב דיווח על כאב חריג. המטפל עודכן ויצור קשר בהקדם.
            </p>
          </div>
        )}

        {exerciseSafetyLocked && (
          <div
            className="mb-4 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm font-black text-red-950">תרגול נעול</p>
            <p className="text-xs text-red-900 mt-1 leading-relaxed">
              רשימת התרגילים חסומה עד שמטפל ישחרר לאחר בדיקה. אם יש חשש לחירום — התקשרו ל־101.
            </p>
          </div>
        )}

        {exercises.length === 0 && selectedZones.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-teal-200 p-8 text-center text-teal-800/80 text-sm"
            style={{ background: 'rgba(240, 253, 250, 0.6)' }}
          >
            אין תרגילים בתוכנית. המטפל יכול להוסיף תרגילים ממסך ניהול התוכנית, או לבחור אזורי כוח במפה.
          </div>
        ) : combinedMissionItems.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6 leading-relaxed">
            אין תרגילי שיקום שמתאימים לאזור המוגדר. בחרו אזורים ירוקים לתרגילי כוח, או פנו למטפל לעדכון
            התוכנית.
          </p>
        ) : (
          <div
            className={`relative flex flex-col ${exercisesLocked ? 'pointer-events-none select-none opacity-[0.38]' : ''}`}
          >
            {exercisesLocked && (
              <div
                className="absolute inset-0 z-10 rounded-2xl bg-red-950/5 pointer-events-none"
                aria-hidden
              />
            )}
            <ul className="space-y-4 flex flex-col">
              {combinedMissionItems.map((row, i) => {
                const idx = i + 1;
                if (row.kind === 'rehab') {
                  const ex = row.exercise;
                  const done = completedSet.has(ex.id);
                  const displaySets = ex.patientSets;
                  const displayReps = ex.patientReps;
                  const repsShort =
                    ex.holdSeconds && displayReps === 0
                      ? formatTime(ex.holdSeconds)
                      : ex.holdSeconds && displayReps > 0
                        ? `${displayReps}+${formatTime(ex.holdSeconds)}`
                        : `${displayReps}חז'`;
                  return (
                    <li key={`rehab-${ex.id}`} className="w-full">
                      <PortalExerciseCard
                        variant="rehab"
                        index={idx}
                        isCompleted={done}
                        title={ex.name}
                        subtitle={`${displaySets}× ${repsShort} · ${ex.muscleGroup} · שיקום`}
                        xpReward={ex.xpReward}
                        videoUrl={ex.videoUrl ?? null}
                        onOpenTraining={() =>
                          setExerciseVideoModal({
                            kind: 'rehab',
                            exercise: ex,
                            xpAward: ex.xpReward,
                            coinsAward: PATIENT_REWARDS.EXERCISE_COMPLETE.coins,
                          })
                        }
                        onOpenDetails={() => openExerciseDetail(ex)}
                        disabled={exercisesLocked}
                        typeKey={ex.type}
                        isCustomExercise={ex.isCustom}
                        rewardLabelXp={exerciseBaseXp(ex.xpReward)}
                        rewardLabelCoins={PATIENT_REWARDS.EXERCISE_COMPLETE.coins}
                      />
                    </li>
                  );
                }
                const { area, exercise: ex, strengthTier } = row;
                const selfXp = Math.max(1, Math.floor(ex.xpReward * 0.5));
                const selfCoins = PATIENT_REWARDS.EXERCISE_COMPLETE.coins;
                const sid = ex.id;
                const done = completedSet.has(sid);
                const repsLine = ex.repsAreSeconds
                  ? `${ex.sets}× ${ex.reps}ש״`
                  : `${ex.sets}× ${ex.reps}חז'`;
                const tierLabel =
                  strengthTier === 0 ? 'קל' : strengthTier === 1 ? 'בינוני' : 'קשה';
                return (
                  <li key={`strength-${area}-${ex.id}`} className="w-full">
                    <PortalExerciseCard
                      variant="selfCare"
                      index={idx}
                      isCompleted={done}
                      title={ex.name}
                      subtitle={`${repsLine} · ${bodyAreaLabels[area]} · כוח (½ XP) · רמה: ${tierLabel}`}
                      xpReward={selfXp}
                      videoUrl={ex.videoUrl}
                      onOpenTraining={() =>
                        setExerciseVideoModal({
                          kind: 'selfCare',
                          bodyArea: area,
                          exercise: ex,
                          xpAward: selfXp,
                          coinsAward: selfCoins,
                        })
                      }
                      disabled={exercisesLocked}
                      selfCareStrengthTier={strengthTier}
                      onSelfCareStrengthTierChange={(tier) =>
                        setSelfCareStrengthTier(selectedPatient.id, area, tier)
                      }
                      rewardLabelXp={exerciseBaseXp(selfXp)}
                      rewardLabelCoins={selfCoins}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        </div>
        </>
        )}

        {portalTab === 'gear' && selectedPatient && (
          <GearStoreArmory
            patientId={selectedPatient.id}
            coins={selectedPatient.coins}
            patientXp={selectedPatient.xp}
            gear={patientGearState}
            purchaseGearItem={purchaseGearItem}
            equipGearItem={equipGearItem}
            unequipGearSlot={unequipGearSlot}
          />
        )}
      </div>

      {import.meta.env.DEV && <PortalPatientDebugPanel />}

      <nav
        className="fixed bottom-0 inset-x-0 z-[35] rounded-t-2xl border border-slate-200/90 border-b-0 flex justify-center bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.08)]"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        aria-label="ניווט פורטל"
      >
        <div className="flex w-full max-w-lg px-1">
          <button
            type="button"
            onClick={() => {
              navigate('/patient-portal');
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl active:bg-slate-50 touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 ${
              portalTab === 'home' || portalTab === 'heroes'
                ? 'text-medical-primary'
                : 'text-slate-500'
            }`}
            aria-label="בית — מפת גוף"
          >
            <Home className="w-7 h-7 shrink-0" strokeWidth={portalTab === 'home' || portalTab === 'heroes' ? 2.5 : 2} />
            בית
          </button>
          <button
            type="button"
            onClick={() => navigate(portalHrefForTab('activity'))}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl active:bg-slate-50 touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 ${
              portalTab === 'activity' ? 'text-medical-primary' : 'text-slate-500'
            }`}
            aria-label="אימונים ומשימות"
          >
            <StackedDumbbellsIcon
              className="w-7 h-7 shrink-0"
              emphasized={portalTab === 'activity'}
            />
            אימונים
          </button>
          <button
            type="button"
            onClick={() => navigate(portalHrefForTab('gear'))}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl active:bg-slate-50 touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 ${
              portalTab === 'gear' ? 'text-medical-primary' : 'text-slate-500'
            }`}
            aria-label="חנות ציוד"
          >
            <ShoppingBag className="w-7 h-7 shrink-0" strokeWidth={portalTab === 'gear' ? 2.5 : 2} />
            חנות
          </button>
          <button
            type="button"
            onClick={() => navigate(portalHrefForTab('messages'))}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl active:bg-slate-50 touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 ${
              portalTab === 'messages' ? 'text-medical-primary' : 'text-slate-500'
            }`}
            aria-label="הודעות"
          >
            <span className="relative inline-flex">
              <MessageCircle className="w-7 h-7 shrink-0" strokeWidth={portalTab === 'messages' ? 2.5 : 2} />
              {unreadForPatient > 0 && portalTab !== 'messages' && (
                <span className="absolute -top-1 -end-1 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-600 text-[10px] font-black text-white flex items-center justify-center border-2 border-white">
                  {unreadForPatient > 9 ? '!' : unreadForPatient}
                </span>
              )}
            </span>
            צ&apos;אט
          </button>
        </div>
      </nav>

      {(portalTab === 'home' || portalTab === 'activity') &&
        selectedPatient &&
        !patientMustChangePassword &&
        approvedKnowledgeFacts.length > 0 && (
          <DidYouKnowBubble
            patient={selectedPatient}
            approvedFacts={approvedKnowledgeFacts}
            onCollectReward={(articleId, opts) =>
              markArticleAsRead(selectedPatient.id, articleId, opts)
            }
            hasReadArticle={hasReadArticle}
          />
        )}

      <GordyCompanion
        eligible={gordyCompanionEligible}
        exerciseSafetyLocked={exerciseSafetyLocked}
        redFlagPortalLock={redFlagPortalLock}
        transient={gordyTransient}
        celebrateBurstKey={gordyVictoryBurst}
        contextAnimationName={gordyCompanionContextAnimation}
      />

      {sessionCelebrationBurst > 0 && (
        <GordyFullScreenCelebration
          burstKey={sessionCelebrationBurst}
          onClose={endSessionCelebration}
        />
      )}

      <GuardianAssistantFAB
        patient={selectedPatient}
        exerciseCount={combinedMissionItems.length}
        exercises={exercises}
        variant="portal"
        onSubmitGuardianRepsRequest={(exerciseId, exerciseName, fromReps, toReps) =>
          submitGuardianRepsIncreaseRequest(
            selectedPatient.id,
            exerciseId,
            exerciseName,
            fromReps,
            toReps
          )
        }
        onTherapistClinicalAlert={(detail) => sendAiClinicalAlert(selectedPatient.id, detail)}
        onPatientEmergencyText={() =>
          setGordyTransient({
            key: `redflag_text_${Date.now()}`,
            mood: 'concerned',
            bubble:
              'זיהינו ניסוח שעשוי להצביע על מצב דחוף — צוות הטיפול עודכן. אם יש סיכון מיידי, התקשרו ל־101.',
            until: Date.now() + 9000,
          })
        }
        hidden={
          !!detailFor ||
          !!reportFor ||
          !!exerciseVideoModal ||
          exercisesLocked ||
          patientMustChangePassword ||
          sessionCelebrationBurst > 0 ||
          trainingAiPlanModalOpen
        }
      />

      {selectedPatient && (
        <PatientAiPlanSuggestionModal
          open={trainingAiPlanModalOpen}
          loading={trainingAiPlanModalLoading}
          infoMessage={trainingAiPlanModalInfo}
          suggestion={trainingAiPlanModalSuggestion}
          onApprove={handleTrainingAiPlanApprove}
          onDecline={acknowledgeTrainingAiPlanModal}
          onClose={acknowledgeTrainingAiPlanModal}
        />
      )}

      <PatientRedFlagEmergencyModal
        open={redFlagOpen}
        onClose={() => setRedFlagOpen(false)}
        patientId={selectedPatient.id}
        patientName={selectedPatient.name}
        therapistId={selectedPatient.therapistId}
        defaultBodyArea={selectedPatient.primaryBodyArea}
      />

      <PainAnalyticsModal
        open={painAnalyticsOpen}
        onClose={() => setPainAnalyticsOpen(false)}
        painHistory={selectedPatient.analytics.painHistory}
        clinicalToday={clinicalToday}
      />

      <ExerciseDetailModal
        exercise={detailFor}
        onClose={closeExerciseDetail}
        onRequestComplete={handleRequestCompleteFromDetail}
        isCompleted={detailFor ? completedSet.has(detailFor.id) : false}
      />

      <ExerciseReportModal
        exercise={reportFor}
        onClose={() => {
          setReportFor(null);
          setReportInitialEffort(undefined);
        }}
        onSubmit={handleReportSubmit}
        initialEffort={reportInitialEffort}
      />

      {exerciseVideoModal != null && (
        <ExerciseVideoTimerModal
          key={`${exerciseVideoModal.kind}-${exerciseVideoModal.exercise.id}`}
          open
          title={exerciseVideoModal.exercise.name}
          videoUrl={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.videoUrl ?? ''
              : exerciseVideoModal.exercise.videoUrl
          }
          description={exerciseVideoModal.exercise.instructions}
          clinicalRegressionHint={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.clinicalRegressionHint ?? undefined
              : exerciseVideoModal.exercise.regressionHint
          }
          clinicalProgressionHint={
            exerciseVideoModal.kind === 'rehab'
              ? exerciseVideoModal.exercise.clinicalProgressionHint ?? undefined
              : exerciseVideoModal.exercise.progressionHint
          }
          variant={exerciseVideoModal.kind === 'rehab' ? 'rehab' : 'selfCare'}
          xpAward={exerciseVideoModal.xpAward}
          coinsAward={exerciseVideoModal.coinsAward}
          primeSeconds={30}
          onClose={() => setExerciseVideoModal(null)}
          onComplete={handleTrainingComplete}
        />
      )}

      <EmergencyStopModal
        open={
          !!selectedPatient &&
          emergencyModalPatientId === selectedPatient.id
        }
        syndromeDetailHebrew={latestEmergencyReason}
        onAcknowledge={() => setEmergencyModalPatientId(null)}
        onOpenTherapistMessage={() => {
          setEmergencyModalPatientId(null);
          setMessageText(
            'דחוף: דיווחתי על תסמינים שעלולים לחייב בדיקה רפואית דחופה. נא ליצור קשר בהקדם.'
          );
          navigate(portalHrefForTab('messages'));
        }}
      />

      {sessionRole === 'patient' && patientMustChangePassword && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 118, 110, 0.35)' }}
          dir="rtl"
        >
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl p-6"
            style={{ background: '#ffffff', borderColor: '#99f6e4' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pw-gate-title"
          >
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-6 h-6 text-teal-600" strokeWidth={2} aria-hidden />
              <h2 id="pw-gate-title" className="text-lg font-bold text-slate-800">
                עדכון סיסמה נדרש
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              זו הכניסה הראשונה שלך לפורטל. לבטיחות, בחר סיסמה אישית חדשה (לפחות 6 תווים).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה נוכחית</label>
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה חדשה</label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">אימות סיסמה</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {pwFormError && (
              <p className="mt-3 text-sm text-red-600">{pwFormError}</p>
            )}
            <button
              type="button"
              onClick={submitPasswordChange}
              className="mt-5 w-full py-3 rounded-2xl font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
            >
              שמירה והמשך
            </button>
          </div>
        </div>
      )}

      {sessionRole === 'patient' && !patientMustChangePassword && selectedPatient && (
        <PatientPortalSettingsModal
          open={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          patient={selectedPatient}
          patientLoginId={patientLoginId}
          changePatientLoginId={changePatientLoginId}
          completePatientPasswordChange={completePatientPasswordChange}
        />
      )}
    </div>
  );
}
