import { useId } from 'react';

export type GordyMood = 'default' | 'concerned' | 'joy';

type Props = {
  className?: string;
  /** מצב רגשי — concerned לבטיחות, joy לחגיגה */
  mood?: GordyMood;
};

/** אייקון גורדי — פנים + גלימה (מזהים ייחודיים לכל מופע) */
export default function GordyMascotIcon({ className = 'w-8 h-8', mood = 'default' }: Props) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const faceId = `gordyFace-${raw}`;
  const capeId = `gordyCape-${raw}`;

  const mouthPath =
    mood === 'concerned'
      ? 'M20 28 Q24 25 28 28'
      : mood === 'joy'
        ? 'M18 26 Q24 32 30 26'
        : 'M20 26 Q24 29 28 26';

  const faceFilter =
    mood === 'concerned'
      ? { filter: 'saturate(0.85) brightness(0.97)' as const }
      : mood === 'joy'
        ? { filter: 'saturate(1.08)' as const }
        : undefined;

  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={faceId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={capeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      <path
        d="M8 32 Q24 8 40 32 L38 40 Q24 36 10 40 Z"
        fill={`url(#${capeId})`}
        stroke="#450a0a"
        strokeWidth="0.6"
      />
      <g style={faceFilter}>
        <circle cx="24" cy="22" r="11" fill={`url(#${faceId})`} stroke="#b45309" strokeWidth="0.8" />
        <ellipse
          cx="20"
          cy={mood === 'concerned' ? 20 : 21}
          rx="1.4"
          ry={mood === 'concerned' ? 1.8 : 2}
          fill="#1e293b"
        />
        <ellipse
          cx="28"
          cy={mood === 'concerned' ? 20 : 21}
          rx="1.4"
          ry={mood === 'concerned' ? 1.8 : 2}
          fill="#1e293b"
        />
        <path
          d={mouthPath}
          stroke="#1e293b"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <path d="M24 6 L27 14 L24 12 L21 14 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
    </svg>
  );
}
