/**
 * תווית פרס — XP ומטבעות בלבד (ללא «נק׳»)
 */
export function RewardLabel({
  xp,
  coins,
  className = '',
}: {
  xp?: number;
  coins?: number;
  className?: string;
}) {
  const showXp = xp != null && xp >= 0;
  const showCoins = coins != null && coins > 0;
  if (!showXp && !showCoins) return null;

  const parts: string[] = [];
  if (showXp) parts.push(`XP ${xp}`);
  if (showCoins) parts.push(`${coins} מטבעות`);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold tabular-nums leading-tight ${className}`}
      style={{
        background: 'linear-gradient(90deg, rgba(234,179,8,0.18), rgba(59,130,246,0.16))',
        color: '#92400e',
        border: '1px solid rgba(180,83,9,0.22)',
        borderRadius: 8,
        padding: '2px 7px',
        boxShadow: '0 1px 3px rgba(59,130,246,0.08)',
      }}
    >
      {parts.join(' | ')}
    </span>
  );
}
