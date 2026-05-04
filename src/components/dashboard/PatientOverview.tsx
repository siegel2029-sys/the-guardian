import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays, Stethoscope, FileText, ClipboardList, AlertTriangle,
  KeyRound, Copy, Eye, EyeOff, MessageSquare, BarChart3, Archive, Pencil,
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
import PatientDataManagement from './clinical/PatientDataManagement';
import FullIntakeVaultModal from './clinical/FullIntakeVaultModal';
import ManagePainAreasModal from './clinical/ManagePainAreasModal';
import TherapistPatientGrid from './TherapistPatientGrid';
import SidebarNewPatient from '../layout/SidebarNewPatient';
import { bodyAreaLabels } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';

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
  } = usePatient();
  const [showManageModal, setShowManageModal] = useState(false);
  const [showClinicalModal, setShowClinicalModal] = useState(false);
  const [showIntakeVault, setShowIntakeVault] = useState(false);
  const [showPainAreasModal, setShowPainAreasModal] = useState(false);
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [demoFreeText, setDemoFreeText] = useState(selectedPatient?.demographicsFreeText ?? '');

  useEffect(() => {
    setShowPortalPassword(false);
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
        </div>
      </div>
    );
  }

  const p = selectedPatient;
  const style = statusStyles[p.status];
  const plan = getExercisePlan(p.id);
  const exerciseCount = plan?.exercises.length ?? 0;
  const portalAccess = getPatientCredentialsByPatientId(p.id);
  const portalUsernameDisplay = p.portalUsername ?? portalAccess?.loginId ?? null;
  const needsClinicalSetup = p.status === 'pending' || exerciseCount === 0;

  const copyField = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

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
              <div className="w-24 h-24 rounded-xl flex items-center justify-center text-white shadow-md px-1.5 py-1 bg-teal-600 ring-1 ring-teal-700/20">
                <span className="text-center text-2xl md:text-[1.65rem] font-bold leading-tight break-words">
                  {displayName}
                </span>
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
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
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

        <PatientDataManagement patient={p} />

        {portalUsernameDisplay || portalAccess ? (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-teal-600" />
              <h3 className="text-lg font-bold text-slate-900">גישה לפורטל מטופל</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              מזהה הפורטל (רמזים) <strong>קבוע</strong> — אי אפשר לשנותו אחרי היצירה. בכניסה ל־/login יש להזין את
              המזהה ואת הסיסמה (לא דוא״ל).
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-gray-100 bg-slate-50 px-3 py-2.5">
                <div>
                  <p className="text-sm text-gray-500">מזהה פורטל (קבוע)</p>
                  <code className="text-sm font-mono font-bold text-slate-900">{portalUsernameDisplay ?? '—'}</code>
                </div>
                {portalUsernameDisplay && (
                  <button
                    type="button"
                    onClick={() => copyField(portalUsernameDisplay)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                    title="העתקה"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
              {portalAccess ? (
                <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-gray-100 bg-slate-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500">סיסמה (דמו)</p>
                    <code className="text-sm font-mono font-bold text-slate-900 break-all">
                      {showPortalPassword ? portalAccess.password : '••••••••'}
                    </code>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPortalPassword((v) => !v)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                      title={showPortalPassword ? 'הסתר' : 'הצג'}
                      aria-label={showPortalPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      {showPortalPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyField(portalAccess.password)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                      title="העתקה"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 leading-relaxed">
                  סיסמה הוצגה פעם אחת בעת היצירה (Supabase Auth). איפוס סיסמה: דרך הגדרות המטופל בפורטל או ממשק
                  Supabase.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-5 text-sm text-gray-600 mb-5">
            אין חשבון פורטל למטופל זה. צרו גישת פורטל דרך התפריט הראשי או פנו לתמיכה טכנית.
          </div>
        )}

        <PendingApprovalsPanel />
        <AiSuggestionsPanel />

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
