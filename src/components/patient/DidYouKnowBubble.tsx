import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { CLINICAL_TIPS } from '../../data/clinicalTips';

interface DidYouKnowBubbleProps {
  patientId: string;
  onClaimCoins: (tipId: string) => void;
}

export default function DidYouKnowBubble({ patientId, onClaimCoins }: DidYouKnowBubbleProps) {
  const tip = useMemo(() => {
    const idx = Math.floor(Math.random() * CLINICAL_TIPS.length);
    return CLINICAL_TIPS[idx];
  }, [patientId]);

  const [expanded, setExpanded] = useState(false);
  /** מפתח לפרסום חד-פעמי לכל הרחבה / מטופל (עמיד ל-Strict Mode) */
  const claimKeyRef = useRef<string | null>(null);

  useEffect(() => {
    claimKeyRef.current = null;
  }, [patientId, tip.id]);

  useEffect(() => {
    if (!expanded) return;
    const key = `${patientId}:${tip.id}`;
    if (claimKeyRef.current === key) return;
    claimKeyRef.current = key;
    onClaimCoins(tip.id);
  }, [expanded, patientId, tip.id, onClaimCoins]);

  const handleToggle = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  const sentences = tip.explanation.split(/(?<=[.!?])\s+/).filter(Boolean);
  const line1 = sentences[0] ?? tip.explanation;
  const line2 = sentences.slice(1).join(' ') || '';

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="w-full text-start rounded-2xl border p-4 transition-all hover:shadow-md"
      style={{
        borderColor: '#fde68a',
        background: 'linear-gradient(135deg, #fffbeb, #ffffff)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: '#fef3c7' }}
        >
          <Lightbulb className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-1">
            הידעת?
          </p>
          <p className="text-sm font-semibold text-slate-800 leading-snug">{tip.headline}</p>
          {expanded && (
            <div className="mt-2 text-xs text-slate-600 leading-relaxed space-y-1">
              <p>{line1}</p>
              {line2 ? <p>{line2}</p> : null}
              <p className="text-amber-800 font-semibold mt-2">+5 מטבעות למידה</p>
            </div>
          )}
        </div>
        <div className="shrink-0 text-amber-700">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>
    </button>
  );
}
