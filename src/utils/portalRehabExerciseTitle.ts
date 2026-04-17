/** מסיר כותרת מיותרת מול כותרת העמוד (תכנית השיקום / תכנית השיקום (חובה)) */
export function displayPortalRehabExerciseTitle(name: string): string {
  const t = name.trim();
  const stripped = t
    .replace(/^תכנית\s*השיקום\s*(?:\(\s*חובה\s*\))?\s*[:\-–—]?\s*/u, '')
    .trim();
  return stripped.length > 0 ? stripped : t;
}
