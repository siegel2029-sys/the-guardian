import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, X, ExternalLink, Gift } from 'lucide-react';
import type { Patient } from '../../types';
import { selectContextualClinicalTip } from '../../ai/patientProgressReasoning';
import { PATIENT_REWARDS } from '../../config/patientRewards';

const ARTICLE_DWELL_MS = 30_000;

interface DidYouKnowBubbleProps {
  patient: Patient;
  /** @returns true אם ניתן פרס (קריאה ראשונה למאמר) */
  onCollectReward: (articleId: string) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
}

export default function DidYouKnowBubble({
  patient,
  onCollectReward,
  hasReadArticle,
}: DidYouKnowBubbleProps) {
  const tip = useMemo(
    () => selectContextualClinicalTip(patient),
    [patient.id, patient.primaryBodyArea, patient.analytics.painHistory.length]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const claimKeyRef = useRef<string | null>(null);
  const pendingReturnKeyRef = useRef<string | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rewardKey = `${patient.id}:${tip.id}`;
  const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
  const alreadyClaimed = hasReadArticle(patient.id, tip.id);

  useEffect(() => {
    claimKeyRef.current = null;
    pendingReturnKeyRef.current = null;
  }, [patient.id, tip.id]);

  const grantOnce = useCallback(() => {
    if (claimKeyRef.current === rewardKey) return;
    const granted = onCollectReward(tip.id);
    if (granted) claimKeyRef.current = rewardKey;
    pendingReturnKeyRef.current = null;
  }, [rewardKey, onCollectReward, tip.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingReturnKeyRef.current !== rewardKey) return;
      grantOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [rewardKey, grantOnce]);

  useEffect(() => {
    if (!modalOpen || alreadyClaimed) {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      return;
    }
    dwellTimerRef.current = setTimeout(() => {
      dwellTimerRef.current = null;
      onCollectReward(tip.id);
    }, ARTICLE_DWELL_MS);
    return () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };
  }, [modalOpen, alreadyClaimed, onCollectReward, tip.id]);

  const openArticleInNewTab = () => {
    pendingReturnKeyRef.current = rewardKey;
    window.open(tip.articleUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCompleteReadInModal = () => {
    onCollectReward(tip.id);
    setModalOpen(false);
  };

  const handleCollectFromCard = () => {
    onCollectReward(tip.id);
  };

  return (
    <>
      <div
        className="rounded-2xl border p-4"
        style={{
          borderColor: '#fde68a',
          background: 'linear-gradient(135deg, #fffbeb, #ffffff)',
        }}
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#fef3c7' }}
          >
            <Lightbulb className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-1">הידעת?</p>
            <p className="text-sm font-semibold text-slate-800 leading-snug">{tip.headline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openArticleInNewTab}
                className="text-xs font-bold text-amber-950 px-3 py-1.5 rounded-xl border border-amber-400 bg-amber-100 hover:bg-amber-200 transition-colors inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                קרא עוד — מאמר / מחקר
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-xs font-semibold text-amber-900 px-3 py-1.5 rounded-xl border border-amber-300 bg-white/80 hover:bg-amber-50/90 transition-colors"
              >
                תקציר במסך
              </button>
              <button
                type="button"
                onClick={handleCollectFromCard}
                disabled={alreadyClaimed}
                className="text-xs font-bold text-white px-3 py-1.5 rounded-xl border border-emerald-600 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-opacity"
                style={{
                  background: alreadyClaimed
                    ? 'linear-gradient(135deg, #64748b, #475569)'
                    : 'linear-gradient(135deg, #059669, #0d9488)',
                  boxShadow: alreadyClaimed ? 'none' : '0 4px 14px -4px rgba(13,148,136,0.5)',
                }}
              >
                <Gift className="w-3.5 h-3.5 shrink-0" />
                {alreadyClaimed ? 'הפרס נאסף' : `אסוף פרס +${rxp} XP · ${rcoins} מטבעות`}
              </button>
            </div>
            <p className="text-[10px] text-amber-800/80 mt-2 leading-relaxed">
              פתיחת &quot;תקציר במסך&quot; ל־30 שניות מעניקה אוטומטית את הפרס (פעם אחת לכל כרטיס). אפשר גם לפתוח
              קישור ולחזור — או ללחוץ &quot;אסוף פרס&quot;.
            </p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[93] flex items-center justify-center p-4"
          style={{ background: 'rgba(120, 90, 20, 0.25)' }}
          dir="rtl"
          onClick={() => setModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 40%)',
              borderColor: '#fcd34d',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="know-modal-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-700" />
                <h2 id="know-modal-title" className="text-sm font-bold text-amber-950">
                  הידעת?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl text-amber-800 hover:bg-amber-100"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-sm font-semibold text-slate-800">{tip.headline}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{tip.explanation}</p>
              {!alreadyClaimed && (
                <p className="text-[11px] text-teal-800 font-medium bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                  השארו במסך הזה כ־30 שנ׳ — הפרס יינתן אוטומטית, או לחצו למטה לאיסוף מיידי.
                </p>
              )}
              <div
                className="rounded-2xl border border-teal-100 p-3"
                style={{ background: '#f0fdfa' }}
              >
                <p className="text-[11px] font-semibold text-teal-900 mb-2">מאמר או מחקר מומלץ</p>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    openArticleInNewTab();
                  }}
                  className="text-xs text-teal-700 font-medium flex items-center gap-1.5 hover:underline text-start w-full"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  {tip.articleTitle}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                אפשר גם לפתוח את הקישור מהכרטיס הראשי. חזרה ללשונית זו אחרי קריאה תזכה בבונוס (או לחצו למטה אם
                קראתם כאן בלבד).
              </p>
              <button
                type="button"
                onClick={handleCompleteReadInModal}
                disabled={alreadyClaimed}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  background: alreadyClaimed
                    ? 'linear-gradient(135deg, #64748b, #475569)'
                    : 'linear-gradient(135deg, #0d9488, #059669)',
                  boxShadow: alreadyClaimed ? 'none' : '0 8px 20px -6px rgba(13, 148, 136, 0.45)',
                }}
              >
                {alreadyClaimed
                  ? 'הפרס כבר נאסף לכרטיס זה'
                  : `סיימתי לקרוא — +${rxp} XP · +${rcoins} מטבעות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
