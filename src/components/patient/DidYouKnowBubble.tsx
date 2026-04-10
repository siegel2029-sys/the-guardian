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

/** טיזר ברירת מחדל כשהשדה ריק במאגר */
const DYK_DEFAULT_TEASER = 'כואב זה לא תמיד "נזק". בוא נבין למה 🤔';

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

/** כחול צי מעמיק — קו ענן 1px */
const CLOUD_STROKE = '#0f172a';

/**
 * ענן רך ומינימלי — עקומות עדינות, מקצועי.
 * viewBox 0 0 240 120
 */
const CLOUD_PATH =
  'M 40 78 C 40 52 62 38 92 40 C 108 28 140 28 156 40 C 186 36 208 52 208 74 C 208 96 186 110 124 108 C 62 110 40 96 40 78 Z';

const TRAIL_DOT = '#1e3a8a';

/** ענן מחשבה — מודאל עם Modal Title + Detailed Explanation מהדשבורד */
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

  const cloudTeaser = fact.teaser.trim() ? fact.teaser : DYK_DEFAULT_TEASER;
  const modalBodyText = (fact.explanation ?? '').trim();

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
            className="w-full max-w-2xl max-h-[min(92vh,800px)] flex flex-col rounded-2xl border border-[#0f172a] bg-white overflow-hidden relative"
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
            <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-b border-blue-100 bg-gradient-to-l from-blue-50/90 to-white">
              <div className="flex items-center gap-2 min-w-0 font-dyk-bubble">
                <Lightbulb className="w-6 h-6 shrink-0 text-[#0f172a]" strokeWidth={1.35} />
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
              {/* Modal Title + Detailed Explanation — שדות מהדשבורד (בסיס ידע) */}
              <h2
                id="dyk-expanded-title"
                className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug font-dyk-bubble"
              >
                {fact.title}
              </h2>
              <div className="text-base sm:text-[1.05rem] text-slate-700 leading-[1.75] mt-4 whitespace-pre-wrap break-words font-dyk-bubble">
                {modalBodyText || '—'}
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
                className="mb-4 mt-3 w-full min-h-12 text-sm font-bold text-[#1e3a8a] px-4 py-3 rounded-2xl border-2 border-[#1d4ed8] bg-blue-50/80 hover:bg-blue-100 active:bg-blue-100 transition-colors inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2 font-dyk-bubble"
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

      {/* פינה שמאלית-עליונה: ענן «הידעת?» */}
      <div
        className="fixed z-[45] overflow-visible pointer-events-none"
        style={{
          top: 'calc(24px + env(safe-area-inset-top, 0px))',
          left: 'calc(24px + env(safe-area-inset-left, 0px))',
        }}
      >
        <div className="animate-dyk-cloud-float pointer-events-auto">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-[min(92vw,17.75rem)] cursor-pointer flex-col items-center border-0 bg-transparent p-0 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#0f172a]/25 focus-visible:ring-offset-2"
            aria-label={`הידעת? ${cloudTeaser} — הקישו לפתיחה`}
          >
            <span className="sr-only">
              הידעת? {cloudTeaser} — פתיחת עובדה
            </span>

            <div className="relative w-full" style={{ aspectRatio: '240 / 120' }}>
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 240 120"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
              >
                <path
                  d={CLOUD_PATH}
                  fill="#ffffff"
                  stroke={CLOUD_STROKE}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="relative z-[3] flex h-full w-full flex-col items-center justify-center gap-1.5 px-[12%] pb-[16%] pt-[10%] pointer-events-none">
                <Lightbulb
                  className="h-[1.35rem] w-[1.35rem] shrink-0 text-[#0f172a] sm:h-6 sm:w-6"
                  strokeWidth={1.35}
                  aria-hidden
                />
                <span className="font-dyk-bubble line-clamp-5 max-h-[3.85rem] max-w-[11rem] break-words text-center text-[0.585rem] font-bold leading-[1.72] text-slate-800 sm:max-h-[4.35rem] sm:max-w-[11.5rem] sm:text-[0.6375rem] sm:leading-[1.74]">
                  {cloudTeaser}
                </span>
              </span>
            </div>

            {/* שתי נקודות מתחת לענן — כחול מלא, קטן יותר למטה (סגנון Image 4) */}
            <div className="mt-1 flex flex-col items-center gap-2 pt-2" aria-hidden>
              <span
                className="shrink-0 rounded-full"
                style={{ width: 8, height: 8, backgroundColor: TRAIL_DOT }}
              />
              <span
                className="shrink-0 rounded-full"
                style={{ width: 4, height: 4, backgroundColor: TRAIL_DOT }}
              />
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
