import { useEffect, useRef, useState, type CSSProperties } from 'react';
import GuardiMascotIcon from './GordyMascotIcon';

const CONFETTI_COLORS = ['#fbbf24', '#facc15', '#34d399', '#60a5fa', '#f472b6', '#fb923c'];

type Piece = {
  id: number;
  x: number;
  delay: number;
  color: string;
  kind: 'confetti' | 'coin';
  drift: string;
  fall: string;
};

type Props = {
  burstKey: number;
  xpAdded: number;
  coinsAdded: number;
  streakBonusXp?: number;
  onComplete?: () => void;
};

/**
 * רצף ניצחון — סיבוב 360°, קפיצה + אגרוף, הילה זהובה, קונפטי/מטבעות ממוקד ממורד גארדי.
 */
export default function GuardiVictorySequence({
  burstKey,
  xpAdded,
  coinsAdded,
  streakBonusXp,
  onComplete,
}: Props) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const timerRef = useRef(0);

  useEffect(() => {
    if (!burstKey) return;
    const n = 72;
    const next: Piece[] = Array.from({ length: n }, (_, i) => ({
      id: burstKey * 10000 + i,
      x: 42 + Math.random() * 16 - 8 + (Math.random() - 0.5) * 6,
      delay: Math.random() * 0.35,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      kind: (i % 5 === 0 ? 'coin' : 'confetti') as 'coin' | 'confetti',
      drift: `${(Math.random() - 0.5) * 36}px`,
      fall: `${68 + Math.random() * 28}vh`,
    }));
    setPieces(next);
    setVisible(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPieces([]);
      setVisible(false);
      onCompleteRef.current?.();
    }, 3200);
    return () => window.clearTimeout(timerRef.current);
  }, [burstKey]);

  if (!burstKey || !visible) return null;

  const streak = streakBonusXp != null && streakBonusXp > 0 ? streakBonusXp : 0;
  const parts: string[] = [];
  if (xpAdded > 0) {
    parts.push(streak > 0 ? `+${xpAdded} XP (רצף +${streak})` : `+${xpAdded} XP`);
  } else if (streak > 0) {
    parts.push(`רצף +${streak} XP`);
  }
  if (coinsAdded > 0) parts.push(`+${coinsAdded} מטבעות`);
  const label = parts.join(' · ') || 'כל הכבוד!';

  return (
    <div
      className="fixed inset-0 z-[94] pointer-events-none overflow-hidden"
      style={{ background: 'radial-gradient(circle at 50% 34%, rgba(251,191,36,0.12), transparent 55%)' }}
      aria-hidden
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
        style={{ top: 'min(34vh, 280px)' }}
      >
        <div className="relative guardi-victory-hop guardi-victory-aura">
          <div className="mx-auto flex items-center justify-center w-[5.5rem] h-[5.5rem] sm:w-28 sm:h-28">
            <GuardiMascotIcon
              mood="joy"
              animationName="Celebrate"
              className="w-full h-full"
              celebrateBurstKey={burstKey}
            />
          </div>
          <span
            className="absolute -end-1 top-0 text-2xl sm:text-3xl guardi-victory-fist select-none"
            aria-hidden
          >
            👊
          </span>
        </div>
        <p className="mt-3 text-sm sm:text-base font-black text-amber-950 drop-shadow-sm tracking-tight text-center px-4">
          {label}
        </p>
      </div>

      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute text-lg sm:text-xl font-black animate-guardi-victory-loot-fall"
            style={
              {
                left: `${p.x}%`,
                top: 'min(30vh, 240px)',
                color: p.kind === 'coin' ? '#ca8a04' : p.color,
                textShadow: p.kind === 'coin' ? '0 0 8px rgba(251,191,36,0.9)' : undefined,
                animationDelay: `${p.delay}s`,
                '--loot-drift': p.drift,
                '--loot-fall': p.fall,
              } as CSSProperties
            }
          >
            {p.kind === 'coin' ? '🪙' : '▮'}
          </span>
        ))}
      </div>
    </div>
  );
}
