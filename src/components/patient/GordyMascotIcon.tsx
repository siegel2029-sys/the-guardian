/** אייקון גורדי — פנים מעוצבות + גלימה לכפתור העוזר */
export default function GordyMascotIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="gordyFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="gordyCape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      <path
        d="M8 32 Q24 8 40 32 L38 40 Q24 36 10 40 Z"
        fill="url(#gordyCape)"
        stroke="#450a0a"
        strokeWidth="0.6"
      />
      <circle cx="24" cy="22" r="11" fill="url(#gordyFace)" stroke="#b45309" strokeWidth="0.8" />
      <ellipse cx="20" cy="21" rx="1.4" ry="2" fill="#1e293b" />
      <ellipse cx="28" cy="21" rx="1.4" ry="2" fill="#1e293b" />
      <path
        d="M20 26 Q24 29 28 26"
        stroke="#1e293b"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M24 6 L27 14 L24 12 L21 14 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
    </svg>
  );
}
