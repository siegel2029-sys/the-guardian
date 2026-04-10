import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Lightbulb, ExternalLink, Gift, Lock, X } from 'lucide-react';
import type { KnowledgeFact, Patient } from '../../types';
import { KNOWLEDGE_ENRICHMENT_DISCLAIMER_HE } from '../../config/clinicalDisclaimers';
import { PATIENT_REWARDS } from '../../config/patientRewards';
import { getKnowledgeSourceBadgeText } from '../../utils/knowledgeSourceBadge';
import { RewardLabel } from '../ui/RewardLabel';

interface DidYouKnowBubbleProps {
  patient: Patient;
  /** עובדות שמוצגות בפורטל (מאושרות / נוספו כברירת מחדל) */
  approvedFacts: KnowledgeFact[];
  onCollectReward: (articleId: string, options: { readerConfirmed: boolean }) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
}

const SCROLL_END_THRESHOLD_PX = 40;

function scrollReachedEnd(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_END_THRESHOLD_PX;
}

function pickFactForSession(patientId: string, approved: KnowledgeFact[]): KnowledgeFact | null {
  if (approved.length === 0) return null;
  const key = `guardian-dyk-pick-v1-${patientId}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const hit = approved.find((f) => f.id === saved);
      if (hit) return hit;
    }
  } catch {
    /* private mode */
  }
  const pick = approved[Math.floor(Math.random() * approved.length)];
  try {
    sessionStorage.setItem(key, pick.id);
  } catch {
    /* ignore */
  }
  return pick;
}

/**
 * ענן צף — בחירה אקראית אחת לסשן דפדפן מתוך עובדות מאושרות.
 */
export default function DidYouKnowBubble({
  patient,
  approvedFacts,
  onCollectReward,
  hasReadArticle,
}: DidYouKnowBubbleProps) {
  const fact = useMemo(
    () => pickFactForSession(patient.id, approvedFacts),
    [patient.id, approvedFacts]
  );

  const [expanded, setExpanded] = useState(false);
  const [successBurst, setSuccessBurst] = useState(false);
  const [readThroughContent, setReadThroughContent] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSuccessBurst(false);
    setExpanded(false);
    setReadThroughContent(false);
  }, [patient.id, fact?.id]);

  useEffect(() => {
    if (!expanded) {
      setReadThroughContent(false);
      return;
    }
    const el = scrollBodyRef.current;
    if (!el) return;

    const measure = () => {
      if (scrollReachedEnd(el)) setReadThroughContent(true);
    };

    measure();
    const t = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(t);
      ro.disconnect();
    };
  }, [expanded, fact?.id, fact?.explanation]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const closeExpanded = useCallback(() => setExpanded(false), []);

  const onScrollBody = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    if (scrollReachedEnd(el)) setReadThroughContent(true);
  }, []);

  if (!fact) return null;

  const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
  const alreadyClaimed = hasReadArticle(patient.id, fact.id);
  const canCollect = readThroughContent && !alreadyClaimed;

  const handleCollect = () => {
    if (!canCollect) return;
    const ok = onCollectReward(fact.id, { readerConfirmed: true });
    if (ok) {
      setSuccessBurst(true);
      window.setTimeout(() => setSuccessBurst(false), 1400);
    }
  };

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 pb-28 sm:p-6"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dyk-expanded-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeExpanded();
          }}
        >
          <div
            className="w-full max-w-md max-h-[min(88vh,680px)] flex flex-col rounded-3xl border-2 border-sky-200/80 bg-white shadow-2xl shadow-sky-900/15 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {successBurst && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 rounded-3xl animate-article-reward-success"
                style={{ background: 'rgba(224, 242, 254, 0.35)' }}
              >
                <span className="text-lg font-black text-emerald-800 drop-shadow-sm">מעולה! הפרס נאסף</span>
              </div>
            )}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-sky-50 to-white">
              <div className="flex items-center gap-2 min-w-0">
                <Lightbulb className="w-5 h-5 text-sky-600 shrink-0" />
                <span className="text-xs font-bold text-sky-800 uppercase tracking-wide">הידעת?</span>
                <RewardLabel xp={rxp} coins={rcoins} />
              </div>
              <button
                type="button"
                onClick={closeExpanded}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              ref={scrollBodyRef}
              onScroll={onScrollBody}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 pt-4"
            >
              <h2 id="dyk-expanded-title" className="text-base font-bold text-slate-900 leading-snug">
                {fact.title}
              </h2>
              <div className="text-sm text-slate-700 leading-relaxed mt-3 whitespace-pre-wrap break-words">
                {fact.explanation}
              </div>

              <div
                className="mt-5 rounded-xl border-2 border-slate-400 bg-slate-100/95 px-4 py-3 shadow-inner"
                role="note"
              >
                <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed text-center">
                  {KNOWLEDGE_ENRICHMENT_DISCLAIMER_HE}
                </p>
              </div>

              <div className="mt-4 pb-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex max-w-full items-center rounded-full border border-teal-200/90 bg-teal-50/90 px-3 py-1.5 text-[11px] font-bold text-teal-900"
                  role="status"
                >
                  {getKnowledgeSourceBadgeText(fact.sourceUrl)}
                </span>
              </div>
              <a
                href={fact.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 mt-3 w-full min-h-12 text-sm font-bold text-sky-950 px-4 py-3 rounded-2xl border-2 border-sky-400 bg-sky-50 hover:bg-sky-100 active:bg-sky-100 transition-colors inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                למקור המאמר המלא
              </a>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-5 py-4">
              <button
                type="button"
                onClick={handleCollect}
                disabled={!canCollect || alreadyClaimed}
                className="w-full text-sm font-bold text-white px-4 py-3 rounded-2xl border inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed bg-gradient-to-l from-teal-600 to-sky-600 border-teal-500 shadow-md"
              >
                {alreadyClaimed ? (
                  <>
                    <Gift className="w-4 h-4 shrink-0" />
                    הפרס נאסף
                  </>
                ) : canCollect ? (
                  <>
                    <Gift className="w-4 h-4 shrink-0" />
                    אסוף פרס
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 shrink-0" />
                    גללו עד הסוף כדי לאסוף את הפרס
                  </>
                )}
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-2 leading-snug">
                הפרס מיועד לקריאת התוכן באפליקציה (כולל ההבהרה); הקישור החיצוני אופציונלי.
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed z-[45] motion-safe:animate-dyk-cloud-float overflow-visible pointer-events-none"
        style={{
          bottom: 'max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom)))',
          insetInlineEnd: 'max(1rem, env(safe-area-inset-end))',
          width: '6.25rem',
          height: '5.25rem',
        }}
      >
        {/* אפקט &quot;בועות מחשבה&quot; — שלושה עיגולים בפינה העליונה-הצידית */}
        <div
          className="pointer-events-none absolute z-[1] flex flex-col-reverse items-center gap-0.5"
          style={{
            top: '-0.125rem',
            insetInlineStart: '0.25rem',
          }}
          aria-hidden
        >
          <span className="rounded-full w-2.5 h-2.5 bg-white border-2 border-sky-400 shadow-sm" />
          <span
            className="rounded-full w-2 h-2 bg-white border border-sky-400 shadow-sm"
            style={{ marginInlineStart: '0.35rem' }}
          />
          <span
            className="rounded-full w-1.5 h-1.5 bg-white border border-sky-400/90 shadow-sm"
            style={{ marginInlineStart: '0.65rem' }}
          />
        </div>

        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pointer-events-auto absolute bottom-0 end-0 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 rounded-[50%]"
          style={{
            width: '5.75rem',
            height: '4.25rem',
          }}
          aria-label={`הידעת? ${fact.teaser} — הקישו לפתיחה`}
        >
          <span className="sr-only">
            הידעת? {fact.teaser} — פתיחת עובדה
          </span>
          <svg
            viewBox="0 0 120 88"
            className="w-full h-full drop-shadow-lg"
            aria-hidden
          >
            <defs>
              <linearGradient id="dykCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.96" />
                <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.92" />
              </linearGradient>
            </defs>
            <path
              fill="url(#dykCloudGrad)"
              stroke="#7dd3fc"
              strokeWidth="1.5"
              d="M78 24c8 0 15 5 18 12 10 1 18 9 18 19 0 11-9 20-20 20H28c-11 0-20-9-20-20 0-9 6-16 14-18 2-10 11-17 22-17 2 0 4 0 6 1 4-7 11-11 19-11 10 0 18 6 21 14z"
            />
            <ellipse cx="42" cy="52" rx="22" ry="16" fill="url(#dykCloudGrad)" stroke="#7dd3fc" strokeWidth="1.2" />
            <ellipse cx="88" cy="48" rx="18" ry="14" fill="url(#dykCloudGrad)" stroke="#7dd3fc" strokeWidth="1.2" />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center pt-0.5 px-1 pointer-events-none min-w-0">
            <Lightbulb className="w-5 h-5 text-sky-600 mb-0.5 shrink-0" aria-hidden />
            <span className="text-[8px] font-black text-sky-900 leading-tight text-center line-clamp-3 break-words max-w-[5.25rem]">
              {fact.teaser}
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
