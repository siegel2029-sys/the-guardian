import { useMemo, useState, useEffect, useRef } from 'react';
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

  useEffect(() => {
    claimKeyRef.current = null;
  }, [patient.id, tip.id]);

  const handleCompleteRead = () => {
    const key = `${patient.id}:${tip.id}`;
    if (claimKeyRef.current !== key) {
      claimKeyRef.current = key;
      onKnowledgeComplete();
    }
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
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 text-xs font-bold text-amber-900 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              קרא עוד
            </button>
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
                <p className="text-[11px] font-semibold text-teal-900 mb-2">למידה נוספת</p>
                <a
                  href={tip.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-700 font-medium flex items-center gap-1.5 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  {tip.articleTitle}
                </a>
              </div>
              <button
                type="button"
                onClick={handleCompleteRead}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #0d9488, #059669)',
                  boxShadow: '0 8px 20px -6px rgba(13, 148, 136, 0.45)',
                }}
              >
                סיימתי לקרוא — קבל +5 מטבעות ו-+5 נק׳ ניסיון
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
