import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Stethoscope,
  ClipboardList,
  AlertTriangle,
  Archive,
  Pencil,
  Trash2,
  Snowflake,
  Link2Off,
  X,
  UserRoundPen,
  Sparkles,
  BellRing,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { formatPatientLastWorkoutHe } from '../../utils/patientPortalMeta';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { PI_PUSH_SYNC_TEST_PATIENT_ID } from '../../constants/pushSyncTestPatients';
import { dispatchPatientPushSyncRequest } from '../../services/therapistChatPush';
import { getPatientCredentialsByPatientId } from '../../context/authPersistence';
import RedFlagAlert from './RedFlagAlert';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import ManagePlanModal from './ManagePlanModal';
import ClinicalAiIntakeWizard from './ClinicalAiIntakeWizard';
import ClinicalIntakeCompletionModal from './clinical/ClinicalIntakeCompletionModal';
import TherapistAiInsightsPanel from './clinical/TherapistAiInsightsPanel';
import TherapistClinicalConsultantFAB from './clinical/TherapistClinicalConsultantFAB';
import TreatmentDocumentation from './clinical/TreatmentDocumentation';
import FullIntakeVaultModal from './clinical/FullIntakeVaultModal';
import PatientContinuationProtocolSection from './clinical/PatientContinuationProtocolSection';
import PatientProgressChart from './clinical/PatientProgressChart';
import ManagePainAreasModal from './clinical/ManagePainAreasModal';
import MessagesPanel from './MessagesPanel';
import TherapistPatientGrid, { type RosterFilterKey } from './TherapistPatientGrid';
import { bodyAreaLabels } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import { resolveCoreLegacyIntakeSummaryText } from '../../utils/clinicalIntakeProfileMigration';
import { patientRosterStatusBadge } from '../../utils/patientPortalMeta';
import MissingFieldHint from './clinical/MissingFieldHint';
import {
  DATA_UPDATE_ACTION_HIGHLIGHT,
  dataUpdateBoxClassName,
  dataUpdateInputClassName,
} from './clinical/patientDataUpdateHighlight';
import {
  computeRosterClinicalStats,
  DEMOGRAPHICS_FREE_TEXT_PLACEHOLDER,
  getPatientDataUpdateGaps,
  patientHasCompletedIntake,
  patientHasDemographicsFreeText,
  patientNeedsDataUpdate,
} from '../../utils/patientRosterMetrics';

function AccessibilityFooterLink() {
  return (
    <footer className="mt-10 pt-6 pb-8 border-t border-slate-200/80 flex justify-center shrink-0">
      <a
        href="/accessibility"
        className="text-[11px] text-slate-500 hover:text-teal-600 underline underline-offset-2 transition-colors"
      >
        הצהרת נגישות
      </a>
    </footer>
  );
}

export default function PatientOverview() {
  const [portalBannerDismissed, setPortalBannerDismissed] = useState(false);
  const {
    selectedPatient,
    getExercisePlan,
    isPatientExerciseSafetyLocked,
    clearPatientExerciseSafetyLock,
    applyInitialClinicalProfile,
    patients,
    updatePatient,
    savePersistedStateToCloud,
    saveSinglePatientPayloadToCloud,
    deletePatient,
    isPatientSessionLocked,
    safetyAlerts,
    unlinkedPortalPatientIds,
    aiSuggestions,
  } = usePatient();
  const [showManageModal, setShowManageModal] = useState(false);
  const [clinicalModalMode, setClinicalModalMode] = useState<'none' | 'completion' | 'wizard'>(
    'none'
  );
  const [showIntakeVault, setShowIntakeVault] = useState(false);
  const [showTreatmentDocs, setShowTreatmentDocs] = useState(false);
  const [showPainAreasModal, setShowPainAreasModal] = useState(false);
  const [destructiveDeleteOpen, setDestructiveDeleteOpen] = useState(false);
  const [destructiveDeleteStep, setDestructiveDeleteStep] = useState<1 | 2>(1);
  const [destructiveDeleteBusy, setDestructiveDeleteBusy] = useState(false);
  const [destructiveDeleteError, setDestructiveDeleteError] = useState<string | null>(null);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  const [freezeConfirmStep, setFreezeConfirmStep] = useState<1 | 2>(1);
  /** יעד לאחר אישור כפול: true = הקפאה, false = שחרור הקפאה */
  const [freezePendingIntent, setFreezePendingIntent] = useState<boolean | null>(null);
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [demoFreeText, setDemoFreeText] = useState(selectedPatient?.demographicsFreeText ?? '');
  const [piPushSyncBusy, setPiPushSyncBusy] = useState(false);
  const [piPushSyncStatus, setPiPushSyncStatus] = useState<string | null>(null);
  const [rosterFilterKey, setRosterFilterKey] = useState<RosterFilterKey>('active');

  useEffect(() => {
    setShowTreatmentDocs(false);
    setEditingDemographics(false);
    setPortalBannerDismissed(false);
    if (selectedPatient) {
      setDemoFreeText(selectedPatient.demographicsFreeText ?? '');
    }
  }, [selectedPatient?.id]);

  const safetyAlertsForSelected = useMemo(() => {
    if (!selectedPatient) return [];
    return safetyAlerts.filter((a) => a.patientId === selectedPatient.id);
  }, [selectedPatient, safetyAlerts]);

  const rosterStats = useMemo(
    () => computeRosterClinicalStats(patients, aiSuggestions),
    [patients, aiSuggestions]
  );

  if (!selectedPatient) {
    const statCardBtn = (
      selected: boolean,
      accent: 'teal' | 'blue' | 'yellow' | 'red' | 'purple' = 'teal'
    ) => {
      const accentSelected =
        accent === 'teal'
          ? 'border-2 border-teal-500 bg-teal-50/80 shadow-md ring-2 ring-teal-200/70'
          : accent === 'blue'
            ? 'border-2 border-blue-500 bg-blue-50/80 shadow-md ring-2 ring-blue-200/70'
            : accent === 'yellow'
              ? 'border-2 border-yellow-400 bg-yellow-50/80 shadow-md ring-2 ring-yellow-200/70'
              : accent === 'red'
                ? 'border-2 border-red-400 bg-red-50/70 shadow-md ring-2 ring-red-200/70'
                : 'border-2 border-purple-500 bg-purple-50/80 shadow-md ring-2 ring-purple-200/70';
      const accentIdle =
        accent === 'teal'
          ? 'border border-teal-200 bg-teal-50/60 hover:bg-teal-50 hover:border-teal-200'
          : accent === 'blue'
            ? 'border border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-200'
            : accent === 'yellow'
              ? 'border border-yellow-200 bg-yellow-50/60 hover:bg-yellow-50 hover:border-yellow-200'
              : accent === 'red'
                ? 'border border-red-100 bg-red-50/50 hover:bg-red-50 hover:border-red-200'
                : 'border border-purple-200 bg-purple-50/60 hover:bg-purple-50 hover:border-purple-200';

      return `w-full rounded-lg px-3 py-2 text-start transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
        selected ? accentSelected : `${accentIdle} active:scale-[0.99]`
      }`;
    };

    return (
      <div className="h-full overflow-y-auto bg-slate-50" dir="rtl">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <header className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-slate-900">ברוכים השבים</h1>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-5 md:col-span-1 lg:col-span-1">
              <h2 className="text-lg font-bold text-slate-900 mb-4">סטטיסטיקה</h2>
              <div
                className="grid grid-cols-2 gap-3"
                role="group"
                aria-label="סינון רשימת מטופלים לפי סיכום"
              >
                <button
                  type="button"
                  onClick={() => setRosterFilterKey('active')}
                  aria-pressed={rosterFilterKey === 'active'}
                  aria-label={`סינון מטופלים פעילים, סה״כ ${rosterStats.active}`}
                  className={statCardBtn(rosterFilterKey === 'active', 'teal')}
                >
                  <span className="block text-sm text-teal-700">סה״כ פעילים</span>
                  <span className="text-lg font-bold text-teal-950 tabular-nums">{rosterStats.active}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilterKey('needsDataUpdate')}
                  aria-pressed={rosterFilterKey === 'needsDataUpdate'}
                  aria-label={`סינון צריכים עדכון נתונים, ${rosterStats.needsDataUpdate}`}
                  className={statCardBtn(rosterFilterKey === 'needsDataUpdate', 'purple')}
                >
                  <span className="flex items-center gap-1.5 text-sm text-purple-700">
                    <UserRoundPen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    צריכים עדכון נתונים
                  </span>
                  <span className="text-lg font-bold text-purple-950 tabular-nums">
                    {rosterStats.needsDataUpdate}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilterKey('pendingAiAdjustments')}
                  aria-pressed={rosterFilterKey === 'pendingAiAdjustments'}
                  aria-label={`סינון עם המלצות AI, ${rosterStats.pendingAiAdjustments}`}
                  className={statCardBtn(rosterFilterKey === 'pendingAiAdjustments', 'yellow')}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-yellow-700">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-yellow-600" aria-hidden="true" />
                    עם המלצות AI
                  </span>
                  <span className="text-lg font-bold text-yellow-800 tabular-nums">
                    {rosterStats.pendingAiAdjustments}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilterKey('redFlags')}
                  aria-pressed={rosterFilterKey === 'redFlags'}
                  aria-label={`סינון דגלים אדומים בלבד, ${rosterStats.redFlags}`}
                  className={statCardBtn(rosterFilterKey === 'redFlags', 'red')}
                >
                  <span className="block text-sm text-gray-500">דגלים אדומים</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">{rosterStats.redFlags}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilterKey('frozen')}
                  aria-pressed={rosterFilterKey === 'frozen'}
                  aria-label={`סינון מטופלים מוקפאים, ${rosterStats.frozen}`}
                  className={`${statCardBtn(rosterFilterKey === 'frozen', 'blue')} col-span-2`}
                >
                  <span className="flex items-center gap-1.5 text-sm text-blue-700">
                    <Snowflake className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    מוקפא
                  </span>
                  <span className="text-lg font-bold text-blue-950 tabular-nums">
                    {rosterStats.frozen}
                  </span>
                </button>
              </div>
            </section>

            <div className="md:col-span-2 lg:col-span-2 min-w-0">
              <TherapistPatientGrid
                rosterFilterKey={rosterFilterKey}
                onRosterFilterKeyChange={setRosterFilterKey}
              />
            </div>
          </div>

          <AccessibilityFooterLink />
        </div>
      </div>
    );
  }

  const p = selectedPatient;
  const plan = getExercisePlan(p.id);
  const exerciseCount = plan?.exercises.length ?? 0;
  const portalUsernameDisplay =
    p.portalUsername ?? getPatientCredentialsByPatientId(p.id)?.loginId ?? null;
  const needsClinicalSetup = p.status === 'pending' || exerciseCount === 0;
  const intakeIncomplete = !patientHasCompletedIntake(p);
  const showIntakeAction = needsClinicalSetup || intakeIncomplete;
  const dataUpdateGaps = getPatientDataUpdateGaps(p);
  const highlightDataUpdateFields = patientNeedsDataUpdate(p);
  const demographicsDraftFilled = patientHasDemographicsFreeText({
    demographicsFreeText: demoFreeText,
  });
  const showDemographicsHighlight =
    highlightDataUpdateFields && dataUpdateGaps.includes('demographics') && !demographicsDraftFilled;
  const showIntakeHighlight =
    highlightDataUpdateFields && dataUpdateGaps.includes('intake') && intakeIncomplete;
  const isPortalUnlinked =
    !portalBannerDismissed &&
    !!p.portalUsername?.trim() &&
    unlinkedPortalPatientIds.includes(p.id);

  const displayName = getPatientDisplayName(p);

  const openClinicalIntakeModal = () => {
    setClinicalModalMode(intakeIncomplete ? 'completion' : 'wizard');
  };

  const saveDemographics = () => {
    const trimmed = demoFreeText.trim();
    const demographicsFreeText = trimmed.length > 0 ? trimmed : undefined;
    updatePatient(p.id, { demographicsFreeText });
    void saveSinglePatientPayloadToCloud({ ...p, demographicsFreeText });
    setEditingDemographics(false);
  };

  const injuryPrimaries = p.injuryHighlightSegments ?? [];
  const activeAreaSummary =
    injuryPrimaries.length === 0
      ? 'לא נבחר אזור כאב — לחץ לעריכה'
      : injuryPrimaries.map((a) => bodyAreaLabels[a]).join(' · ');

  return (
    <div className="h-full overflow-y-auto bg-slate-50" dir="rtl">
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {p.hasRedFlag && <RedFlagAlert patient={p} />}

        {highlightDataUpdateFields && (
          <div
            className="mb-5 rounded-xl border border-purple-300 bg-purple-50/80 px-4 py-3 flex items-start gap-2.5"
            role="status"
          >
            <UserRoundPen className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-purple-950">צריכים עדכון נתונים</p>
              <p className="text-xs text-purple-800 mt-0.5 leading-relaxed">
                השלימו את השדות המסומנים בסגול ({dataUpdateGaps.length}{' '}
                {dataUpdateGaps.length === 1 ? 'פריט' : 'פריטים'} חסרים).
              </p>
            </div>
          </div>
        )}

        {isPatientExerciseSafetyLocked(p.id) && (
          <div className="mb-5 rounded-xl border-2 border-red-600 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-red-950">נעילת תרגול פעילה</p>
                <p className="text-xs text-red-900 mt-1 leading-relaxed">
                  המטופל קיבל התראת חירום או נעילה קלינית. שחררו את הנעילה רק לאחר הערכה מתאימה ובהתאם לפרוטוקול.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => clearPatientExerciseSafetyLock(p.id)}
              className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                boxShadow: '0 8px 20px -6px rgba(127, 29, 29, 0.45)',
              }}
            >
              שחרור נעילת תרגול
            </button>
          </div>
        )}

        {p.id === PI_PUSH_SYNC_TEST_PATIENT_ID && (
          <div
            className="mb-5 rounded-xl border-2 border-violet-400 bg-gradient-to-l from-violet-50 to-indigo-50 p-4 shadow-md shadow-violet-200/50"
            role="region"
            aria-label="בדיקת סנכרון התראות PI"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <BellRing className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-violet-950">בדיקת מפתחות התראות (PI בלבד)</p>
                  <p className="text-xs text-violet-800 mt-1 leading-relaxed">
                    שולח Web Push עם קישור לפורטל המטופל — פתיחת הפורטל מרעננת את מנוי ההתראות אוטומטית.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={piPushSyncBusy || !isSupabaseConfigured || !supabase}
                onClick={() => {
                  if (!supabase || piPushSyncBusy) return;
                  setPiPushSyncBusy(true);
                  setPiPushSyncStatus(null);
                  void (async () => {
                    const result = await dispatchPatientPushSyncRequest(supabase, p.id);
                    setPiPushSyncStatus(result.message);
                    setPiPushSyncBusy(false);
                  })();
                }}
                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-sm font-bold py-2.5 px-4 shadow-md disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
              >
                <BellRing className="w-4 h-4" aria-hidden="true" />
                {piPushSyncBusy ? 'שולח…' : 'שלח בקשת סנכרון (בדיקה עבור PI)'}
              </button>
            </div>
            {piPushSyncStatus && (
              <p
                className={`mt-3 text-xs leading-relaxed ${
                  piPushSyncStatus.includes('נשלחה') ? 'text-emerald-800' : 'text-violet-900'
                }`}
                role="status"
              >
                {piPushSyncStatus}
              </p>
            )}
          </div>
        )}

        {isPortalUnlinked && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Link2Off className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
              <div>
                <p className="text-sm font-bold text-amber-900">פורטל המטופל טרם חובר</p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  נוצר חשבון פורטל עבור{' '}
                  <span className="font-bold">{p.portalUsername}</span>, אך המטופל טרם התחבר אליו בפעם הראשונה.
                  שמירת נתוני המטפל פועלת רגיל — הגישה של המטופל לפורטל תופעל אוטומטית עם כניסתו הראשונה.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPortalBannerDismissed(true)}
              className="shrink-0 rounded-lg p-1 text-amber-600 hover:bg-amber-100 transition-colors"
              aria-label="סגור התראה"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:h-[560px] lg:max-h-[560px]">
            <aside
              className="lg:col-span-1 p-4 md:p-5 lg:border-e border-slate-200/80 flex flex-col gap-4 min-h-0"
              aria-label="פרופיל מטופל וניהול קליני"
            >
              <div
                className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white p-4 space-y-3 shrink-0"
                aria-label="פרופיל וניהול קליני"
              >
                <div className="flex flex-row items-start gap-3">
                  <div className="flex flex-col shrink-0">
                    <div className="flex flex-col items-stretch gap-2 w-[4.5rem]">
                      <h2 className="w-full px-2 py-2 min-h-[3rem] rounded-xl flex items-center justify-center text-white text-sm font-black shadow-md bg-teal-600 ring-1 ring-teal-700/20 leading-tight text-center">
                        <span className="line-clamp-2 break-words">{displayName}</span>
                      </h2>
                      {!isPatientSessionLocked && (
                        <div
                          className="flex flex-row gap-2 w-full"
                          aria-label="פעולות ניהול מטופל"
                        >
                          <button
                            type="button"
                            title="מחיקת מטופל — דורש אישור כפול"
                            aria-label="מחיקת מטופל"
                            onClick={() => {
                              setDestructiveDeleteError(null);
                              setDestructiveDeleteStep(1);
                              setDestructiveDeleteOpen(true);
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-red-400 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-500 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" strokeWidth={2.25} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title={
                              p.accountFrozen
                                ? 'שחרור הקפאה — דורש אישור כפול'
                                : 'הקפאת פורטל — דורש אישור כפול'
                            }
                            aria-label={
                              p.accountFrozen ? 'שחרור הקפאת חשבון פורטל' : 'הקפאת חשבון פורטל'
                            }
                            onClick={() => {
                              setFreezePendingIntent(!p.accountFrozen);
                              setFreezeConfirmStep(1);
                              setFreezeConfirmOpen(true);
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-600 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                          >
                            <Snowflake className="w-3.5 h-3.5 text-sky-600" strokeWidth={2.25} aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 w-[4.5rem]">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-0.5">
                        אזור פעיל
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPainAreasModal(true)}
                        className="text-start text-sm font-semibold text-red-600 underline-offset-2 hover:underline decoration-red-400/80 leading-snug break-words"
                      >
                        {activeAreaSummary}
                      </button>
                    </div>
                  </div>

                  <div
                    className="flex flex-col gap-2 shrink-0 w-[6.75rem] sm:w-28"
                    aria-label="פעולות קליניות ראשיות"
                  >
                    <button
                      type="button"
                      onClick={() => setShowIntakeVault(true)}
                      className="inline-flex flex-col justify-center items-center gap-1 px-2 min-h-[52px] rounded-xl text-[11px] font-bold leading-tight text-white shadow-md bg-violet-600 hover:bg-violet-700 active:scale-[0.99] transition-colors text-center"
                    >
                      <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
                      סיכום אינטייק מלא
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTreatmentDocs(true)}
                      className="inline-flex flex-col justify-center items-center gap-1 px-2 min-h-[52px] rounded-xl text-[11px] font-bold leading-tight text-white shadow-md bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] transition-colors text-center"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                      תיעוד והערות AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManageModal(true)}
                      className="inline-flex flex-col justify-center items-center gap-1 px-2 min-h-[52px] rounded-xl text-[11px] font-bold leading-tight text-white shadow-md bg-teal-600 hover:bg-teal-700 active:scale-[0.99] transition-colors text-center"
                      title="עדכון תוכנית תרגול"
                    >
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {exerciseCount > 0 && (
                          <span className="min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-black">
                            {exerciseCount}
                          </span>
                        )}
                      </span>
                      עדכן תכנית
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const rosterBadge = patientRosterStatusBadge(p);
                    if (!rosterBadge) return null;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${rosterBadge.className}`}
                      >
                        {rosterBadge.label}
                      </span>
                    );
                  })()}
                  {p.hasRedFlag && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border"
                      style={{
                        background: '#fef2f2',
                        color: '#b91c1c',
                        borderColor: '#fecaca',
                      }}
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      דגל אדום
                    </span>
                  )}
                  {p.accountFrozen && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border border-sky-300 bg-sky-50 text-sky-900">
                      <Snowflake className="w-3 h-3 shrink-0 text-sky-600" strokeWidth={2.25} aria-hidden />
                      פורטל מוקפא
                    </span>
                  )}
                </div>

                {showIntakeAction && (
                  <button
                    type="button"
                    onClick={openClinicalIntakeModal}
                    className={`w-full inline-flex justify-center items-center gap-2 px-3 min-h-[40px] rounded-xl text-sm font-semibold active:scale-[0.99] transition-colors ${
                      showIntakeHighlight
                        ? DATA_UPDATE_ACTION_HIGHLIGHT
                        : 'border border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100'
                    }`}
                    title={
                      showIntakeHighlight
                        ? 'השלמת אינטייק קליני — שדה חסר'
                        : 'הגדרת פרופיל קליני'
                    }
                  >
                    <Stethoscope className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {showIntakeHighlight ? 'השלמת אינטייק קליני' : 'הגדרת פרופיל'}
                  </button>
                )}
              </div>

              <div className="space-y-3 text-sm text-slate-700 min-h-0 overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDemoFreeText(p.demographicsFreeText ?? '');
                        setEditingDemographics((v) => !v);
                      }}
                      className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 text-start"
                    >
                      נתונים דמוגרפיים
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDemoFreeText(p.demographicsFreeText ?? '');
                        setEditingDemographics((v) => !v);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-label={editingDemographics ? 'סגור עריכה' : 'ערוך נתונים דמוגרפיים'}
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                  {!editingDemographics ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDemoFreeText(p.demographicsFreeText ?? '');
                        setEditingDemographics(true);
                      }}
                      className={`w-full text-start py-1.5 px-2 font-medium hover:bg-slate-50/80 min-h-[2.25rem] transition-colors ${dataUpdateBoxClassName(
                        showDemographicsHighlight,
                        !demographicsDraftFilled
                      )} ${
                        demographicsDraftFilled ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {demographicsDraftFilled
                        ? demoFreeText.trim()
                        : DEMOGRAPHICS_FREE_TEXT_PLACEHOLDER}
                    </button>
                  ) : (
                    <div
                      className={`space-y-2 p-3 transition-colors ${dataUpdateBoxClassName(
                        showDemographicsHighlight,
                        !demographicsDraftFilled
                      )} ${showDemographicsHighlight ? '' : 'rounded-xl border border-slate-200 bg-slate-50'}`}
                    >
                      <label className="sr-only" htmlFor={`demo-free-${p.id}`}>
                        נתונים דמוגרפיים
                      </label>
                      <input
                        id={`demo-free-${p.id}`}
                        type="text"
                        value={demoFreeText}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDemoFreeText(v);
                          const next = v.trim().length > 0 ? v : undefined;
                          updatePatient(p.id, { demographicsFreeText: next });
                        }}
                        placeholder={DEMOGRAPHICS_FREE_TEXT_PLACEHOLDER}
                        className={dataUpdateInputClassName(
                          showDemographicsHighlight,
                          !demographicsDraftFilled
                        )}
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={saveDemographics}
                          className="flex-1 rounded-lg bg-teal-600 text-white text-xs font-bold py-2"
                        >
                          שמירה
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDemographics(false);
                            setDemoFreeText(p.demographicsFreeText ?? '');
                          }}
                          className="rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                  <MissingFieldHint show={showDemographicsHighlight} />
                </div>

                {intakeIncomplete && (
                  <div>
                    <button
                      type="button"
                      onClick={openClinicalIntakeModal}
                      className={`w-full text-start py-2 px-2.5 text-sm font-medium transition-colors min-h-[2.25rem] ${dataUpdateBoxClassName(
                        showIntakeHighlight,
                        intakeIncomplete
                      )} text-purple-600 hover:bg-purple-50/50`}
                    >
                      חסרים נתונים באינטייק
                    </button>
                    <MissingFieldHint show={showIntakeHighlight} />
                  </div>
                )}

                <div className="flex items-start gap-2 text-slate-600 text-xs">
                  <CalendarDays className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                  <div>
                    <div className="tabular-nums">הצטרף: {new Date(p.joinDate).toLocaleDateString('he-IL')}</div>
                    <div className="tabular-nums mt-1">
                      אימון אחרון: {formatPatientLastWorkoutHe(p)}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <section
              className="lg:col-span-2 min-h-[420px] lg:min-h-0 lg:h-full flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-s border-slate-200/80 bg-[#f8fafc]"
              aria-label="הודעות מטופל"
            >
              <MessagesPanel embedded embeddedMessageMaxHeight={340} />
            </section>
          </div>
        </div>

        <div className="mb-6">
          <PatientProgressChart patient={p} />
        </div>

        <div className="mb-6">
          <PatientContinuationProtocolSection
            patient={p}
            onEditClick={() => setShowIntakeVault(true)}
          />
        </div>

        <TherapistAiInsightsPanel patient={p} />

        <PendingApprovalsPanel />
        <AiSuggestionsPanel />

        <AccessibilityFooterLink />

        {freezeConfirmOpen && freezePendingIntent !== null && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
            dir="rtl"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="freeze-confirm-title"
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6"
            >
              <h2 id="freeze-confirm-title" className="text-lg font-black text-slate-900 mb-2">
                {freezeConfirmStep === 1
                  ? freezePendingIntent
                    ? 'לאשר הקפאת פורטל?'
                    : 'לאשר שחרור הקפאה?'
                  : freezePendingIntent
                    ? 'אישור סופי — הקפאה'
                    : 'אישור סופי — שחרור'}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                {freezeConfirmStep === 1
                  ? freezePendingIntent
                    ? 'לאחר האישור המטופל יראה במסך הקפאה בפורטל ולא יוכל להשתמש בתוכנית האימונים עד לשחרור ידני.'
                    : 'לאחר האישור המטופל יקבל שוב גישה מלאה לפורטל ולתוכנית האימונים.'
                  : freezePendingIntent
                    ? 'הגישה לתוכנית האימונים בפורטל תיחסם. הנתונים במערכת נשמרים. להמשיך?'
                    : 'המגבלות יוסרו מהפורטל. להמשיך?'}
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setFreezeConfirmOpen(false);
                    setFreezeConfirmStep(1);
                    setFreezePendingIntent(null);
                  }}
                >
                  ביטול
                </button>
                {freezeConfirmStep === 1 ? (
                  <button
                    type="button"
                    className="rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-sky-700"
                    onClick={() => setFreezeConfirmStep(2)}
                  >
                    המשך לאישור שני
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl bg-sky-700 text-white px-4 py-2.5 text-sm font-black hover:bg-sky-800"
                    onClick={() => {
                      updatePatient(p.id, { accountFrozen: freezePendingIntent });
                      void saveSinglePatientPayloadToCloud({
                        ...p,
                        accountFrozen: freezePendingIntent,
                      });
                      setFreezeConfirmOpen(false);
                      setFreezeConfirmStep(1);
                      setFreezePendingIntent(null);
                    }}
                  >
                    {freezePendingIntent ? 'אשר הקפאה' : 'אשר שחרור'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {destructiveDeleteOpen && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
            dir="rtl"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="destructive-delete-title"
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6"
            >
              <h2 id="destructive-delete-title" className="text-lg font-black text-slate-900 mb-2">
                {destructiveDeleteStep === 1 ? 'לאשר מחיקה?' : 'אישור סופי — מחיקה לצמיתות'}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                {destructiveDeleteStep === 1
                  ? 'המטופל יוסר מהרשימה יחד עם תוכנית התרגילים, ההודעות והיסטוריית הדיווחים המקושרים לכרטיס זה.'
                  : 'לא ניתן לשחזר את הנתונים לאחר המחיקה (כולל מסד נתונים כשמופעלת התחברות Supabase). להמשיך?'}
              </p>
              {destructiveDeleteError ? (
                <p className="text-sm text-red-600 mb-4 whitespace-pre-wrap">{destructiveDeleteError}</p>
              ) : null}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={destructiveDeleteBusy}
                  onClick={() => {
                    setDestructiveDeleteOpen(false);
                    setDestructiveDeleteStep(1);
                    setDestructiveDeleteError(null);
                  }}
                >
                  ביטול
                </button>
                {destructiveDeleteStep === 1 ? (
                  <button
                    type="button"
                    className="rounded-xl bg-amber-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-amber-700"
                    disabled={destructiveDeleteBusy}
                    onClick={() => setDestructiveDeleteStep(2)}
                  >
                    המשך לאישור שני
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl bg-red-700 text-white px-4 py-2.5 text-sm font-black hover:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={destructiveDeleteBusy}
                    onClick={() => {
                      setDestructiveDeleteBusy(true);
                      setDestructiveDeleteError(null);
                      void deletePatient(p.id).then((r) => {
                        setDestructiveDeleteBusy(false);
                        if (!r.ok) {
                          setDestructiveDeleteError(r.message);
                          return;
                        }
                        setDestructiveDeleteOpen(false);
                        setDestructiveDeleteStep(1);
                      });
                    }}
                  >
                    {destructiveDeleteBusy ? 'מוחק…' : 'מחק לצמיתות'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showIntakeVault && (
          <FullIntakeVaultModal patient={p} onClose={() => setShowIntakeVault(false)} />
        )}

        {showTreatmentDocs && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="treatment-docs-modal-title"
            dir="rtl"
          >
            <div className="w-full sm:max-w-3xl max-h-[min(92dvh,900px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h2 id="treatment-docs-modal-title" className="text-lg font-black text-slate-950">
                    תיעוד והערות AI
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTreatmentDocs(false)}
                  className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
                  aria-label="סגור"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto min-h-0">
                <TreatmentDocumentation patient={p} embedded />
              </div>
            </div>
          </div>
        )}

        {showPainAreasModal && (
          <ManagePainAreasModal patient={p} onClose={() => setShowPainAreasModal(false)} />
        )}

        {showManageModal && <ManagePlanModal onClose={() => setShowManageModal(false)} />}

        {clinicalModalMode === 'completion' && (
          <ClinicalIntakeCompletionModal
            patient={p}
            planExercises={plan?.exercises ?? []}
            onClose={() => setClinicalModalMode('none')}
            onOpenFullWizard={() => setClinicalModalMode('wizard')}
            onSave={async (primaryBodyArea, libraryExerciseIds, extras) => {
              applyInitialClinicalProfile(p.id, primaryBodyArea, libraryExerciseIds, extras);
              const ok = await savePersistedStateToCloud({ immediate: true });
              if (!ok) {
                console.error('[ClinicalIntakeCompletion] savePersistedStateToCloud failed', {
                  patientId: p.id,
                  primaryBodyArea,
                  clinicalIntakeProfile: extras?.clinicalIntakeProfile,
                });
                throw new Error(
                  'שמירה לענן נכשלה — הנתונים נשמרו מקומית בלבד. רעננו את הדף או נסו שוב.'
                );
              }
            }}
          />
        )}

        {clinicalModalMode === 'wizard' && (
          <ClinicalAiIntakeWizard
            clinicalIntakeMode="edit"
            lockedPortalUsername={portalUsernameDisplay}
            initialPatientName={getPatientDisplayName(p)}
            initialIntakeStory={resolveCoreLegacyIntakeSummaryText(p) || undefined}
            onClose={() => setClinicalModalMode('none')}
            onSave={(primaryBodyArea, libraryExerciseIds, extras) => {
              applyInitialClinicalProfile(p.id, primaryBodyArea, libraryExerciseIds, extras);
              void savePersistedStateToCloud({ immediate: true });
            }}
          />
        )}

        <TherapistClinicalConsultantFAB
          key={p.id}
          patient={p}
          safetyAlertsForPatient={safetyAlertsForSelected}
          exerciseSafetyLocked={isPatientExerciseSafetyLocked(p.id)}
        />
      </div>
    </div>
  );
}
