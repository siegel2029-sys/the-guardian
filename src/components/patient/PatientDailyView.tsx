import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getStrengthenedBodyAreasToday } from '../../utils/strengthenedAreasToday';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Home, ShoppingBag } from 'lucide-react';
import { usePatientRoster, usePatientChat, usePatientExercisePlans, usePatientGamification } from '../../context/patientDomainHooks';
import { useAuth } from '../../context/AuthContext';
import { type GuardiTransientAppearance } from './GordyCompanion';
import { useOptionalRehabPool, type StrengthMissionRow } from './useOptionalRehabPool';
import PatientPortalMessagesTab from './PatientPortalMessagesTab';
import PatientPortalHomeAiChatDock from './PatientPortalHomeAiChatDock';
import { PatientDidYouKnowAnchorButton } from './PatientDidYouKnowPortal';
import { getStrengthChainForArea } from '../../data/strengthExerciseDatabase';
import { bodyAreaBlocksSelfCare } from '../../body/bodyPickMapping';
import type { PatientExercise, BodyArea, DailySession } from '../../types';
import { validateNewPassword } from '../../lib/passwordPolicy';
import StackedDumbbellsIcon from '../icons/StackedDumbbellsIcon';
import GearStoreArmory from './GearStoreArmory';
import PortalPatientDebugPanel from './PortalPatientDebugPanel';
import Pilot11GamificationDebugPanel from './Pilot11GamificationDebugPanel';
import { isPilot11GamificationDebugPatient } from '../../utils/pilot11GamificationDebug';
import { evaluateAiProgramLongitudinalGate } from '../../ai/aiProgramLongitudinalGate';
import { computeStreakForPatient } from '../../utils/exerciseStreak';
import {
  getTotalActiveDaysForScenery,
} from '../../hooks/useGamification';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import { usePatientReminderInfrastructure } from '../../hooks/usePatientReminderInfrastructure';
import {
  portalHrefForTab,
  PatientLoadingGate,
  tabFromPortalPath,
  type PortalTab,
} from './patientPortalRouting';
import { usePatientTrainingOrchestration } from './usePatientTrainingOrchestration';
import PatientPortalChrome from './PatientPortalChrome';
import PatientPortalHomeSection from './PatientPortalHomeSection';
import PatientPortalActivitySection from './PatientPortalActivitySection';
import PatientDailyViewModals from './PatientDailyViewModals';
import ErrorBoundary from '../ui/error-boundary';

const EMPTY_COMPLETED_IDS: string[] = [];
const EMPTY_EXERCISES: PatientExercise[] = [];
const EMPTY_BODY_AREAS: BodyArea[] = [];

/** תצוגת יום למטופל — מוצגת רק ב־/patient-portal (מפת גוף, תרגילים, לוח שנה). */
export default function PatientDailyView() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessionRole,
    logout,
    patientMustChangePassword,
    completePatientPasswordChange,
    usesSupabaseSession,
  } = useAuth();
  const { selectedPatient } = usePatientRoster();
  const {
    messages,
    getPatientMessages,
    emergencyModalPatientId,
    setEmergencyModalPatientId,
    safetyAlerts,
  } = usePatientChat();
  const {
    exercisePlans,
    getExercisePlan,
    dailySessions,
    submitExerciseReport,
    clinicalToday,
    dailyHistoryByPatient,
    isPatientExerciseSafetyLocked,
    getSelfCareZones,
    toggleSelfCareZone,
    logSelfCareSession,
    appendPatientExerciseFinishReport,
    getPatientExerciseFinishReports,
    getSelfCareStrengthTier,
    setSelfCareStrengthTier,
  } = usePatientExercisePlans();
  const {
    hasDailyLoginBonusPending,
    getPatientGear,
    purchaseGearItem,
    equipGearItem,
    unequipGearSlot,
    purchaseStoreItem,
    equipStoreItem,
    unequipStoreItem,
    claimDailyLoginBonusIfNeeded,
    rewardFeedback,
    clearRewardFeedback,
  } = usePatientGamification();

  const totalActiveDaysForScenery = useMemo(() => {
    if (!selectedPatient) return 1;
    const map = dailyHistoryByPatient[selectedPatient.id];
    return getTotalActiveDaysForScenery(selectedPatient.joinDate, clinicalToday, map);
  }, [selectedPatient, dailyHistoryByPatient, clinicalToday]);

  const portalPatientLabel = useMemo(
    () => (selectedPatient ? getPatientDisplayName(selectedPatient) : ''),
    [selectedPatient?.id, selectedPatient?.name]
  );

  const [messageDraftSeed, setMessageDraftSeed] = useState<string | null>(null);
  const consumeMessageDraftSeed = useCallback(() => setMessageDraftSeed(null), []);
  const [painAnalyticsOpen, setPainAnalyticsOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwFormError, setPwFormError] = useState<string | null>(null);
  const [redFlagOpen, setRedFlagOpen] = useState(false);
  const [redFlagSirenAssetFailed, setRedFlagSirenAssetFailed] = useState(false);

  const [portalTab, setPortalTab] = useState<PortalTab>(() =>
    tabFromPortalPath(typeof window !== 'undefined' ? window.location.pathname : '/patient-portal')
  );
  const [, setGuardiTransient] = useState<GuardiTransientAppearance | null>(null);
  const handlePatientEmergencyText = useCallback(() => {
    // MUTED: Guardi encouragement pop-up disabled pending redesign.
  }, []);

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

  // MUTED: clear Guardi transient on tab change / TTL — left as no-ops while encouragement is off.
  useEffect(() => {
    setGuardiTransient(null);
  }, [portalTab]);

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

  /** תוכנית אימון: PatientContext (מקור לוגי useExercisePlan) — תמיד גרסה פעילה. */
  const session = useMemo((): DailySession | null => {
    if (!selectedPatient) return null;
    return (
      dailySessions.find(
        (s) => s.patientId === selectedPatient.id && s.date === clinicalToday
      ) ?? null
    );
  }, [dailySessions, selectedPatient?.id, clinicalToday]);
  const exercises = useMemo((): PatientExercise[] => {
    if (!selectedPatient?.id) return EMPTY_EXERCISES;
    const list = getExercisePlan(selectedPatient.id)?.exercises;
    return list && list.length > 0 ? list : EMPTY_EXERCISES;
  }, [
    selectedPatient?.id,
    selectedPatient?._exercisePlanCache,
    exercisePlans,
    getExercisePlan,
  ]);

  const activeAreas = useMemo(
    () => [...new Set(exercises.map((e) => e.targetArea))],
    [exercises]
  );

  const completedSet = useMemo(
    () => new Set(session?.completedIds ?? []),
    [session?.completedIds]
  );

  const { refetchExerciseLogCount } = usePatientReminderInfrastructure({
    patientId: selectedPatient?.id ?? null,
    active: sessionRole === 'patient' && usesSupabaseSession,
    portalTab,
  });

  useEffect(() => {
    if (!selectedPatient) return;
    void refetchExerciseLogCount();
  }, [selectedPatient?.id, completedSet.size, refetchExerciseLogCount]);

  const patientDayMap = useMemo(
    () =>
      selectedPatient ? dailyHistoryByPatient[selectedPatient.id] ?? {} : {},
    [selectedPatient?.id, dailyHistoryByPatient]
  );

  const displayStreak = useMemo(
    () =>
      selectedPatient
        ? computeStreakForPatient(selectedPatient, patientDayMap, clinicalToday)
        : 0,
    [selectedPatient?.id, patientDayMap, clinicalToday]
  );

  const exerciseSafetyLocked = selectedPatient
    ? isPatientExerciseSafetyLocked(selectedPatient.id)
    : false;
  const redFlagPortalLock = selectedPatient?.redFlagActive === true;
  const exercisesLocked = exerciseSafetyLocked || redFlagPortalLock;

  /** Green zones (excludes clinical); synced with 3D picks + context. */
  const selectedZones = useMemo((): BodyArea[] => {
    if (!selectedPatient?.id) return EMPTY_BODY_AREAS;
    const zones = getSelfCareZones(selectedPatient.id);
    return zones.length > 0 ? zones : EMPTY_BODY_AREAS;
  }, [
    selectedPatient?.id,
    selectedPatient?.injuryHighlightSegments,
    selectedPatient?.secondaryClinicalBodyAreas,
    getSelfCareZones,
  ]);

  const strengthenedAreasToday = useMemo(() => {
    if (!selectedPatient?.id) return [] as BodyArea[];
    return getStrengthenedBodyAreasToday(getPatientExerciseFinishReports(selectedPatient.id));
  }, [selectedPatient?.id, getPatientExerciseFinishReports]);

  const prevPatientIdRef = useRef<string | undefined>(undefined);
  const bodyMapSectionRef = useRef<HTMLDivElement>(null);
  const [coinKick, setCoinKick] = useState(false);

  useEffect(() => {
    const pid = selectedPatient?.id;
    if (prevPatientIdRef.current !== undefined && pid !== prevPatientIdRef.current) {
      clearRewardFeedback();
    }
    prevPatientIdRef.current = pid;
  }, [selectedPatient?.id, clearRewardFeedback]);

  useEffect(() => {
    if (!selectedPatient?.id) return;
    claimDailyLoginBonusIfNeeded(selectedPatient.id);
  }, [selectedPatient?.id, clinicalToday, claimDailyLoginBonusIfNeeded]);

  useEffect(() => {
    if (!rewardFeedback) return;
    setCoinKick(true);
    // Daily login bonus still grants XP / header floaters; Guardi victory overlay muted.
    const t0 = window.setTimeout(() => setCoinKick(false), 720);
    const t1 = window.setTimeout(() => clearRewardFeedback(), 2400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [rewardFeedback?.id, clearRewardFeedback]);

  const clinicalRehabExercises = useMemo(() => {
    if (!selectedPatient?.id || exercises.length === 0) return EMPTY_EXERCISES;
    const mandatory = exercises.filter((e) => !e.isOptional).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    const optional = exercises.filter((e) => e.isOptional).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return [...mandatory, ...optional];
  }, [exercises, selectedPatient?.id]);

  const aiProgramLongitudinalGate = useMemo(() => {
    if (!selectedPatient) return null;
    const base = evaluateAiProgramLongitudinalGate({
      patient: selectedPatient,
      clinicalToday,
      dayMap: patientDayMap,
      rehabExerciseCount: clinicalRehabExercises.length,
    });
    // Never surface plan-adjustment suggestions on the patient portal (no popups).
    // Therapist-facing 3-day review runs via clinical-review-cron + Sidebar panels only.
    return { ...base, shouldSuggest: false };
  }, [
    selectedPatient?.id,
    selectedPatient?.analytics?.sessionHistory,
    clinicalToday,
    patientDayMap,
    clinicalRehabExercises.length,
  ]);

  const mandatoryRehabExercises = useMemo(
    () => clinicalRehabExercises.filter((e) => !e.isOptional),
    [clinicalRehabExercises]
  );

  const optionalRehabExercises = useMemo(
    () => clinicalRehabExercises.filter((e) => e.isOptional),
    [clinicalRehabExercises]
  );

  const strengthMissionRows = useMemo((): StrengthMissionRow[] => {
    if (!selectedPatient?.id) return [];
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
  }, [selectedZones, selectedPatient?.id, getSelfCareStrengthTier]);

  const completedIdsForUnlock = session?.completedIds ?? EMPTY_COMPLETED_IDS;

  const optionalPool = useOptionalRehabPool({
    optionalRehabExercises,
    strengthMissionRows,
    completedIdsForUnlock,
    exercisesLocked,
    setGuardiTransient,
    selectedPatientId: selectedPatient?.id,
    clinicalToday,
    dailySessions,
  });

  const training = usePatientTrainingOrchestration({
    selectedPatient,
    getExercisePlan,
    exercises,
    clinicalToday,
    exercisesLocked,
    optionalPool,
    submitExerciseReport,
    appendPatientExerciseFinishReport,
    logSelfCareSession,
    getSelfCareStrengthTier,
  });

  /** ספירת משימות: כל תרגילי התוכנית שהמטפל הגדיר + תרגילי כוח (אזורי בחירה) */
  const totalMissions = exercises.length + strengthMissionRows.length;
  const completedMissionCount = useMemo(() => {
    let n = 0;
    for (const e of exercises) {
      if (completedSet.has(e.id)) n += 1;
    }
    for (const row of strengthMissionRows) {
      if (completedSet.has(row.exercise.id)) n += 1;
    }
    return n;
  }, [exercises, strengthMissionRows, completedSet]);

  const missionListHasAny =
    mandatoryRehabExercises.length + optionalRehabExercises.length + strengthMissionRows.length > 0;

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

  const latestEmergencyReason = useMemo(() => {
    if (!selectedPatient) return undefined;
    const hit = [...safetyAlerts]
      .filter((a) => a.patientId === selectedPatient.id && a.severity === 'emergency')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return hit?.reasonHebrew;
  }, [safetyAlerts, selectedPatient?.id]);

  const portalFrozenUiLock =
    sessionRole === 'patient' && !!selectedPatient?.accountFrozen && !patientMustChangePassword;

  const handleAvatarZoneClick = (area: BodyArea) => {
    if (!selectedPatient) return;
    const inj = selectedPatient.injuryHighlightSegments ?? [];
    const sec = selectedPatient.secondaryClinicalBodyAreas ?? [];
    if (bodyAreaBlocksSelfCare(area, inj, sec)) {
      return;
    }
    toggleSelfCareZone(selectedPatient.id, area);
  };

  const submitPasswordChange = async () => {
    setPwFormError(null);
    if (pwNew !== pwConfirm) {
      setPwFormError('הסיסמאות החדשות אינן תואמות.');
      return;
    }
    const newPasswordError = validateNewPassword(pwNew);
    if (newPasswordError) {
      setPwFormError(newPasswordError);
      return;
    }
    const r = await completePatientPasswordChange(pwCurrent, pwNew);
    if (r === 'bad_current') setPwFormError('סיסמה נוכחית שגויה.');
    else if (r === 'invalid_new') setPwFormError('סיסמה חדשה קצרה מדי (לפחות 8 תווים, אותיות ומספרים).');
    else {
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    }
  };

  if (!selectedPatient) {
    // In patient-portal mode show a loading spinner while the data-fetch effect
    // runs (allPatients starts empty; getPatientById populates it asynchronously).
    // Returning null / a skeleton here instead of a "not found" screen prevents
    // the BodyMap3D canvas from being destroyed before patient data arrives.
    if (sessionRole === 'patient') {
      return <PatientLoadingGate onLogout={() => void logout().then(() => navigate('/login', { replace: true }))} />;
    }
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-medical-bg font-sans"
        dir="rtl"
      >
        <p className="text-slate-800 font-semibold text-base mb-4">לא נבחר מטופל או שהחשבון אינו מקושר.</p>
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

  const showPortalFrozenOverlay = portalFrozenUiLock && portalTab !== 'messages';

  const handleLogout = () => {
    void logout().then(() => navigate('/login', { replace: true }));
  };

  return (
    <div
      className="min-h-screen flex flex-col max-w-lg mx-auto w-full relative bg-medical-bg font-sans"
      dir="rtl"
    >
      {/* MUTED: Guardi victory sequence disabled pending redesign. */}
      <PatientPortalChrome
        portalPatientLabel={portalPatientLabel}
        xp={xp}
        xpForNextLevel={next}
        coins={selectedPatient.coins}
        level={selectedPatient.level}
        displayStreak={displayStreak}
        patientMustChangePassword={patientMustChangePassword}
        portalFrozenUiLock={portalFrozenUiLock}
        sessionRole={sessionRole}
        rewardFeedback={rewardFeedback}
        coinKick={coinKick}
        hasDailyLoginBonusPending={hasDailyLoginBonusPending(selectedPatient.id)}
        redFlagSirenAssetFailed={redFlagSirenAssetFailed}
        onRedFlagSirenAssetFailed={() => setRedFlagSirenAssetFailed(true)}
        onOpenRedFlag={() => setRedFlagOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onGoToClinicalDashboardFromStreak={goToClinicalDashboardFromStreak}
        onLogout={handleLogout}
      />

      <div
        className={
          portalTab === 'messages'
            ? 'flex-1 flex flex-col min-h-0 overflow-hidden px-3 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]'
            : 'flex-1 px-4 py-4 pb-36'
        }
      >
        {(portalTab === 'home' || portalTab === 'activity') &&
          !training.exerciseVideoModal &&
          !training.trainingFeedbackOpen && <PatientDidYouKnowAnchorButton />}
        {portalTab === 'home' && (
          <ErrorBoundary variant="section" scopeLabel="PortalHome">
            <PatientPortalHomeSection
              selectedPatient={selectedPatient}
              bodyMapSectionRef={bodyMapSectionRef}
              activeAreas={activeAreas}
              selectedZones={selectedZones}
              clinicalToday={clinicalToday}
              totalActiveDaysForScenery={totalActiveDaysForScenery}
              displayStreak={displayStreak}
              optionalGlowBoost={training.optionalGlowBoost}
              strengthenedAreasToday={strengthenedAreasToday}
              patientGearState={patientGearState}
              onAvatarZoneClick={handleAvatarZoneClick}
              patientMustChangePassword={patientMustChangePassword}
              totalMissions={totalMissions}
              completedMissionCount={completedMissionCount}
              onGoToDailyProgressTasks={goToDailyProgressTasks}
              onOpenPainAnalytics={() => setPainAnalyticsOpen(true)}
              unreadForPatient={unreadForPatient}
              patientDayMap={patientDayMap}
              exercisesLength={exercises.length}
            />
          </ErrorBoundary>
        )}

        {portalTab === 'messages' && (
          <ErrorBoundary variant="section" scopeLabel="PortalMessages">
            <PatientPortalMessagesTab
              patient={selectedPatient}
              draftSeed={messageDraftSeed}
              onDraftSeedConsumed={consumeMessageDraftSeed}
            />
          </ErrorBoundary>
        )}

        {portalTab === 'activity' && (
          <ErrorBoundary variant="section" scopeLabel="PortalActivity">
            <PatientPortalActivitySection
              selectedPatient={selectedPatient}
              aiProgramLongitudinalGate={aiProgramLongitudinalGate}
              patientMustChangePassword={patientMustChangePassword}
              exercisesLocked={exercisesLocked}
              redFlagPortalLock={redFlagPortalLock}
              exerciseSafetyLocked={exerciseSafetyLocked}
              aiSteadyBannerDismissed={training.aiSteadyBannerDismissed}
              onDismissAiSteadyBanner={() => training.setAiSteadyBannerDismissed(true)}
              loadSafetyNudge={training.loadSafetyNudge}
              onDismissLoadSafetyNudge={() => training.setLoadSafetyNudge(null)}
              exercises={exercises}
              selectedZones={selectedZones}
              missionListHasAny={missionListHasAny}
              mandatoryRehabExercises={mandatoryRehabExercises}
              completedSet={completedSet}
              optionalPool={optionalPool}
              openExerciseTrainingModal={training.openExerciseTrainingModal}
              setSelfCareStrengthTier={setSelfCareStrengthTier}
            />
          </ErrorBoundary>
        )}

        {portalTab === 'gear' && (
          <ErrorBoundary variant="section" scopeLabel="PortalGear">
            <GearStoreArmory
              patientId={selectedPatient.id}
              coins={selectedPatient.coins}
              patientXp={selectedPatient.xp}
              gear={patientGearState}
              ownedStoreItemIds={selectedPatient.ownedStoreItemIds ?? []}
              equippedItems={selectedPatient.equippedItems ?? []}
              purchaseGearItem={purchaseGearItem}
              equipGearItem={equipGearItem}
              unequipGearSlot={unequipGearSlot}
              purchaseStoreItem={purchaseStoreItem}
              equipStoreItem={equipStoreItem}
              unequipStoreItem={unequipStoreItem}
            />
          </ErrorBoundary>
        )}
      </div>

      {import.meta.env.DEV && (
        <>
          <PortalPatientDebugPanel />
          {isPilot11GamificationDebugPatient(selectedPatient) && (
            <Pilot11GamificationDebugPanel />
          )}
        </>
      )}

      {!patientMustChangePassword &&
        !training.exerciseVideoModal &&
        !training.trainingFeedbackOpen && (
          <PatientPortalHomeAiChatDock
            patient={selectedPatient}
            exercises={exercises}
            onPatientEmergencyText={handlePatientEmergencyText}
          />
        )}

      <nav
        className="fixed bottom-0 inset-x-0 z-[35] rounded-t-2xl border border-slate-200/90 border-b-0 flex justify-center bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.08)]"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        aria-label="ניווט פורטל"
      >
        <div className="flex w-full max-w-lg px-1">
          <button
            type="button"
            disabled={portalFrozenUiLock}
            onClick={() => {
              navigate('/patient-portal');
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${
              portalTab === 'home'
                ? 'text-medical-primary'
                : 'text-slate-500'
            }`}
            aria-label="בית — מפת גוף"
          >
            <Home className="w-7 h-7 shrink-0" strokeWidth={portalTab === 'home' ? 2.5 : 2} />
            בית
          </button>
          <button
            type="button"
            disabled={portalFrozenUiLock}
            onClick={() => navigate(portalHrefForTab('activity'))}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${
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
            disabled={portalFrozenUiLock}
            onClick={() => navigate(portalHrefForTab('gear'))}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-14 min-w-[3rem] py-2.5 text-sm font-bold transition-colors rounded-xl touch-manipulation motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${
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

      {/* MUTED: Guardi companion / full-screen celebration disabled pending redesign. */}

      <PatientDailyViewModals
        selectedPatient={selectedPatient}
        portalPatientLabel={portalPatientLabel}
        clinicalToday={clinicalToday}
        sessionRole={sessionRole}
        patientMustChangePassword={patientMustChangePassword}
        showPortalFrozenOverlay={showPortalFrozenOverlay}
        redFlagOpen={redFlagOpen}
        onCloseRedFlag={() => setRedFlagOpen(false)}
        painAnalyticsOpen={painAnalyticsOpen}
        onClosePainAnalytics={() => setPainAnalyticsOpen(false)}
        finishReports={getPatientExerciseFinishReports(selectedPatient.id)}
        exerciseVideoModal={training.exerciseVideoModal}
        onClearTrainingSession={training.clearTrainingSession}
        onFinishPractice={training.handleFinishPractice}
        pendingTrainingSession={training.pendingTrainingSession}
        trainingFeedbackOpen={training.trainingFeedbackOpen}
        trainingSubmitError={training.trainingSubmitError}
        onCloseTrainingFeedback={() => {
          training.setTrainingFeedbackOpen(false);
          training.setTrainingSubmitError(null);
        }}
        onSubmitTrainingFeedback={async (payload) => {
          training.setTrainingSubmitError(null);
          const ok = await training.handleTrainingComplete(payload);
          if (!ok) return false;
          training.clearTrainingSession();
          return true;
        }}
        emergencyModalOpen={emergencyModalPatientId === selectedPatient.id}
        latestEmergencyReason={latestEmergencyReason}
        onAcknowledgeEmergency={() => setEmergencyModalPatientId(null)}
        onOpenTherapistMessageFromEmergency={() => {
          setEmergencyModalPatientId(null);
          setMessageDraftSeed(
            'דחוף: דיווחתי על תסמינים שעלולים לחייב בדיקה רפואית דחופה. נא ליצור קשר בהקדם.'
          );
          navigate(portalHrefForTab('messages'));
        }}
        pwCurrent={pwCurrent}
        pwNew={pwNew}
        pwConfirm={pwConfirm}
        pwFormError={pwFormError}
        onPwCurrentChange={setPwCurrent}
        onPwNewChange={setPwNew}
        onPwConfirmChange={setPwConfirm}
        onSubmitPasswordChange={() => void submitPasswordChange()}
        onNavigateToMessages={() => navigate(portalHrefForTab('messages'))}
        onLogout={handleLogout}
        settingsModalOpen={settingsModalOpen}
        onCloseSettings={() => setSettingsModalOpen(false)}
        completePatientPasswordChange={completePatientPasswordChange}
      />
    </div>
  );
}
