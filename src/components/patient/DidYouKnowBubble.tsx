import { useMemo, useState, useEffect } from 'react';
import { Lightbulb, ExternalLink, Gift, Lock } from 'lucide-react';
import type { Patient } from '../../types';
import { selectContextualClinicalTip } from '../../ai/patientProgressReasoning';
import { PATIENT_REWARDS } from '../../config/patientRewards';
import { RewardLabel } from '../ui/RewardLabel';

interface DidYouKnowBubbleProps {
  patient: Patient;
  onCollectReward: (articleId: string, options: { readerConfirmed: boolean }) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
  hasArticleLinkOpened: (patientId: string, articleId: string) => boolean;
  onArticleLinkOpened: (patientId: string, articleId: string) => void;
}

export default function DidYouKnowBubble({
  patient,
  onCollectReward,
  hasReadArticle,
  hasArticleLinkOpened,
  onArticleLinkOpened,
}: DidYouKnowBubbleProps) {
  const tip = useMemo(
    () => selectContextualClinicalTip(patient),
    [patient.id, patient.primaryBodyArea, patient.analytics.painHistory.length]
  );

  const [readChecked, setReadChecked] = useState(false);
  const [successBurst, setSuccessBurst] = useState(false);

  useEffect(() => {
    setReadChecked(false);
    setSuccessBurst(false);
  }, [patient.id, tip.id]);

  const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
  const alreadyClaimed = hasReadArticle(patient.id, tip.id);
  const linkOpened = hasArticleLinkOpened(patient.id, tip.id);
  const canCollect = linkOpened && readChecked && !alreadyClaimed;

  const openArticleInNewTab = () => {
    onArticleLinkOpened(patient.id, tip.id);
    window.open(tip.articleUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCollect = () => {
    if (!canCollect) return;
    const ok = onCollectReward(tip.id, { readerConfirmed: true });
    if (ok) {
      setSuccessBurst(true);
      setReadChecked(false);
      window.setTimeout(() => setSuccessBurst(false), 1400);
    }
  };

  return (
    <div
      className="rounded-2xl border p-4 relative overflow-hidden"
      style={{
        borderColor: '#fde68a',
        background: 'linear-gradient(135deg, #fffbeb, #ffffff)',
      }}
      dir="rtl"
    >
      {successBurst && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 animate-article-reward-success"
          style={{ background: 'rgba(253, 224, 71, 0.22)' }}
        >
          <span className="text-lg font-black text-emerald-800 drop-shadow-sm">מעולה! הפרס נאסף</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: '#fef3c7' }}
        >
          <Lightbulb className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">הידעת?</p>
            <RewardLabel xp={rxp} coins={rcoins} />
          </div>
          <p className="text-sm font-semibold text-slate-800 leading-snug">{tip.headline}</p>
          <p className="text-xs text-slate-600 leading-relaxed mt-2">{tip.explanation}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openArticleInNewTab}
              className="text-xs font-bold text-amber-950 px-3 py-1.5 rounded-xl border border-amber-400 bg-amber-100 hover:bg-amber-200 transition-colors inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              פתח מאמר / מחקר
            </button>
          </div>

          <label className="mt-3 flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-amber-400 text-teal-600 focus:ring-teal-500"
              checked={readChecked}
              disabled={alreadyClaimed || !linkOpened}
              onChange={(e) => setReadChecked(e.target.checked)}
            />
            <span className={`text-xs leading-snug ${!linkOpened ? 'text-slate-400' : 'text-slate-700'}`}>
              קראתי את המאמר
              {!linkOpened && (
                <span className="block text-[10px] text-amber-800/90 mt-0.5">
                  (יש לפתוח את הקישור לפני הסימון)
                </span>
              )}
            </span>
          </label>

          <button
            type="button"
            onClick={handleCollect}
            disabled={!canCollect || alreadyClaimed}
            className="mt-3 w-full text-xs font-bold text-white px-3 py-2.5 rounded-xl border inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: alreadyClaimed
                ? 'linear-gradient(135deg, #64748b, #475569)'
                : canCollect
                  ? 'linear-gradient(135deg, #059669, #0d9488)'
                  : 'linear-gradient(135deg, #94a3b8, #64748b)',
              borderColor: alreadyClaimed ? '#475569' : '#0f766e',
              boxShadow:
                canCollect && !alreadyClaimed ? '0 4px 14px -4px rgba(13,148,136,0.45)' : 'none',
            }}
          >
            {alreadyClaimed ? (
              <>
                <Gift className="w-3.5 h-3.5 shrink-0" />
                הפרס נאסף
              </>
            ) : canCollect ? (
              <>
                <Gift className="w-3.5 h-3.5 shrink-0" />
                אסוף פרס
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 shrink-0" />
                פרס נעול — פתח קישור וסמן &quot;קראתי&quot;
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
