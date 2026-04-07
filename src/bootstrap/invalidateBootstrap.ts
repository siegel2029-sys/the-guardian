/** ניתוק מטען readPersistedOnce אחרי עדכון localStorage (מניעת סיסמה/חשבונות ישנים במטמון). */
let clearFn: (() => void) | null = null;

export function setPersistedBootstrapInvalidator(fn: () => void): void {
  clearFn = fn;
}

export function invalidatePersistedBootstrapCache(): void {
  clearFn?.();
}
