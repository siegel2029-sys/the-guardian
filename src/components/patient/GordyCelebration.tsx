import { useEffect, useState, type CSSProperties } from 'react';

const CONFETTI_COLORS = ['#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fb923c'];

/** קונפטי + מטבעות — פרץ קצר כשמקבלים XP */
export default function GuardiCelebration({ burstKey }: { burstKey: number }) {
  const [pieces, setPieces] = useState<
    { id: number; x: number; y: number; rot: number; color: string; kind: 'confetti' | 'coin' }[]
  >([]);

  useEffect(() => {
    if (!burstKey) return;
    const n = 28;
    const next = Array.from({ length: n }, (_, i) => ({
      id: burstKey * 1000 + i,
      x: 42 + Math.random() * 36,
      y: 38 + Math.random() * 24,
      rot: Math.random() * 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      kind: (i % 5 === 0 ? 'coin' : 'confetti') as 'confetti' | 'coin',
    }));
    setPieces(next);
    const t = window.setTimeout(() => setPieces([]), 2200);
    return () => clearTimeout(t);
  }, [burstKey]);

  if (pieces.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] overflow-hidden rounded-2xl"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute text-lg font-black animate-guardi-burst"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              '--gx': `${(Math.random() - 0.5) * 160}px`,
              '--gy': `${-80 - Math.random() * 120}px`,
              color: p.kind === 'coin' ? '#ca8a04' : p.color,
              textShadow: p.kind === 'coin' ? '0 0 6px rgba(251,191,36,0.9)' : undefined,
            } as CSSProperties
          }
        >
          {p.kind === 'coin' ? '🪙' : '▮'}
        </span>
      ))}
    </div>
  );
}
