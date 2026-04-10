import { useId } from 'react';

export type GordyMood = 'default' | 'concerned' | 'joy' | 'thinking' | 'like';

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
      : mood === 'joy' || mood === 'like'
        ? 'M18 26 Q24 32 30 26'
        : mood === 'thinking'
          ? 'M21 27.5 L27 27.5'
          : 'M20 26 Q24 29 28 26';

  const faceFilter =
    mood === 'concerned'
      ? { filter: 'saturate(0.85) brightness(0.97)' as const }
      : mood === 'joy' || mood === 'like'
        ? { filter: 'saturate(1.08)' as const }
        : mood === 'thinking'
          ? { filter: 'saturate(0.95) brightness(1.02)' as const }
          : undefined;

  const eyeY =
    mood === 'concerned' ? 20 : mood === 'thinking' ? 19 : mood === 'like' ? 20.5 : 21;
  const eyeRy =
    mood === 'concerned' ? 1.8 : mood === 'thinking' ? 1.5 : mood === 'like' ? 1.6 : 2;

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
        <ellipse cx="20" cy={eyeY} rx="1.4" ry={eyeRy} fill="#1e293b" />
        <ellipse cx="28" cy={eyeY} rx="1.4" ry={eyeRy} fill="#1e293b" />
        <path
          d={mouthPath}
          stroke="#1e293b"
          strokeWidth={mood === 'thinking' ? 1 : 1.2}
          strokeLinecap="round"
          fill="none"
        />
        {mood === 'thinking' && (
          <g aria-hidden>
            <path
              d="M9 33 Q7.5 28 12.5 25.5"
              stroke="#92400e"
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
            />
            <ellipse
              cx="14.2"
              cy="27.2"
              rx="2.2"
              ry="2"
              fill="#fde68a"
              stroke="#b45309"
              strokeWidth="0.55"
            />
          </g>
        )}
        {mood === 'like' && (
          <g aria-hidden>
            <path
              d="M34 22 L36 20 L37 24 L35.5 28 L33 29 L31 27 Z"
              fill="#fde68a"
              stroke="#b45309"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
            <path
              d="M30 26 Q33 23 36 24"
              stroke="#92400e"
              strokeWidth="0.85"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
      <path d="M24 6 L27 14 L24 12 L21 14 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
    </svg>
  );
}
