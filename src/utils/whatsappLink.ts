/** ספרות בלבד ל־wa.me (ללא +) */
export function digitsOnlyPhone(s: string): string {
  return s.replace(/\D/g, '');
}

export function waMeOpenUrl(phoneDigits: string, message: string): string | null {
  const d = digitsOnlyPhone(phoneDigits);
  if (d.length < 9) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}
