/** M:SS or Xשנ' — לתצוגת משך החזקה / תרגילי זמן בלבד */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0שנ\'';
  if (totalSeconds < 60) return `${totalSeconds}שנ'`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m}:00`;
}
