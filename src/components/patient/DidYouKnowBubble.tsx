import { useMemo, useState, useEffect, useCallback } from 'react';
import { Lightbulb, ExternalLink, Gift, Lock, X } from 'lucide-react';
import type { KnowledgeFact, Patient } from '../../types';
import { PATIENT_REWARDS } from '../../config/patientRewards';
import { RewardLabel } from '../ui/RewardLabel';

interface DidYouKnowBubbleProps {
  patient: Patient;
  /** רק עובדות שאושרו ע״י מטפל */
  approvedFacts: KnowledgeFact[];
  onCollectReward: (articleId: string, options: { readerConfirmed: boolean }) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
  hasArticleLinkOpened: (patientId: string, articleId: string) => boolean;
  onArticleLinkOpened: (patientId: string, articleId: string) => void;
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
  hasArticleLinkOpened,
  onArticleLinkOpened,
}: DidYouKnowBubbleProps) {
  const fact = useMemo(
    () => pickFactForSession(patient.id, approvedFacts),
    [patient.id, approvedFacts]
  );

  const [expanded, setExpanded] = useState(false);
  const [readChecked, setReadChecked] = useState(false);
  const [successBurst, setSuccessBurst] = useState(false);

  useEffect(() => {
    setReadChecked(false);
    setSuccessBurst(false);
    setExpanded(false);
  }, [patient.id, fact?.id]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const closeExpanded = useCallback(() => setExpanded(false), []);

  if (!fact) return null;

  const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
  const alreadyClaimed = hasReadArticle(patient.id, fact.id);
  const linkOpened = hasArticleLinkOpened(patient.id, fact.id);
  const canCollect = linkOpened && readChecked && !alreadyClaimed;

  const openArticleInNewTab = () => {
    onArticleLinkOpened(patient.id, fact.id);
    window.open(fact.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCollect = () => {
    if (!canCollect) return;
    const ok = onCollectReward(fact.id, { readerConfirmed: true });
    if (ok) {
      setSuccessBurst(true);
      setReadChecked(false);
      window.setTimeout(() => setSuccessBurst(false), 1400);
    }
  };

  return (
    <>
      {/* פאנל מורחב */}
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
            className="w-full max-w-md max-h-[min(78vh,560px)] overflow-y-auto rounded-3xl border-2 border-sky-200/80 bg-white shadow-2xl shadow-sky-900/15 relative"
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
            <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-sky-50 to-white rounded-t-3xl">
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
            <div className="p-4 sm:p-5">
              <h2 id="dyk-expanded-title" className="text-base font-bold text-slate-900 leading-snug">
                {fact.title}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mt-3">{fact.explanation}</p>
              <button
                type="button"
                onClick={openArticleInNewTab}
                className="mt-4 w-full text-sm font-bold text-sky-950 px-4 py-3 rounded-2xl border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 transition-colors inline-flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                פתיחת מקור מקצועי / מחקר
              </button>
              <label className="mt-4 flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-sky-400 text-teal-600 focus:ring-teal-500"
                  checked={readChecked}
                  disabled={alreadyClaimed || !linkOpened}
                  onChange={(e) => setReadChecked(e.target.checked)}
                />
                <span className={`text-xs leading-snug ${!linkOpened ? 'text-slate-400' : 'text-slate-700'}`}>
                  קראתי את המאמר
                  {!linkOpened && (
                    <span className="block text-[10px] text-sky-800/90 mt-0.5">
                      (יש לפתוח את הקישור לפני הסימון)
                    </span>
                  )}
                </span>
              </label>
              <button
                type="button"
                onClick={handleCollect}
                disabled={!canCollect || alreadyClaimed}
                className="mt-4 w-full text-sm font-bold text-white px-4 py-3 rounded-2xl border inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed bg-gradient-to-l from-teal-600 to-sky-600 border-teal-500 shadow-md"
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
                    פרס נעול — פתחו קישור וסמנו &quot;קראתי&quot;
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ענן צף */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed z-[45] motion-safe:animate-dyk-cloud-float outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 rounded-[50%]"
        style={{
          bottom: 'max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom)))',
          insetInlineEnd: 'max(1rem, env(safe-area-inset-end))',
          width: '5.75rem',
          height: '4.25rem',
        }}
        aria-label="הידעת? — הקישו לפתיחה"
      >
        <span className="sr-only">הידעת? פתיחת עובדה יומית</span>
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
        <span className="absolute inset-0 flex flex-col items-center justify-center pt-1 pointer-events-none">
          <Lightbulb className="w-6 h-6 text-sky-600 mb-0.5" aria-hidden />
          <span className="text-[10px] font-black text-sky-900 leading-tight px-1 text-center">הידעת?</span>
        </span>
      </button>
    </>
  );
}
