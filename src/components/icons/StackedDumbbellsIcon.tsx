/**
 * Stacked adjustable dumbbells: two dumbbells (hexagonal plates + central grip), diagonally offset.
 * Color follows parent via currentColor (e.g. text-medical-primary / text-slate-500).
 */

function pointyHexPath(cx: number, cy: number, r: number): string {
  const k = 0.8660254 * r;
  const j = 0.5 * r;
  return [
    `M ${cx + r} ${cy}`,
    `L ${cx + j} ${cy - k}`,
    `L ${cx - j} ${cy - k}`,
    `L ${cx - r} ${cy}`,
    `L ${cx - j} ${cy + k}`,
    `L ${cx + j} ${cy + k}`,
    'Z',
  ].join(' ');
}

type StackedDumbbellsIconProps = {
  className?: string;
  emphasized?: boolean;
};

export default function StackedDumbbellsIcon({
  className,
  emphasized = false,
}: StackedDumbbellsIconProps) {
  const sw = emphasized ? 2.35 : 2;
  const plateR = 2.05;

  // Upper-front dumbbell (offset up-left)
  const y1 = 6.15;
  const lx1 = 4.55;
  const rx1 = lx1 + 2 * plateR + 2.15;
  const barY1 = y1;
  const barX1a = lx1 + plateR;
  const barX1b = rx1 - plateR;

  // Lower-rear dumbbell (offset down-right — diagonal stack)
  const y2 = 15.35;
  const lx2 = 8.35;
  const rx2 = lx2 + 2 * plateR + 2.15;
  const barY2 = y2;
  const barX2a = lx2 + plateR;
  const barX2b = rx2 - plateR;

  const fillOp = emphasized ? 0.11 : 0.07;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Rear dumbbell (drawn first) */}
      <path
        d={pointyHexPath(lx2, y2, plateR)}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity={fillOp}
      />
      <path
        d={pointyHexPath(rx2, y2, plateR)}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity={fillOp}
      />
      <line
        x1={barX2a}
        y1={barY2}
        x2={barX2b}
        y2={barY2}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* Front dumbbell */}
      <path
        d={pointyHexPath(lx1, y1, plateR)}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity={fillOp + 0.02}
      />
      <path
        d={pointyHexPath(rx1, y1, plateR)}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity={fillOp + 0.02}
      />
      <line
        x1={barX1a}
        y1={barY1}
        x2={barX1b}
        y2={barY1}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}
