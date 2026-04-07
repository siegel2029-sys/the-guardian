import { useState, useEffect, useMemo } from 'react';
import {
  User, CalendarDays, Stethoscope, FileText, ClipboardList, AlertTriangle,
  KeyRound, Copy, Eye, EyeOff,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientCredentialsByPatientId } from '../../context/authPersistence';
import { computeClinicalProgressInsight } from '../../ai/clinicalCommandInsight';
import RedFlagAlert from './RedFlagAlert';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import ManagePlanModal from './ManagePlanModal';
import ClinicalProfileSetupModal from './ClinicalProfileSetupModal';
import ClinicalSummaryStrip from './clinical/ClinicalSummaryStrip';
import PatientAvatarStateCard from './clinical/PatientAvatarStateCard';
import AiProgressInsightCard from './clinical/AiProgressInsightCard';
import TherapistQuickChat from './clinical/TherapistQuickChat';
import ClinicalDeepDiveTabs from './clinical/ClinicalDeepDiveTabs';
import PatientDataManagement from './clinical/PatientDataManagement';
import { bodyAreaLabels } from '../../types';

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
    clinicalToday,
    safetyAlerts,
    isPatientExerciseSafetyLocked,
    clearPatientExerciseSafetyLock,
    applyInitialClinicalProfile,
  } = usePatient();
  const [showManageModal, setShowManageModal] = useState(false);
  const [showClinicalModal, setShowClinicalModal] = useState(false);
  const [revealPortalPassword, setRevealPortalPassword] = useState(false);

  useEffect(() => {
    setRevealPortalPassword(false);
  }, [selectedPatient?.id]);

  const insight = useMemo(
    () => (selectedPatient ? computeClinicalProgressInsight(selectedPatient, clinicalToday) : null),
    [selectedPatient, clinicalToday]
  );

  const unreadFromPatient = useMemo(() => {
    if (!selectedPatient) return 0;
    return getPatientMessages(selectedPatient.id).filter(
      (m) => m.fromPatient && !m.aiClinicalAlert && !m.isRead
    ).length;
  }, [selectedPatient, getPatientMessages, messages]);

  const lastAlertIso = useMemo(() => {
    if (!selectedPatient) return null;
    const mine = safetyAlerts
      .filter((a) => a.patientId === selectedPatient.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mine[0]?.createdAt ?? null;
  }, [selectedPatient, safetyAlerts]);

  if (!selectedPatient) {
    return (
      <div
        className="flex items-center justify-center h-full text-slate-500 text-sm px-4 text-center"
        dir="rtl"
        style={{ background: '#f1f5f9' }}
      >
        בחרו מטופל מרשימת הפיקוד הקליני בסרגל הצד
      </div>
    );
  }

  const p = selectedPatient;
  const style = statusStyles[p.status];
  const plan = getExercisePlan(p.id);
  const exerciseCount = plan?.exercises.length ?? 0;
  const portalAccess = getPatientCredentialsByPatientId(p.id);
  const needsClinicalSetup = p.status === 'pending' || exerciseCount === 0;

  const copyField = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#f1f5f9' }} dir="rtl">
      <div className="p-5 lg:p-6 max-w-6xl mx-auto">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/80 mb-1">
            מרכז פיקוד קליני
          </p>
          <h1 className="text-2xl font-black text-slate-900">סקירה קלינית</h1>
          <p className="text-sm text-slate-600 mt-1">
            סיכום למטופל הנבחר · נתונים חיים מהמערכת (נשמרים בדפדפן)
          </p>
        </header>

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

        {insight && (
          <ClinicalSummaryStrip
            patient={p}
            avgPain7d={insight.avgPain7d}
            currentPain={insight.currentPain}
            unreadFromPatient={unreadFromPatient}
            lastAlertIso={lastAlertIso}
          />
        )}

        <div className="rounded-2xl border bg-white p-5 shadow-sm mb-5" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
            <div className="flex items-start gap-4 flex-1">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-black shadow-md shrink-0"
                style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}
              >
                {p.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{p.name}</h2>
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
                <p className="text-sm text-blue-900/90 font-medium mt-0.5">{p.diagnosis}</p>
                <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> גיל {p.age}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5" />
                    {bodyAreaLabels[p.primaryBodyArea]}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    הצטרף: {new Date(p.joinDate).toLocaleDateString('he-IL')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    אימון אחרון: {new Date(p.lastSessionDate).toLocaleDateString('he-IL')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setShowManageModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
              >
                <ClipboardList className="w-4 h-4" />
                ניהול תוכנית
                {exerciseCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-xs font-black">
                    {exerciseCount}
                  </span>
                )}
              </button>
              {needsClinicalSetup && (
                <button
                  type="button"
                  onClick={() => setShowClinicalModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100"
                >
                  <Stethoscope className="w-4 h-4" />
                  עריכת פרופיל קליני
                </button>
              )}
            </div>
          </div>

          {p.therapistNotes && (
            <div className="mt-4 p-3 rounded-xl bg-blue-50/80 border border-blue-100 flex items-start gap-2">
              <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-950 leading-relaxed">{p.therapistNotes}</p>
            </div>
          )}
        </div>

        {insight && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <PatientAvatarStateCard patient={p} />
            <AiProgressInsightCard insight={insight} />
          </div>
        )}

        <div className="mb-5">
          <TherapistQuickChat patientId={p.id} patientName={p.name} />
        </div>

        <div className="mb-5">
          <ClinicalDeepDiveTabs patient={p} />
        </div>

        <PatientDataManagement patient={p} />

        {portalAccess ? (
          <div
            className="rounded-2xl p-5 border shadow-sm mb-5 text-white"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              borderColor: '#334155',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold">גישה לפורטל מטופל</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              העבירו למטופל את המזהה והסיסמה להתחברות ב־/login. השמירו במקום מאובטח — הדמו שומר בדפדפן בלבד.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-800/80 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">מזהה ייחודי</p>
                  <code className="text-sm font-mono font-bold text-blue-300">{portalAccess.loginId}</code>
                </div>
                <button
                  type="button"
                  onClick={() => copyField(portalAccess.loginId)}
                  className="p-2 rounded-lg text-slate-300 hover:bg-slate-700"
                  title="העתקה"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-800/80 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">סיסמה</p>
                  <code className="text-sm font-mono font-bold text-amber-200 break-all">
                    {revealPortalPassword ? portalAccess.password : '••••••••'}
                  </code>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRevealPortalPassword((v) => !v)}
                    className="p-2 rounded-lg text-slate-300 hover:bg-slate-700"
                    title={revealPortalPassword ? 'הסתר' : 'הצג'}
                  >
                    {revealPortalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyField(portalAccess.password)}
                    className="p-2 rounded-lg text-slate-300 hover:bg-slate-700"
                    title="העתקה"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600 mb-5">
            אין חשבון פורטל למטופל זה. מטופלים שנוצרו מ־«מטופל חדש + גישה» מקבלים מזהה וסיסמה אוטומטית.
          </div>
        )}

        <PendingApprovalsPanel />
        <AiSuggestionsPanel />

        {showManageModal && <ManagePlanModal onClose={() => setShowManageModal(false)} />}

        {showClinicalModal && (
          <ClinicalProfileSetupModal
            patientName={p.name}
            onClose={() => setShowClinicalModal(false)}
            onSave={(primaryBodyArea, libraryExerciseIds) =>
              applyInitialClinicalProfile(p.id, primaryBodyArea, libraryExerciseIds)
            }
          />
        )}
      </div>
    </div>
  );
}
