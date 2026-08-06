import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useOpenOnboardingLeads } from '../../hooks/useOpenOnboardingLeads';
import {
  usePatientCloudSync,
  usePatientClinical,
  usePatientRoster,
} from '../../context/patientDomainHooks';
import {
  allowChatForOnboardingLeadStatus,
  HIGH_PAIN_THRESHOLD,
  RED_FLAG_QUESTIONS,
  updateLeadStatus,
  type OnboardingLeadRow,
  type OnboardingLeadStatus,
  type RedFlagId,
} from '../../services/onboardingLeadService';
import {
  portalUsernameFromLeadName,
  temporaryPasswordFromFirstName,
} from '../../utils/onboardingLeadCredentials';
import {
  mapQuestionnaireToInitialClinicalExtras,
  proposeProgramFromQuestionnaire,
} from '../../utils/onboardingLeadIntakeMap';
import { prefetchExerciseCatalog } from '../../services/exerciseCatalogService';
import { bodyAreaLabels } from '../../types';

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

const STATUS_LABELS: Record<OnboardingLeadStatus, string> = {
  abandoned: 'ננטש',
  pending_paybox: 'ממתין לתשלום',
  pending_zoom: 'ממתין לזום',
  converted: 'הומר',
};

const STATUS_STYLES: Record<OnboardingLeadStatus, { bg: string; text: string; border: string }> = {
  abandoned: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  pending_paybox: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  pending_zoom: { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' },
  converted: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
};

const CLINICAL_LABELS: Record<string, string> = {
  pain_location: 'מיקום הכאב',
  pain_level: 'עוצמת כאב',
  aggravating_easing: 'מחמיר / מקל',
  duration: 'משך הזמן',
  hardest_activities: 'פעילויות קשות',
  movement_fear: 'פחד מתנועה (1–5)',
  rehab_goal: 'מטרת השיקום',
};

function formatLeadDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function LeadQuestionnaire({ data }: { data: Record<string, unknown> }) {
  const redFlags = asRecord(data.red_flags);
  const clinical = asRecord(data.clinical);

  const hasRedFlags = redFlags != null;
  const hasClinical = clinical != null && Object.keys(clinical).length > 0;

  if (!hasRedFlags && !hasClinical) {
    return (
      <p className="text-xs text-slate-500 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
        אין נתוני שאלון שמורים לליד זה.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
      {hasRedFlags && (
        <div>
          <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide mb-2">
            סינון דגלים אדומים
          </p>
          <ul className="space-y-1.5">
            {RED_FLAG_QUESTIONS.map(({ id, question }) => {
              const answer = redFlags[id as RedFlagId];
              const yes = answer === true;
              const no = answer === false;
              return (
                <li
                  key={id}
                  className="flex items-start gap-2 text-xs text-slate-700 leading-snug"
                >
                  <span
                    className={`shrink-0 mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-md border ${
                      yes
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : no
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {yes ? 'כן' : no ? 'לא' : '—'}
                  </span>
                  <span>{question}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasClinical && (
        <div>
          <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide mb-2">
            פרופיל קליני
          </p>
          <dl className="space-y-2">
            {Object.entries(CLINICAL_LABELS).map(([key, label]) => {
              const raw = clinical[key];
              if (raw == null || raw === '') return null;
              return (
                <div key={key} className="rounded-lg bg-white/80 border border-teal-100 px-2.5 py-2">
                  <dt className="text-[10px] font-bold text-slate-500 mb-0.5">{label}</dt>
                  <dd className="text-xs font-semibold text-slate-800 whitespace-pre-wrap break-words">
                    {String(raw)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}

type ConvertSuccess = {
  /** Email used for portal login (lead email). */
  loginEmail: string;
  password: string;
  displayName: string;
  allowChat: boolean;
  exerciseCount: number;
  primaryBodyAreaLabel: string;
};

function LeadCard({
  lead,
  onConverted,
  onConvertSuccess,
}: {
  lead: OnboardingLeadRow;
  onConverted: () => void;
  onConvertSuccess: (creds: ConvertSuccess) => void;
}) {
  const { createPatientWithAccess } = usePatientRoster();
  const { applyInitialClinicalProfile } = usePatientClinical();
  const { savePersistedStateToCloud } = usePatientCloudSync();
  const [expanded, setExpanded] = useState(false);
  const [converting, setConverting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const status = lead.status in STATUS_LABELS ? lead.status : 'abandoned';
  const statusStyle = STATUS_STYLES[status];
  const highPain =
    lead.pain_level != null && lead.pain_level >= HIGH_PAIN_THRESHOLD;
  const displayName = lead.full_name?.trim() || 'מטופל חדש';
  const allowChat = allowChatForOnboardingLeadStatus(status);

  const handleConvert = async () => {
    if (converting) return;
    const confirmed = window.confirm(
      allowChat
        ? `לאשר ולהפוך את «${displayName}» למטופל עם גישת צ'אט (מסלול ליווי אישי)?`
        : `לאשר תשלום ולהפוך את «${displayName}» למטופל בתוכנית עצמאית (ללא צ'אט)?`
    );
    if (!confirmed) return;

    setConverting(true);
    setActionError(null);
    try {
      const loginEmail = lead.email?.trim().toLowerCase() ?? '';
      if (!loginEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
        setActionError('לליד חסרה כתובת אימייל תקינה — לא ניתן ליצור חשבון כניסה.');
        return;
      }

      const password = temporaryPasswordFromFirstName(displayName);
      // Internal unique portal username (not shown); Auth login uses the lead email.
      const portalUsername = portalUsernameFromLeadName(displayName, lead.id);
      const created = await createPatientWithAccess(displayName, {
        portalUsername,
        password,
        allowChat,
        selectAfterCreate: false,
        authEmail: loginEmail,
      });
      if (!created.ok) {
        // Lead stays open — createPatientWithAccess rolls back orphan patients on signup failure.
        setActionError(created.message);
        return;
      }

      try {
        await prefetchExerciseCatalog();
      } catch {
        // Continue with whatever is already cached; plan may fall back to empty.
      }

      const intakeExtras = mapQuestionnaireToInitialClinicalExtras(
        lead.questionnaire_data,
        displayName,
        { phone: lead.phone, email: loginEmail }
      );
      const program = proposeProgramFromQuestionnaire(
        lead.questionnaire_data,
        intakeExtras.intakeStory
      );
      applyInitialClinicalProfile(
        created.patientId,
        program.primaryBodyArea,
        program.libraryExerciseIds,
        intakeExtras
      );
      void savePersistedStateToCloud({ immediate: true });

      const converted = await updateLeadStatus(lead.id, 'converted');
      if (!converted.ok) {
        setActionError(converted.message);
        return;
      }

      onConvertSuccess({
        loginEmail,
        password: created.password,
        displayName,
        allowChat,
        exerciseCount: program.libraryExerciseIds.length,
        primaryBodyAreaLabel:
          bodyAreaLabels[program.primaryBodyArea] ?? program.primaryBodyArea,
      });
      onConverted();
    } finally {
      setConverting(false);
    }
  };

  return (
    <article
      className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm"
      style={{ boxShadow: '0 4px 20px -10px rgba(13, 148, 136, 0.3)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <UserRound className="w-5 h-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-slate-950 truncate">{displayName}</h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
            >
              {STATUS_LABELS[status]}
            </span>
            {lead.pain_level != null && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  highPain
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title="עוצמת כאב"
              >
                כאב {lead.pain_level}/10
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            נרשם {formatLeadDate(lead.created_at)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 min-w-0">
          <Phone className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden />
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="font-semibold text-slate-800 truncate hover:text-teal-700"
              dir="ltr"
            >
              {lead.phone}
            </a>
          ) : (
            <span className="text-slate-400">אין טלפון</span>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 min-w-0">
          <Mail className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden />
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="font-semibold text-slate-800 truncate hover:text-teal-700"
              dir="ltr"
            >
              {lead.email}
            </a>
          ) : (
            <span className="text-slate-400">אין אימייל</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 border border-teal-100 hover:bg-teal-100/80 transition-colors min-h-[44px]"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" aria-hidden />
            הסתר שאלון
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" aria-hidden />
            הצג תשובות שאלון
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          <LeadQuestionnaire data={lead.questionnaire_data ?? {}} />
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleConvert()}
        disabled={converting}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors min-h-[44px]"
      >
        {converting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ממיר למטופל…
          </>
        ) : (
          <>
            <UserCheck className="w-4 h-4" aria-hidden />
            אשר תשלום והפוך למטופל
          </>
        )}
      </button>
      {actionError && (
        <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
          {actionError}
        </p>
      )}
    </article>
  );
}

export default function OnboardingLeadsPanel() {
  const [open, setOpen] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<ConvertSuccess | null>(null);
  const { leads, openCount, loading, error, refresh } = useOpenOnboardingLeads();

  const openModal = () => {
    setOpen(true);
    void refresh();
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="px-3 pb-3 border-b border-teal-50 shrink-0">
        <button
          type="button"
          onClick={openModal}
          className="relative w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold text-teal-900 bg-teal-50 border-2 border-teal-200 hover:bg-teal-100 hover:border-teal-300 transition-colors min-h-[44px]"
          aria-label={
            openCount > 0 ? `לידים חדשים, ${openCount} ממתינים` : 'לידים חדשים'
          }
        >
          <ClipboardList className="w-4 h-4 shrink-0" aria-hidden />
          לידים חדשים
          {openCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-teal-700 text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-sm">
              {openCount > 99 ? '99+' : openCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: 'rgba(15, 23, 42, 0.5)' }}
            dir="rtl"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-teal-100 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-leads-title"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-teal-100 bg-slate-50 shrink-0">
                <div className="min-w-0">
                  <h2
                    id="onboarding-leads-title"
                    className="text-sm font-black text-slate-900 flex items-center gap-2"
                  >
                    <ClipboardList className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
                    לידים חדשים
                    {openCount > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-700 text-white">
                        {openCount}
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    נרשמים ממשפך ההצטרפות שטרם הומרו למטופלים
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-teal-700 border border-transparent hover:border-teal-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
                    aria-label="רענון רשימת לידים"
                    title="רענון"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="סגור"
                  >
                    <X className="w-5 h-5" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {loading && leads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-600" aria-hidden />
                    <p className="text-sm font-semibold">טוען לידים…</p>
                  </div>
                ) : error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
                    <p className="text-sm font-bold text-red-800">{error}</p>
                    <button
                      type="button"
                      onClick={() => void refresh()}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 min-h-[44px]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                      נסו שוב
                    </button>
                  </div>
                ) : leads.length === 0 ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-12 text-center">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden />
                    <p className="text-sm font-bold text-slate-700">אין לידים ממתינים</p>
                    <p className="text-xs text-slate-500 mt-1">
                      כשמישהו נרשם דרך /join, הוא יופיע כאן.
                    </p>
                  </div>
                ) : (
                  leads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onConverted={() => void refresh()}
                      onConvertSuccess={setConvertSuccess}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {convertSuccess && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            style={{ background: 'rgba(15, 23, 42, 0.55)' }}
            dir="rtl"
            onClick={() => setConvertSuccess(null)}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-teal-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-convert-success-title"
            >
              <div className="px-4 py-3 border-b border-teal-100 bg-teal-50/60 flex items-center justify-between gap-2">
                <h2
                  id="lead-convert-success-title"
                  className="text-sm font-black text-slate-900 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-teal-700" aria-hidden />
                  הליד הומר למטופל
                </h2>
                <button
                  type="button"
                  onClick={() => setConvertSuccess(null)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="סגור"
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <p className="text-slate-700">
                  <span className="font-bold">{convertSuccess.displayName}</span> נוסף לרשימת
                  המטופלים — אינטייק מולא ותוכנית תרגול ראשונית נוצרה אוטומטית
                  {convertSuccess.exerciseCount > 0
                    ? ` (${convertSuccess.exerciseCount} תרגילים · ${convertSuccess.primaryBodyAreaLabel})`
                    : ''}
                  .
                  {!convertSuccess.allowChat && (
                    <span className="block mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      תוכנית עצמאית — צ׳אט ישיר עם המטפל נעול בפורטל.
                    </span>
                  )}
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-500">שם מטופל</p>
                      <p className="font-bold text-slate-900 truncate">
                        {convertSuccess.displayName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(convertSuccess.displayName)}
                      className="p-2 rounded-lg text-teal-700 hover:bg-teal-50 shrink-0"
                      aria-label="העתק שם"
                    >
                      <Copy className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-500">אימייל להתחברות</p>
                      <p className="font-mono font-bold text-slate-900 truncate" dir="ltr">
                        {convertSuccess.loginEmail}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(convertSuccess.loginEmail)}
                      className="p-2 rounded-lg text-teal-700 hover:bg-teal-50 shrink-0"
                      aria-label="העתק אימייל"
                    >
                      <Copy className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-500">
                        סיסמה זמנית (8 תווים משם פרטי)
                      </p>
                      <p className="font-mono font-bold text-slate-900 tracking-wide" dir="ltr">
                        {convertSuccess.password}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(convertSuccess.password)}
                      className="p-2 rounded-lg text-teal-700 hover:bg-teal-50 shrink-0"
                      aria-label="העתק סיסמה"
                    >
                      <Copy className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  המטופל מתחבר לפורטל עם האימייל והסיסמה הזמנית. מומלץ לשלוח את הפרטים לכתובת
                  האימייל שלו.
                </p>
                <button
                  type="button"
                  onClick={() => setConvertSuccess(null)}
                  className="w-full min-h-[44px] rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700"
                >
                  הבנתי
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
