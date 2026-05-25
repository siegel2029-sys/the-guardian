import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Stethoscope,
  ClipboardList,
  AlertTriangle,
  MessageSquare,
  BarChart3,
  Archive,
  Pencil,
  Trash2,
  Snowflake,
  Link2Off,
  X,
  UserRoundPen,
  Sparkles,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientCredentialsByPatientId } from '../../context/authPersistence';
import RedFlagAlert from './RedFlagAlert';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import ManagePlanModal from './ManagePlanModal';
import ClinicalAiIntakeWizard from './ClinicalAiIntakeWizard';
import TherapistQuickChat from './clinical/TherapistQuickChat';
import TherapistAiInsightsPanel from './clinical/TherapistAiInsightsPanel';
import TherapistClinicalConsultantFAB from './clinical/TherapistClinicalConsultantFAB';
import ClinicalDeepDiveTabs from './clinical/ClinicalDeepDiveTabs';
import TreatmentDocumentation from './clinical/TreatmentDocumentation';
import FullIntakeVaultModal from './clinical/FullIntakeVaultModal';
import ManagePainAreasModal from './clinical/ManagePainAreasModal';
import TherapistPatientGrid, { type RosterFilterKey } from './TherapistPatientGrid';
import { bodyAreaLabels } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
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
    getPatientMessages,
    messages,
    isPatientExerciseSafetyLocked,
    clearPatientExerciseSafetyLock,
    applyInitialClinicalProfile,
    setActiveSection,
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
  const [showClinicalModal, setShowClinicalModal] = useState(false);
  const [showIntakeVault, setShowIntakeVault] = useState(false);
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
  const [rosterFilterKey, setRosterFilterKey] = useState<RosterFilterKey>('active');

  useEffect(() => {
    setEditingDemographics(false);
    setPortalBannerDismissed(false);
    if (selectedPatient) {
      setDemoFreeText(selectedPatient.demographicsFreeText ?? '');
    }
  }, [selectedPatient?.id]);

  const unreadFromPatient = useMemo(() => {
    if (!selectedPatient) return 0;
    return getPatientMessages(selectedPatient.id).filter(
      (m) => m.fromPatient && !m.aiClinicalAlert && !m.isRead
    ).length;
  }, [selectedPatient, getPatientMessages, messages]);

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
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
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

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5 md:p-6 mb-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {/* עמודת זהות — ב־RTL ראשון ב־DOM = ימין */}
            <div className="flex flex-col items-center md:items-start shrink-0 w-full md:w-[200px] gap-3">
              <div className="flex flex-row flex-wrap items-center gap-3 w-full justify-center md:justify-start">
                <div className="w-24 h-24 rounded-xl flex items-center justify-center text-white shadow-md px-1.5 py-1 bg-teal-600 ring-1 ring-teal-700/20 shrink-0">
                  <span className="text-center text-2xl md:text-[1.65rem] font-bold leading-tight break-words">
                    {displayName}
                  </span>
                </div>
                {!isPatientSessionLocked && (
                  <div
                    className="flex flex-row items-center gap-2 shrink-0"
                    aria-label="פעולות ניהול מטופל"
                  >
                    <button
                      type="button"
                      title={
                        p.accountFrozen ? 'שחרור הקפאה — דורש אישור כפול' : 'הקפאת פורטל — דורש אישור כפול'
                      }
                      aria-label={
                        p.accountFrozen ? 'שחרור הקפאת חשבון פורטל' : 'הקפאת חשבון פורטל'
                      }
                      onClick={() => {
                        setFreezePendingIntent(!p.accountFrozen);
                        setFreezeConfirmStep(1);
                        setFreezeConfirmOpen(true);
                      }}
                      className="flex items-center justify-center w-11 h-11 rounded-xl border-2 border-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-600 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                    >
                      <Snowflake className="w-5 h-5 text-sky-600" strokeWidth={2.25} aria-hidden />
                    </button>
                    <button
                      type="button"
                      title="מחיקת מטופל — דורש אישור כפול"
                      aria-label="מחיקת מטופל"
                      onClick={() => {
                        setDestructiveDeleteError(null);
                        setDestructiveDeleteStep(1);
                        setDestructiveDeleteOpen(true);
                      }}
                      className="flex items-center justify-center w-11 h-11 rounded-xl border-2 border-red-400 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-500 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              <div className="w-full max-w-[260px] space-y-3 text-sm text-slate-700">
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

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                    אינטייק קליני
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowClinicalModal(true)}
                    className={`w-full text-start py-2 px-2.5 text-sm font-medium transition-colors min-h-[2.25rem] ${dataUpdateBoxClassName(
                      showIntakeHighlight,
                      intakeIncomplete
                    )} ${
                      intakeIncomplete
                        ? 'text-purple-900 hover:bg-purple-50/50'
                        : 'text-emerald-800 hover:bg-emerald-50/50'
                    }`}
                  >
                    {intakeIncomplete ? 'טרם הושלם — לחץ להשלמה' : 'הושלם ✓'}
                  </button>
                  <MissingFieldHint show={showIntakeHighlight} />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-0.5">
                    אזור פעיל
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPainAreasModal(true)}
                      className="text-start font-semibold text-red-600 underline-offset-2 hover:underline decoration-red-400/80"
                    >
                      {activeAreaSummary}
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <CalendarDays className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                  <div>
                    <div className="tabular-nums">הצטרף: {new Date(p.joinDate).toLocaleDateString('he-IL')}</div>
                    <div className="tabular-nums mt-1">אימון אחרון: {new Date(p.lastSessionDate).toLocaleDateString('he-IL')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const rosterBadge = patientRosterStatusBadge(p);
                  if (!rosterBadge) return null;
                  return (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${rosterBadge.className}`}
                    >
                      {rosterBadge.label}
                    </span>
                  );
                })()}
                {p.hasRedFlag && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
                    style={{
                      background: '#fef2f2',
                      color: '#b91c1c',
                      borderColor: '#fecaca',
                    }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    דגל אדום
                  </span>
                )}
                {p.accountFrozen && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-sky-300 bg-sky-50 text-sky-900">
                    <Snowflake className="w-3.5 h-3.5 shrink-0 text-sky-600" strokeWidth={2.25} aria-hidden />
                    פורטל מוקפא
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowIntakeVault(true)}
                  className="inline-flex justify-center items-center gap-2 px-4 min-h-[48px] rounded-xl text-sm font-bold text-white shadow-md bg-violet-600 hover:bg-violet-700 active:scale-[0.99] transition-colors"
                >
                  <Archive className="w-4 h-4 shrink-0" />
                  סיכום אינטייק מלא
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('analytics')}
                  className="inline-flex justify-center items-center gap-2 px-4 min-h-[48px] rounded-xl text-sm font-bold text-white shadow-md bg-slate-700 hover:bg-slate-800 active:scale-[0.99] transition-colors"
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  התקדמות
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageModal(true)}
                  className="inline-flex justify-center items-center gap-2 px-4 min-h-[48px] rounded-xl text-sm font-bold text-white shadow-md bg-teal-600 hover:bg-teal-700 active:scale-[0.99] transition-colors"
                  title="עדכון תוכנית תרגול"
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  עדכן תוכנית
                  {exerciseCount > 0 && (
                    <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-xs font-black shrink-0">
                      {exerciseCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('messages')}
                  className="inline-flex justify-center items-center gap-2 px-4 min-h-[48px] rounded-xl text-sm font-bold border-2 border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100 active:scale-[0.99] transition-colors"
                  title="שלח הודעה למטופל — פותח מסך הודעות וצ׳אט"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  שלח הודעה
                  {unreadFromPatient > 0 && (
                    <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                      {unreadFromPatient}
                    </span>
                  )}
                </button>
              </div>

              {showIntakeAction && (
                <button
                  type="button"
                  onClick={() => setShowClinicalModal(true)}
                  className={`w-full sm:w-auto inline-flex justify-center items-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-semibold active:scale-[0.99] transition-colors ${
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
                  <Stethoscope className="w-4 h-4 shrink-0" />
                  {showIntakeHighlight ? 'השלמת אינטייק קליני' : 'הגדרת פרופיל'}
                </button>
              )}
            </div>
          </div>
        </div>

        <TreatmentDocumentation patient={p} />

        <div className="mb-5">
          <TherapistQuickChat patientId={p.id} patientName={getPatientDisplayName(p)} />
        </div>

        <div className="mb-5">
          <ClinicalDeepDiveTabs patient={p} />
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
                      void savePersistedStateToCloud();
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

        {showPainAreasModal && (
          <ManagePainAreasModal patient={p} onClose={() => setShowPainAreasModal(false)} />
        )}

        {showManageModal && <ManagePlanModal onClose={() => setShowManageModal(false)} />}

        {showClinicalModal && (
          <ClinicalAiIntakeWizard
            clinicalIntakeMode="edit"
            lockedPortalUsername={portalUsernameDisplay}
            initialPatientName={getPatientDisplayName(p)}
            highlightIncompleteFields={intakeIncomplete}
            onClose={() => setShowClinicalModal(false)}
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
