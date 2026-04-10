import { useMemo, useState, useEffect, useCallback, useRef, useId } from 'react';
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
  const pickKey = `guardian-dyk-pick-v3-${patientId}`;
  const sigKey = `guardian-dyk-sig-v3-${patientId}`;
  const sigNow = approved
    .map((f) => f.id)
    .sort()
    .join(',');
  try {
    const prevSig = sessionStorage.getItem(sigKey);
    if (prevSig !== sigNow) {
      sessionStorage.removeItem(pickKey);
      sessionStorage.setItem(sigKey, sigNow);
    }
    const saved = sessionStorage.getItem(pickKey);
    if (saved) {
      const hit = approved.find((f) => f.id === saved);
      if (hit) return hit;
    }
  } catch {
    /* private mode */
  }
  const pick = approved[Math.floor(Math.random() * approved.length)];
  try {
    sessionStorage.setItem(pickKey, pick.id);
  } catch {
    /* ignore */
  }
  return pick;
}

/** צורת ענן וקטורית רכה — פופים אופייניים, קו נקי */
const CLOUD_PATH =
  'M 52 148 C 28 148 18 124 36 108 C 32 84 54 62 80 68 C 96 44 132 40 158 54 C 184 46 218 62 214 90 C 242 96 248 132 222 148 H 52 Z';

/** ענן מחשבה צף — תוכן מהמאגר; מודאל עם title + explanation */
export default function DidYouKnowBubble({
  patient,
  approvedFacts,
  onCollectReward,
  hasReadArticle,
}: DidYouKnowBubbleProps) {
  const cloudFilterId = `dyk-cloud-${useId().replace(/:/g, '')}`;

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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dyk-expanded-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeExpanded();
          }}
        >
          <div
            key={fact.id}
            className="w-full max-w-2xl max-h-[min(92vh,800px)] flex flex-col rounded-2xl border-[3px] border-[#2563eb] bg-white shadow-2xl shadow-blue-900/20 overflow-hidden relative"
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
            <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-b-2 border-blue-100 bg-gradient-to-l from-blue-50/90 to-white">
              <div className="flex items-center gap-2 min-w-0 font-dyk-bubble">
                <Lightbulb className="w-6 h-6 text-[#2563eb] shrink-0" strokeWidth={1.5} />
                <span className="text-sm font-extrabold text-[#1e40af] tracking-wide">הידעת?</span>
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
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-5 scroll-smooth"
            >
              <h2
                id="dyk-expanded-title"
                className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug font-dyk-bubble"
              >
                {fact.title}
              </h2>
              <div className="text-base sm:text-[1.05rem] text-slate-700 leading-[1.75] mt-4 whitespace-pre-wrap break-words font-dyk-bubble">
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
                className="mb-4 mt-3 w-full min-h-12 text-sm font-bold text-[#1e3a8a] px-4 py-3 rounded-2xl border-[3px] border-[#2563eb] bg-blue-50/80 hover:bg-blue-100 active:bg-blue-100 transition-colors inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 font-dyk-bubble"
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

      {/* ענן מחשבה רך (וקטור) + נקודות זנב — אנימציית ציפה על כל הקבוצה */}
      <div
        className="fixed z-[45] overflow-visible pointer-events-none"
        style={{
          top: 'calc(24px + env(safe-area-inset-top, 0px))',
          left: 'calc(24px + env(safe-area-inset-left, 0px))',
        }}
      >
        <div className="animate-dyk-cloud-float relative inline-block w-[min(92vw,17.75rem)] pointer-events-auto">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="relative z-[2] w-full cursor-pointer border-0 bg-transparent p-0 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/45 focus-visible:ring-offset-2 rounded-[3rem]"
            style={{ aspectRatio: '260 / 165' }}
            aria-label={`הידעת? ${fact.teaser} — הקישו לפתיחה`}
          >
            <span className="sr-only">
              הידעת? {fact.teaser} — פתיחת עובדה
            </span>
            <svg
              className="absolute inset-0 h-full w-full text-[#2563eb]"
              viewBox="0 0 260 165"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <defs>
                <filter id={cloudFilterId} x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#2563eb" floodOpacity="0.11" />
                </filter>
              </defs>
              <path
                d={CLOUD_PATH}
                fill="#ffffff"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={`url(#${cloudFilterId})`}
              />
            </svg>

            <span className="relative z-[3] flex h-full w-full flex-col items-center justify-center gap-2 px-[13%] pb-[20%] pt-[11%] pointer-events-none">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12" aria-hidden>
                <span className="absolute rounded-full bg-[#2563eb]/18 blur-xl" style={{ width: '2.5rem', height: '2.5rem' }} />
                <Lightbulb
                  className="relative z-[1] h-9 w-9 text-[#2563eb] sm:h-10 sm:w-10"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <span className="font-dyk-bubble line-clamp-5 max-h-[5.5rem] max-w-[10.5rem] break-words text-center text-[0.9375rem] font-bold leading-[1.5] text-slate-900 sm:max-h-[6.25rem] sm:max-w-[11.75rem] sm:text-lg sm:leading-[1.48]">
                {fact.teaser}
              </span>
            </span>
          </button>

          <div
            dir="ltr"
            className="pointer-events-none absolute z-[1] flex flex-row items-end"
            style={{
              bottom: '6%',
              left: '54%',
              gap: '0.7rem',
            }}
            aria-hidden
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563eb]" />
            <span className="h-1.5 w-1.5 shrink-0 translate-x-0.5 translate-y-3.5 rounded-full bg-[#2563eb]/85" />
          </div>
        </div>
      </div>
    </>
  );
}
