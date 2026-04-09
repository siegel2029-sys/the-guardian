import { useEffect, useRef, useState, type CSSProperties } from 'react';
import GordyMascotIcon from './GordyMascotIcon';

const CONFETTI_COLORS = ['#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fb923c', '#facc15'];

type Piece = {
  id: number;
  x: number;
  y: number;
  rot: number;
  color: string;
  kind: 'confetti' | 'coin';
  gx: string;
  gy: string;
};

type Props = {
  burstKey: number;
  onClose?: () => void;
};

/** חגיגת סיום סשן — קונפטי ומטבעות במסך מלא + סיבוב 360° לגורדי */
export default function GordyFullScreenCelebration({ burstKey, onClose }: Props) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!burstKey) return;
    const n = 96;
    const next: Piece[] = Array.from({ length: n }, (_, i) => ({
      id: burstKey * 10000 + i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      rot: Math.random() * 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      kind: (i % 4 === 0 ? 'coin' : 'confetti') as 'coin' | 'confetti',
      gx: `${(Math.random() - 0.5) * 220}px`,
      gy: `${-100 - Math.random() * 180}px`,
    }));
    setPieces(next);
    setVisible(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPieces([]);
      setVisible(false);
      onCloseRef.current?.();
    }, 4200);
    return () => window.clearTimeout(timerRef.current);
  }, [burstKey]);

  if (!burstKey || !visible) return null;

  return (
    <div
      className="fixed inset-0 z-[96] flex flex-col items-center justify-center p-6"
      style={{ background: 'rgba(15, 23, 42, 0.42)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gordy-celebrate-title"
      dir="rtl"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute text-xl sm:text-2xl font-black animate-gordy-burst"
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                '--gx': p.gx,
                '--gy': p.gy,
                color: p.kind === 'coin' ? '#ca8a04' : p.color,
                textShadow: p.kind === 'coin' ? '0 0 10px rgba(251,191,36,0.95)' : undefined,
              } as CSSProperties
            }
          >
            {p.kind === 'coin' ? '🪙' : '▮'}
          </span>
        ))}
      </div>

      <div className="relative z-[1] flex flex-col items-center pointer-events-none">
        <div className="gordy-hero-spin-stage" style={{ perspective: '920px' }}>
          <div className="gordy-hero-spin-inner flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36">
            <GordyMascotIcon mood="joy" className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-2xl" />
          </div>
        </div>
        <p
          id="gordy-celebrate-title"
          className="mt-5 text-center text-xl sm:text-2xl font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
        >
          סיימת את כל המשימות להיום!
        </p>
        <p className="mt-2 text-sm font-semibold text-teal-100/95 text-center max-w-xs">
          כל הכבוד — מדליה על השלמה מלאה
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          window.clearTimeout(timerRef.current);
          setPieces([]);
          setVisible(false);
          onClose?.();
        }}
        className="pointer-events-auto mt-10 z-[2] px-6 py-3 rounded-2xl text-sm font-bold text-teal-950 shadow-lg border-2 border-teal-300/80"
        style={{ background: 'linear-gradient(135deg,#ccfbf1,#99f6e4)' }}
      >
        המשך
      </button>
    </div>
  );
}
