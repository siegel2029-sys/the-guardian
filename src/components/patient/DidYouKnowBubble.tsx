import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, X, ExternalLink } from 'lucide-react';
import type { Patient } from '../../types';
import { selectContextualClinicalTip } from '../../ai/patientProgressReasoning';

interface DidYouKnowBubbleProps {
  patient: Patient;
  onKnowledgeComplete: () => void;
}

export default function DidYouKnowBubble({ patient, onKnowledgeComplete }: DidYouKnowBubbleProps) {
  const tip = useMemo(
    () => selectContextualClinicalTip(patient),
    [patient.id, patient.primaryBodyArea, patient.analytics.painHistory.length]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const claimKeyRef = useRef<string | null>(null);
  /** מפתח טיפ שממתין לחזרה מלשונית המאמר (visibility) */
  const pendingReturnKeyRef = useRef<string | null>(null);

  const rewardKey = `${patient.id}:${tip.id}`;

  useEffect(() => {
    claimKeyRef.current = null;
    pendingReturnKeyRef.current = null;
  }, [patient.id, tip.id]);

  const grantOnce = useCallback(() => {
    if (claimKeyRef.current === rewardKey) return;
    claimKeyRef.current = rewardKey;
    pendingReturnKeyRef.current = null;
    onKnowledgeComplete();
  }, [rewardKey, onKnowledgeComplete]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingReturnKeyRef.current !== rewardKey) return;
      grantOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [rewardKey, grantOnce]);

  const openArticleInNewTab = () => {
    pendingReturnKeyRef.current = rewardKey;
    window.open(tip.articleUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCompleteReadInModal = () => {
    grantOnce();
    setModalOpen(false);
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
            </div>
            <p className="text-[10px] text-amber-800/80 mt-2 leading-relaxed">
              פתחו את הקישור, קראו, וחזרו לכאן — יינתנו אוטומטית נקודות ניסיון ומטבעות למידה (פעם אחת לכל כרטיס).
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
                className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #0d9488, #059669)',
                  boxShadow: '0 8px 20px -6px rgba(13, 148, 136, 0.45)',
                }}
              >
                סיימתי לקרוא — +5 מטבעות ו-+5 נק׳ ניסיון
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
