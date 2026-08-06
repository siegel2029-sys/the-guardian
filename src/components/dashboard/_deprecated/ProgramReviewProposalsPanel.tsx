// @ts-nocheck
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Minus,
  X,
} from 'lucide-react';
import { useProgramReviewProposals } from '../../hooks/useProgramReviewProposals';
import { usePatientRoster } from '../../context/patientDomainHooks';
import type {
  ProgramReviewEngineStatus,
  ProgramReviewProposalRow,
} from '../../services/programReviewService';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import {
  NEW_PATIENT_GRACE_DAYS,
  REJECTION_COOLDOWN_DAYS,
} from '../../ai/programReviewEngine';

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

const DECISION_UI: Record<
  ProgramReviewProposalRow['decision'],
  { label: string; icon: typeof TrendingUp; bg: string; text: string }
> = {
  reduce: {
    label: 'הפחתה / החלפה',
    icon: TrendingDown,
    bg: 'bg-amber-50',
    text: 'text-amber-800',
  },
  progress: {
    label: 'התקדמות',
    icon: TrendingUp,
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
  },
  maintain: {
    label: 'שמירה',
    icon: Minus,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
  },
};

function formatDate(iso: string): string {
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

function ProposalCard({
  proposal,
  patientName,
  busy,
  onApprove,
  onDecline,
}: {
  proposal: ProgramReviewProposalRow;
  patientName: string;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const ui = DECISION_UI[proposal.decision];
  const Icon = ui.icon;
  const actionableChanges = proposal.proposed_changes.filter((c) => c.action !== 'keep');
  const catalogSwaps = proposal.proposed_changes.filter(
    (c) => c.action === 'swap' || c.action === 'progress_swap'
  ).length;

  return (
    <article
      className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm"
      style={{ boxShadow: '0 4px 20px -10px rgba(13, 148, 136, 0.3)' }}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ui.bg}`}
        >
          <Icon className={`w-5 h-5 ${ui.text}`} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-slate-950 truncate">{patientName}</h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ui.bg} ${ui.text}`}
            >
              {ui.label}
            </span>
            {catalogSwaps > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-800 border border-indigo-100">
                {catalogSwaps} החלפות מקטלוג
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            חלון {proposal.review_window_start} – {proposal.review_window_end} ·{' '}
            {formatDate(proposal.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {proposal.metrics.avgPain != null && (
              <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                ממוצע כאב {proposal.metrics.avgPain}/10
              </span>
            )}
            {proposal.metrics.maxPain != null && (
              <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                שיא {proposal.metrics.maxPain}/10
              </span>
            )}
            {proposal.metrics.adherenceRate != null && (
              <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                הקפדה {Math.round(proposal.metrics.adherenceRate * 100)}%
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
              {proposal.metrics.logDays} ימי דיווח
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-600 leading-relaxed rounded-xl px-3 py-2 bg-teal-50/60 border border-teal-100">
        {proposal.rationale}
      </p>

      {actionableChanges.length > 0 && (
        <ul className="mt-3 space-y-2">
          {actionableChanges.slice(0, 8).map((c) => (
            <li
              key={`${c.exerciseId}-${c.action}`}
              className="text-xs rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
            >
              <p className="font-bold text-slate-800">{c.exerciseName}</p>
              <p className="text-slate-600 mt-0.5">
                {(c.action === 'swap' || c.action === 'progress_swap') &&
                c.swapToExerciseName
                  ? `החלפת קטלוג → ${c.swapToExerciseName}`
                  : c.fromReps !== c.toReps
                    ? `חזרות ${c.fromReps} → ${c.toReps}`
                    : `סטים ${c.fromSets} → ${c.toSets}`}
              </p>
              <p className="text-slate-500 mt-1 leading-relaxed">{c.noteHebrew}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ThumbsUp className="w-4 h-4" aria-hidden />}
          אשר ועדכן תוכנית
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
          style={{ borderColor: '#fca5a5', color: '#ef4444', background: '#fff5f5' }}
        >
          <ThumbsDown className="w-4 h-4" aria-hidden />
          דחה
        </button>
      </div>
    </article>
  );
}

function EnginePhaseBanner({ status }: { status: ProgramReviewEngineStatus | null }) {
  if (!status) return null;
  if (status.phase === 'scanning') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 font-semibold">
        <Search className="w-3.5 h-3.5 animate-pulse shrink-0" aria-hidden />
        המנוע סורק את קטלוג התרגילים ומחפש עדכונים ברקע…
      </div>
    );
  }
  if (status.phase === 'analyzing') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 font-semibold">
        <Sparkles className="w-3.5 h-3.5 animate-pulse shrink-0" aria-hidden />
        מנתח דיווחי 3 ימים ומכין הצעות התאמה…
      </div>
    );
  }
  const finished = status.finishedAt ? formatDate(status.finishedAt) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
      מנוע ברקע פעיל · שבוע ראשון ללא הצעות · אחרי דחייה המתנה של {REJECTION_COOLDOWN_DAYS} ימים
      {finished ? ` · סריקה אחרונה ${finished}` : ''}
      {' · '}חסד מטופל חדש {NEW_PATIENT_GRACE_DAYS} ימים
    </div>
  );
}

export default function ProgramReviewProposalsPanel() {
  const { patients, selectedPatient, selectPatient } = usePatientRoster();
  const {
    proposals,
    pendingCount,
    engineStatus,
    engineActive,
    loading,
    error,
    actionBusyId,
    forceBusy,
    refresh,
    approve,
    decline,
    forceReviewNow,
  } = useProgramReviewProposals();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [forceInfo, setForceInfo] = useState<string | null>(null);

  const patientName = (patientId: string) => {
    const p = patients.find((x) => x.id === patientId);
    return p ? getPatientDisplayName(p) : 'מטופל';
  };

  const handleApprove = async (proposal: ProgramReviewProposalRow) => {
    if (actionBusyId) return;
    const ok = window.confirm(
      `לאשר את התאמת התוכנית עבור «${patientName(proposal.patient_id)}» ולעדכן את התוכנית הפעילה?`
    );
    if (!ok) return;
    setActionError(null);
    const result = await approve(proposal.id);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    selectPatient(proposal.patient_id, { openSection: 'overview' });
  };

  const handleDecline = async (proposal: ProgramReviewProposalRow) => {
    if (actionBusyId) return;
    const ok = window.confirm(
      `לדחות את ההצעה עבור «${patientName(proposal.patient_id)}»? התוכנית לא תשתנה. המנוע ימתין לפחות ${REJECTION_COOLDOWN_DAYS} ימים לפני מחזור ביקורת חדש.`
    );
    if (!ok) return;
    setActionError(null);
    const result = await decline(proposal.id);
    if (!result.ok) setActionError(result.message);
  };

  const handleForceReview = async () => {
    if (!selectedPatient) {
      setActionError('בחרו מטופל ברשימה לפני הרצת בדיקה.');
      return;
    }
    const label = getPatientDisplayName(selectedPatient);
    const ok = window.confirm(
      `להריץ ביקורת תוכנית אוטומטית עכשיו עבור «${label}»?\n` +
        'מנוע חוקים קליני (לא Gemini) — עוקף את חלון 3 הימים / שבוע החסד / קירור דחייה — לבדיקה בלבד. התוכנית לא תתעדכן ללא אישור.'
    );
    if (!ok) return;
    setActionError(null);
    setForceInfo(null);
    const result = await forceReviewNow(selectedPatient.id);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setForceInfo(
      `בדיקה הושלמה: ${result.decision} → ${result.status}` +
        (result.catalogDrivenSwaps > 0
          ? ` · ${result.catalogDrivenSwaps} החלפות מקטלוג`
          : '')
    );
  };

  return (
    <div className="px-3 py-2 border-b-2 border-slate-100 shrink-0" dir="rtl">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-xl border-2 border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40 transition-colors min-h-[44px]"
        aria-label={`הצעות ביקורת תוכנית${pendingCount > 0 ? `, ${pendingCount} ממתינות` : ''}${engineActive ? ', המנוע פעיל' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {engineActive ? (
            <Loader2 className="w-4 h-4 text-teal-700 shrink-0 animate-spin" aria-hidden />
          ) : (
            <ClipboardCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
          )}
          <span className="text-xs font-black text-slate-900 truncate">ביקורת 3 ימים</span>
          {engineActive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-sky-50 text-sky-800 border border-sky-100 shrink-0">
              {engineStatus?.phase === 'scanning' ? 'סורק' : 'מנתח'}
            </span>
          )}
        </div>
        {pendingCount > 0 ? (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-teal-700 text-white text-[10px] font-black flex items-center justify-center">
            {pendingCount}
          </span>
        ) : (
          <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0" aria-hidden />
        )}
      </button>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6"
            style={{ background: 'rgba(15, 23, 42, 0.45)' }}
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-lg max-h-[min(88vh,720px)] overflow-hidden flex flex-col rounded-3xl border-2 border-slate-200 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="program-review-title"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
                <div className="min-w-0">
                  <h2
                    id="program-review-title"
                    className="text-sm font-black text-slate-950"
                  >
                    הצעות התאמת תוכנית
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ביקורת רקע כל 3 ימים — יישום רק אחרי אישור מטפל
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 min-w-[40px] min-h-[40px] flex items-center justify-center"
                    aria-label="רענון"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 min-w-[40px] min-h-[40px] flex items-center justify-center"
                    aria-label="סגור"
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <EnginePhaseBanner status={engineStatus} />
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2.5">
                  <p className="text-[11px] text-slate-600 leading-relaxed mb-2">
                    בדיקת מפתחים: הרצה מיידית על המטופל הנבחר (עוקף מגבלת 3 ימים).
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleForceReview()}
                    disabled={forceBusy || !selectedPatient}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'linear-gradient(135deg, #0f766e, #0d9488)' }}
                    aria-label="הרץ ביקורת תוכנית אוטומטית עכשיו"
                  >
                    {forceBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    ) : (
                      <FlaskConical className="w-4 h-4" aria-hidden />
                    )}
                    הרץ ביקורת תוכנית עכשיו
                    {selectedPatient
                      ? ` — ${getPatientDisplayName(selectedPatient)}`
                      : ' (בחרו מטופל)'}
                  </button>
                </div>
                {forceInfo && (
                  <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                    {forceInfo}
                  </p>
                )}
                {actionError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {actionError}
                  </p>
                )}
                {error && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}
                {loading && proposals.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                    טוען הצעות…
                  </div>
                ) : proposals.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-10 leading-relaxed px-4">
                    אין הצעות ממתינות. המנוע רץ ברקע (ללא חסימת מטופלים): שבוע ראשון ללא הצעות,
                    ואחרי דחייה המתנה של מחזור מלא לפני סריקה חוזרת.
                  </p>
                ) : (
                  proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      patientName={patientName(p.patient_id)}
                      busy={actionBusyId === p.id}
                      onApprove={() => void handleApprove(p)}
                      onDecline={() => void handleDecline(p)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
