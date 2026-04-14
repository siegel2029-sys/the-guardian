import { useEffect, useRef, useState } from 'react';
import GuardiCelebration from './GordyCelebration';
import GordieCanvas from './GordieCanvas';
import type { GuardieModelHandle } from './GordieModel';

type Props = {
  patientId: string;
  celebrationBurstKey?: number;
  /** GLTF animation clip to play on the welcome hero (e.g. `Wave`). */
  animationName?: string;
};

/**
 * גארדי — תצוגת פתיחה עם מודל GLB מריגוד, ברכה לסשן וקונפטי לפי מפתח חגיגה.
 */
export default function GuardiHero({
  patientId,
  celebrationBurstKey = 0,
  animationName = 'Wave',
}: Props) {
  const guardiRef = useRef<GuardieModelHandle>(null);
  const prevBurstRef = useRef(0);
  const [spinDone, setSpinDone] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const key = `guardi_welcome_${patientId}`;
    setShowWelcome(sessionStorage.getItem(key) !== '1');
    const t = window.setTimeout(() => setSpinDone(true), 2100);
    return () => window.clearTimeout(t);
  }, [patientId]);

  useEffect(() => {
    if (celebrationBurstKey > 0 && celebrationBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = celebrationBurstKey;
      guardiRef.current?.celebrate();
    }
  }, [celebrationBurstKey]);

  const dismissWelcome = () => {
    sessionStorage.setItem(`guardi_welcome_${patientId}`, '1');
    setShowWelcome(false);
  };

  return (
    <div className="relative w-full h-full min-h-[inherit]">
      {showWelcome && (
        <div
          className="absolute top-2 left-2 right-2 z-20 rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-50 to-white px-3 py-2 shadow-lg animate-guardi-welcome-in"
          role="status"
        >
          <p className="text-xs font-bold text-amber-950 text-center leading-snug">
            ברוך הבא! אני גארדי, המלווה שלך.
          </p>
          <button
            type="button"
            className="mt-1 w-full text-[10px] font-semibold text-amber-800/80 hover:text-amber-950"
            onClick={dismissWelcome}
          >
            סגירה
          </button>
        </div>
      )}

      <div
        className={`relative w-full h-full min-h-[280px] ${spinDone ? '' : 'guardi-hero-spin-stage'}`}
        style={{ perspective: '920px' }}
      >
        <div className={`w-full h-full min-h-[inherit] ${spinDone ? '' : 'guardi-hero-spin-inner'}`}>
          <GordieCanvas
            ref={guardiRef}
            className="h-full w-full"
            variant="hero"
            animationName={animationName}
          />
        </div>
        <GuardiCelebration burstKey={celebrationBurstKey} />
      </div>
    </div>
  );
}
