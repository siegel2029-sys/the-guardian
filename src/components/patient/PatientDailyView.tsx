import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  X,
  MessageCircle,
  Coins,
  Activity,
  LogOut,
  Send,
  User,
  Bot,
  Clock,
  KeyRound,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { useAuth } from '../../context/AuthContext';
import { getTherapistDisplayName } from '../../context/authPersistence';
import BodyMap3D from '../body-map/BodyMap3D';
import ExerciseReportModal from './ExerciseReportModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import PatientExerciseCard from './PatientExerciseCard';
import GuardianAssistantFAB from './GuardianAssistantFAB';
import EmergencyStopModal from './EmergencyStopModal';
import DidYouKnowBubble from './DidYouKnowBubble';
import PatientAiSuggestionCards from './PatientAiSuggestionCards';
import PatientPainProgressSheet from './PatientPainProgressSheet';
import ClinicalMonthCalendar from './ClinicalMonthCalendar';
import type { PatientExercise, BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import {
  analyzePatientProgress,
  buildPatientProgressPayload,
  buildPainReportNarrative,
} from '../../ai/patientProgressReasoning';
import {
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
} from '../../safety/clinicalEmergencyScreening';

/** תצוגת יום למטופל — מוצגת רק ב־/patient-portal (מפת גוף, תרגילים, לוח שנה). */
export default function PatientDailyView() {
  const navigate = useNavigate();
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
    getPendingAiSuggestions,
    patientAgreeToAiSuggestion,
    patientDeclineAiSuggestion,
    grantPatientKnowledgeReward,
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
  } = usePatient();

  const [reportFor, setReportFor] = useState<PatientExercise | null>(null);
  const [detailFor, setDetailFor] = useState<PatientExercise | null>(null);
  const [filterArea, setFilterArea] = useState<BodyArea | null>(null);
  const [messageText, setMessageText] = useState('');
  const [painSheetOpen, setPainSheetOpen] = useState(false);
  const [loadSafetyNudge, setLoadSafetyNudge] = useState<string | null>(null);
  const [portalMessagesOpen, setPortalMessagesOpen] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwFormError, setPwFormError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [newLoginIdInput, setNewLoginIdInput] = useState('');
  const [loginIdCurrentPw, setLoginIdCurrentPw] = useState('');
  const [loginIdError, setLoginIdError] = useState<string | null>(null);
  const [avatarFocusArea, setAvatarFocusArea] = useState<BodyArea | null>(null);
  const [avatarMode, setAvatarMode] = useState<'clinical' | 'selfcare' | null>(null);

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
    if (!selectedPatient || !portalMessagesOpen) return;
    portalMessages.forEach((m) => {
      if (!m.fromPatient && !m.isRead) markMessageRead(m.id);
    });
  }, [selectedPatient?.id, portalMessagesOpen, portalMessages, markMessageRead]);

  const plan = selectedPatient ? getExercisePlan(selectedPatient.id) : undefined;
  const session = selectedPatient ? getTodaySession(selectedPatient.id) : null;
  const exercises = plan?.exercises ?? [];

  const activeAreas = useMemo(
    () => [...new Set(exercises.map((e) => e.targetArea))],
    [exercises]
  );

  const visibleExercises = useMemo(
    () => (filterArea ? exercises.filter((e) => e.targetArea === filterArea) : exercises),
    [exercises, filterArea]
  );

  const completedSet = useMemo(
    () => new Set(session?.completedIds ?? []),
    [session?.completedIds]
  );

  const pendingAiSuggestions = useMemo(
    () => (selectedPatient ? getPendingAiSuggestions(selectedPatient.id) : []),
    [selectedPatient, getPendingAiSuggestions]
  );

  const patientDayMap = useMemo(
    () =>
      selectedPatient ? dailyHistoryByPatient[selectedPatient.id] ?? {} : {},
    [selectedPatient, dailyHistoryByPatient]
  );

  const exerciseSafetyLocked = selectedPatient
    ? isPatientExerciseSafetyLocked(selectedPatient.id)
    : false;

  useEffect(() => {
    if (!selectedPatient) return;
    if (avatarMode === 'selfcare' && avatarFocusArea != null) {
      const zones = getSelfCareZones(selectedPatient.id);
      if (!zones.includes(avatarFocusArea)) {
        setAvatarFocusArea(null);
        setAvatarMode(null);
      }
    }
  }, [selectedPatient?.id, avatarMode, avatarFocusArea, getSelfCareZones]);

  useEffect(() => {
    if (avatarMode === 'selfcare' && avatarFocusArea == null) {
      setAvatarMode(null);
    }
  }, [avatarMode, avatarFocusArea]);

  const handleAvatarZoneClick = (area: BodyArea) => {
    if (!selectedPatient) return;
    if (area === selectedPatient.primaryBodyArea) {
      setAvatarMode('clinical');
      setAvatarFocusArea(area);
      setFilterArea(area);
      return;
    }
    const had = getSelfCareZones(selectedPatient.id).includes(area);
    toggleSelfCareZone(selectedPatient.id, area);
    if (had) {
      setAvatarFocusArea((prev) => (prev === area ? null : prev));
    } else {
      setAvatarFocusArea(area);
      setAvatarMode('selfcare');
      setFilterArea(null);
    }
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

  const painReportNarrative = useMemo(() => {
    if (!selectedPatient) return '';
    const payload = buildPatientProgressPayload(selectedPatient, exercises);
    const analysis = analyzePatientProgress(payload);
    return buildPainReportNarrative(selectedPatient, exercises, analysis);
  }, [selectedPatient, exercises]);

  const openExerciseDetail = (ex: PatientExercise) => {
    if (completedSet.has(ex.id)) return;
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
    submitExerciseReport(
      selectedPatient.id,
      reportFor.id,
      painLevel,
      effortRating,
      reportFor.xpReward
    );
    if (painLevel >= 7) setLoadSafetyNudge(PAIN_SURGE_PATIENT_COPY);
    else if (effortRating === 5) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
    else setLoadSafetyNudge(null);
    setReportFor(null);
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
      setPasswordModalOpen(false);
    }
  };

  if (!selectedPatient) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ background: '#F0F9FA' }}
        dir="rtl"
      >
        <p className="text-teal-900 font-medium mb-4">לא נבחר מטופל או שהחשבון אינו מקושר.</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {sessionRole === 'patient' && (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="px-5 py-2.5 rounded-2xl border border-slate-300 text-slate-700 font-medium"
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
  const pct = Math.min(100, Math.round((xp / next) * 100));

  return (
    <div
      className="min-h-screen flex flex-col max-w-lg mx-auto w-full shadow-xl relative"
      style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdfa 35%, #ffffff 100%)' }}
      dir="rtl"
    >
      <header
        className="sticky top-0 z-20 px-4 pt-4 pb-3 border-b flex items-center gap-3"
        style={{
          borderColor: '#99f6e4',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {sessionRole === 'patient' ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {!patientMustChangePassword && (
              <button
                type="button"
                onClick={() => {
                  setPwFormError(null);
                  setPasswordModalOpen(true);
                }}
                title="שינוי סיסמה"
                className="flex items-center gap-1 text-sm font-medium text-slate-600 px-2.5 py-2 rounded-xl hover:bg-slate-100 border border-slate-200"
              >
                <KeyRound className="w-4 h-4" />
                <span className="hidden min-[400px]:inline">סיסמה</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              title="התנתקות"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-100 border border-slate-200"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        ) : null}
        <div className="flex-1 min-w-0 text-end">
          <p className="text-xs text-teal-600 font-medium">הפורטל האישי שלך</p>
          <p className="text-base font-semibold text-slate-800 truncate">{selectedPatient.name}</p>
        </div>
        <div
          className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold text-teal-900"
          style={{
            background: 'rgba(240, 253, 250, 0.95)',
            border: '1px solid #99f6e4',
          }}
          title="מטבעות למידה"
        >
          <Coins className="w-4 h-4 text-teal-600" />
          {selectedPatient.coins}
        </div>
      </header>

      <div className="flex-1 px-4 py-4 pb-28">
        {!!selectedPatient && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h2 className="text-base font-bold text-slate-800">מפת הגוף שלי</h2>
              {filterArea && (
                <button
                  type="button"
                  onClick={() => setFilterArea(null)}
                  className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
                >
                  <X className="w-3 h-3" />
                  הצג הכל
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-2 leading-relaxed">
              אזור הטיפול שהגדיר המטפל מודגש. ניתן לסנן את רשימת התרגילים לפי אזור בלחיצה על המודל.
              {exercises.length > 0 && (
                <span className="block mt-1 text-teal-700/90">
                  מוקד: <strong>{bodyAreaLabels[selectedPatient.primaryBodyArea]}</strong>
                </span>
              )}
            </p>
            <div
              className="rounded-2xl border overflow-hidden flex flex-col"
              style={{ borderColor: '#a7f3d0', minHeight: '260px' }}
            >
              <div className="flex-1 w-full min-h-[260px]">
                <BodyMap3D
                  activeAreas={exercises.length === 0 ? [] : activeAreas}
                  primaryArea={selectedPatient.primaryBodyArea}
                  painByArea={selectedPatient.analytics.painByArea}
                  level={selectedPatient.level}
                  selectedArea={filterArea}
                  minHeightPx={260}
                  onAreaClick={handleAvatarZoneClick}
                />
              </div>
            </div>
            {filterArea && (
              <p className="text-xs text-teal-700 mt-2 font-medium">
                מסונן: {bodyAreaLabels[filterArea]}
              </p>
            )}
          </section>
        )}

        {selectedPatient && (
          <section className="mb-5 rounded-2xl border overflow-hidden" style={{ borderColor: '#99f6e4' }}>
            <button
              type="button"
              onClick={() => setPortalMessagesOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-start gap-3"
              style={{ background: 'rgba(255,255,255,0.85)' }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageCircle className="w-5 h-5 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">מרכז הודעות</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    שיחה עם {careGiverName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {unreadForPatient > 0 && (
                  <span
                    className="min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center text-white"
                    style={{ background: '#0d9488' }}
                  >
                    {unreadForPatient > 9 ? '9+' : unreadForPatient}
                  </span>
                )}
                <span className="text-xs text-teal-600 font-medium">
                  {portalMessagesOpen ? 'סגירה' : 'פתיחה'}
                </span>
              </div>
            </button>
            {portalMessagesOpen && (
              <div
                className="px-3 pb-3 pt-1 border-t max-h-[min(55vh,420px)] flex flex-col gap-3"
                style={{ borderColor: '#e0f2f1', background: 'rgba(248, 250, 252, 0.5)' }}
              >
                <div className="flex-1 overflow-y-auto space-y-2 min-h-[120px] pr-0.5">
                  {portalMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">אין הודעות עדיין</p>
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
                                  ? { background: '#f0fdfa', borderColor: '#a7f3d0' }
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
                              className="max-w-[88%] rounded-2xl px-3 py-2.5 border shadow-sm"
                              style={alertStyle}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                {isAi ? (
                                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-teal-600" />
                                )}
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {senderLabel}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <Clock className="w-3 h-3 text-slate-300" />
                                <span className="text-[10px] text-slate-400">
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
                <div className="flex gap-2 items-end border-t pt-3" style={{ borderColor: '#e0f2f1' }}>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`הודעה ל־${careGiverShort}…`}
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-teal-200/90 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    style={{ background: '#fafefd' }}
                  />
                  <button
                    type="button"
                    disabled={!messageText.trim()}
                    onClick={() => {
                      if (!selectedPatient || !messageText.trim()) return;
                      sendPatientMessage(selectedPatient.id, messageText.trim());
                      setMessageText('');
                    }}
                    className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
                    aria-label="שלח הודעה"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mb-5 space-y-3">
          <DidYouKnowBubble
            patient={selectedPatient}
            onKnowledgeComplete={() => grantPatientKnowledgeReward(selectedPatient.id)}
          />
          <PatientAiSuggestionCards
            suggestions={pendingAiSuggestions}
            onApprove={patientAgreeToAiSuggestion}
            onDecline={patientDeclineAiSuggestion}
          />
        </div>

        {sessionRole === 'patient' && !patientMustChangePassword && selectedPatient && (
          <section className="mb-5 rounded-2xl border overflow-hidden" style={{ borderColor: '#cbd5e1' }}>
            <button
              type="button"
              onClick={() => {
                setAccountOpen((o) => !o);
                setLoginIdError(null);
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-start gap-2"
              style={{ background: 'rgba(248, 250, 252, 0.95)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-5 h-5 text-slate-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">פרופיל ומזהה כניסה</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    מזהה נוכחי: {patientLoginId ?? '—'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-600 font-medium shrink-0">
                {accountOpen ? 'סגירה' : 'פתיחה'}
              </span>
            </button>
            {accountOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-slate-200 space-y-3 text-sm" dir="rtl">
                <p className="text-xs text-slate-500 leading-relaxed">
                  ניתן לשנות את מזהה הגישה (PT-…) לאחר הזנת הסיסמה הנוכחית. הפורמט: PT- ואז אותיות ומספרים
                  באנגלית (למשל PT-MYID01).
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">מזהה חדש</label>
                  <input
                    type="text"
                    value={newLoginIdInput}
                    onChange={(e) => setNewLoginIdInput(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                    placeholder="PT-..."
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה נוכחית לאימות</label>
                  <input
                    type="password"
                    value={loginIdCurrentPw}
                    onChange={(e) => setLoginIdCurrentPw(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    autoComplete="current-password"
                  />
                </div>
                {loginIdError && <p className="text-xs text-red-600">{loginIdError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setLoginIdError(null);
                    const r = changePatientLoginId(loginIdCurrentPw, newLoginIdInput.trim());
                    if (r === 'invalid_id') {
                      setLoginIdError('מזהה לא תקין. נדרש פורמט PT- עם לפחות 4 תווים אחרי המקף.');
                    } else if (r === 'bad_password') {
                      setLoginIdError('סיסמה שגויה.');
                    } else if (r === 'taken') {
                      setLoginIdError('מזהה זה כבר בשימוש.');
                    } else {
                      setNewLoginIdInput('');
                      setLoginIdCurrentPw('');
                      setLoginIdError(null);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl font-semibold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg, #475569, #334155)' }}
                >
                  עדכון מזהה כניסה
                </button>
              </div>
            )}
          </section>
        )}

        <div
          className="rounded-2xl p-4 mb-5 border"
          style={{
            borderColor: '#a7f3d0',
            background: 'linear-gradient(135deg, #f0fdfa, #ffffff)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-900">התקדמות</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>רמה {selectedPatient.level}</span>
            <span className="tabular-nums">
              {xp} / {next} נק׳
            </span>
          </div>
          <div className="h-2 rounded-full bg-teal-100 overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #14b8a6, #059669)',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setPainSheetOpen(true)}
            className="w-full rounded-xl border border-teal-200/90 px-3 py-2.5 flex items-center justify-between gap-2 text-start transition-colors hover:bg-teal-50/80 active:bg-teal-50"
            style={{ background: 'rgba(255,255,255,0.65)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 text-teal-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-teal-900">מעקב כאב</p>
                <p className="text-[11px] text-slate-500 truncate">
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
            </div>
            <span className="text-xs font-medium text-teal-700 shrink-0">גרף</span>
          </button>
        </div>

        <ClinicalMonthCalendar dayMap={patientDayMap} clinicalToday={clinicalToday} />

        <h1 className="text-lg font-bold text-slate-800 mb-1">המשימות להיום</h1>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          לחצו על שורת התרגיל לפתיחת המסך המלא. מעבר עכבר על התמונה המקדימה מנגן וידאו (אם קיים) בלי לשנות
          את גודל השורה. במסך: וידאו מתנגן אוטומטית, לאחר «התחל תרגול» וסיום המדד — דיווח VAS.
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

        {exercises.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-teal-200 p-8 text-center text-teal-800/80 text-sm"
            style={{ background: 'rgba(240, 253, 250, 0.6)' }}
          >
            אין תרגילים בתוכנית. המטפל יכול להוסיף תרגילים ממסך ניהול התוכנית.
          </div>
        ) : visibleExercises.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            אין תרגילים באזור שנבחר. נקו את הסינון או בחרו אזור אחר.
          </p>
        ) : (
          <div
            className={`relative flex flex-col ${exerciseSafetyLocked ? 'pointer-events-none select-none opacity-[0.38]' : ''}`}
          >
            {exerciseSafetyLocked && (
              <div
                className="absolute inset-0 z-10 rounded-2xl bg-red-950/5 pointer-events-none"
                aria-hidden
              />
            )}
            <ul className="space-y-2 flex flex-col">
              {visibleExercises.map((ex, i) => {
                const done = completedSet.has(ex.id);
                return (
                  <li key={ex.id} className="w-full">
                    <PatientExerciseCard
                      exercise={ex}
                      index={i + 1}
                      isCompleted={done}
                      onOpen={() => openExerciseDetail(ex)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <GuardianAssistantFAB
        patient={selectedPatient}
        exerciseCount={exercises.length}
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
        hidden={!!detailFor || !!reportFor || exerciseSafetyLocked || patientMustChangePassword}
      />

      <PatientPainProgressSheet
        open={painSheetOpen}
        onClose={() => setPainSheetOpen(false)}
        painHistory={selectedPatient.analytics.painHistory}
        sessionHistory={selectedPatient.analytics.sessionHistory}
        aiNarrative={painReportNarrative}
      />

      <ExerciseDetailModal
        exercise={detailFor}
        onClose={closeExerciseDetail}
        onRequestComplete={handleRequestCompleteFromDetail}
        isCompleted={detailFor ? completedSet.has(detailFor.id) : false}
      />

      <ExerciseReportModal
        exercise={reportFor}
        onClose={() => setReportFor(null)}
        onSubmit={handleReportSubmit}
      />

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
          setPortalMessagesOpen(true);
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
              <KeyRound className="w-6 h-6 text-teal-600" />
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

      {sessionRole === 'patient' && !patientMustChangePassword && passwordModalOpen && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(15, 118, 110, 0.3)' }}
            dir="rtl"
            onClick={() => {
              setPasswordModalOpen(false);
              setPwCurrent('');
              setPwNew('');
              setPwConfirm('');
              setPwFormError(null);
            }}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-3xl border shadow-2xl p-6"
              style={{ background: '#ffffff', borderColor: '#99f6e4' }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pw-opt-title"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-teal-600" />
                  <h2 id="pw-opt-title" className="text-base font-bold text-slate-800">
                    שינוי סיסמה
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalOpen(false);
                    setPwCurrent('');
                    setPwNew('');
                    setPwConfirm('');
                    setPwFormError(null);
                  }}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="סגור"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                עדכון סיסמה
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
