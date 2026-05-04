import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Stethoscope,
  FileText,
  ClipboardList,
  AlertTriangle,
  MessageSquare,
  BarChart3,
  Archive,
  Pencil,
  Trash2,
  Snowflake,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientCredentialsByPatientId } from '../../context/authPersistence';
import RedFlagAlert from './RedFlagAlert';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import ManagePlanModal from './ManagePlanModal';
import ClinicalAiIntakeWizard from './ClinicalAiIntakeWizard';
import TherapistQuickChat from './clinical/TherapistQuickChat';
import ClinicalDeepDiveTabs from './clinical/ClinicalDeepDiveTabs';
import SmartClinicalDocumentation from './clinical/SmartClinicalDocumentation';
import FullIntakeVaultModal from './clinical/FullIntakeVaultModal';
import ManagePainAreasModal from './clinical/ManagePainAreasModal';
import TherapistPatientGrid from './TherapistPatientGrid';
import SidebarNewPatient from '../layout/SidebarNewPatient';
import { bodyAreaLabels } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';

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

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  pending: 'ממתין',
  paused: 'מושהה',
};
const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: '#dbeafe', text: '#1e40af', dot: '#2563eb' },
  pending: { bg: '#fef9c3', text: '#854d0e', dot: '#ca8a04' },
  paused: { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
};

export default function PatientOverview() {
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
    deletePatient,
    isPatientSessionLocked,
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

  useEffect(() => {
    setEditingDemographics(false);
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

  const rosterStats = useMemo(() => {
    return {
      total: patients.length,
      active: patients.filter((x) => x.status === 'active').length,
      pending: patients.filter((x) => x.status === 'pending').length,
      redFlags: patients.filter((x) => x.hasRedFlag).length,
    };
  }, [patients]);

  if (!selectedPatient) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50" dir="rtl">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <header className="flex flex-col gap-4 mb-6 md:flex-row md:justify-between md:items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ברוכים השבים</h1>
              <p className="text-sm text-gray-500 mt-1">
                בחרו מטופל להצגת הנתונים או הוסיפו מטופל חדש
              </p>
            </div>
            <SidebarNewPatient layout="dashboard" />
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-5 md:col-span-1 lg:col-span-1">
              <h2 className="text-lg font-bold text-slate-900">סטטיסטיקה</h2>
              <p className="text-sm text-gray-500 mt-0.5 mb-4">תמונת מצב מהירה מהרשימה</p>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2 border border-gray-100">
                  <dt className="text-sm text-gray-500">סה״כ</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums">{rosterStats.total}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 border border-gray-100">
                  <dt className="text-sm text-gray-500">פעילים</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums">{rosterStats.active}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 border border-gray-100">
                  <dt className="text-sm text-gray-500">ממתינים</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums">{rosterStats.pending}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 border border-gray-100">
                  <dt className="text-sm text-gray-500">דגלים אדומים</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums">{rosterStats.redFlags}</dd>
                </div>
              </dl>
            </section>

            <div className="md:col-span-2 lg:col-span-2 min-w-0">
              <TherapistPatientGrid />
            </div>

            <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-5 md:col-span-2 lg:col-span-3">
              <h2 className="text-lg font-bold text-slate-900">כלי קליניים</h2>
              <p className="text-sm text-gray-500 mt-0.5 mb-4">קיצורי דרך — לאחר בחירת מטופל</p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSection('clinical')}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 min-h-[44px]"
                >
                  <Stethoscope className="w-4 h-4 shrink-0" />
                  דוחות קליניים
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('analytics')}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 min-h-[44px]"
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  היסטוריה ואנליטיקה
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('messages')}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 min-h-[44px]"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  הודעות וצ׳אט
                </button>
              </div>
            </section>
          </div>

          <AccessibilityFooterLink />
        </div>
      </div>
    );
  }

  const p = selectedPatient;
  const style = statusStyles[p.status];
  const plan = getExercisePlan(p.id);
  const exerciseCount = plan?.exercises.length ?? 0;
  const portalUsernameDisplay =
    p.portalUsername ?? getPatientCredentialsByPatientId(p.id)?.loginId ?? null;
  const needsClinicalSetup = p.status === 'pending' || exerciseCount === 0;

  const displayName = getPatientDisplayName(p);

  const saveDemographics = () => {
    updatePatient(p.id, { demographicsFreeText: demoFreeText.trim() || undefined });
    void savePersistedStateToCloud();
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
                      className={`w-full text-start rounded-lg py-1.5 px-2 font-medium hover:bg-slate-50 min-h-[2.25rem] ${
                        (p.demographicsFreeText ?? '').trim()
                          ? 'text-slate-900'
                          : 'text-slate-400'
                      }`}
                    >
                      {(p.demographicsFreeText ?? '').trim() || 'מגדר, גיל, עבודה…'}
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="sr-only" htmlFor={`demo-free-${p.id}`}>
                        נתונים דמוגרפיים
                      </label>
                      <input
                        id={`demo-free-${p.id}`}
                        type="text"
                        value={demoFreeText}
                        onChange={(e) => setDemoFreeText(e.target.value)}
                        placeholder="מגדר, גיל, עבודה…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold placeholder:text-slate-400"
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
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: style.bg, color: style.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
                  {statusLabels[p.status]}
                </span>
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

              {p.diagnosis ? (
                <p className="text-sm text-slate-600 leading-relaxed">{p.diagnosis}</p>
              ) : null}

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
                  title="שלח הודעה למטופל"
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

              {needsClinicalSetup && (
                <button
                  type="button"
                  onClick={() => setShowClinicalModal(true)}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-semibold border border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100 active:scale-[0.99] transition-colors"
                  title="הגדרת פרופיל קליני"
                >
                  <Stethoscope className="w-4 h-4 shrink-0" />
                  הגדרת פרופיל
                </button>
              )}
            </div>
          </div>

          {p.therapistNotes && (
            <div className="mt-6 pt-5 border-t border-slate-100 p-4 rounded-xl bg-slate-50/90 flex items-start gap-2">
              <FileText className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 leading-relaxed">{p.therapistNotes}</p>
            </div>
          )}
        </div>

        <SmartClinicalDocumentation patient={p} />

        <div className="mb-5">
          <TherapistQuickChat patientId={p.id} patientName={getPatientDisplayName(p)} />
        </div>

        <div className="mb-5">
          <ClinicalDeepDiveTabs patient={p} />
        </div>

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
            onClose={() => setShowClinicalModal(false)}
            onSave={(primaryBodyArea, libraryExerciseIds, extras) =>
              applyInitialClinicalProfile(p.id, primaryBodyArea, libraryExerciseIds, extras)
            }
          />
        )}
      </div>
    </div>
  );
}
