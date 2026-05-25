/** Soft blue theme aligned with the «טעוני עדכון» metric card (see mock). */
export const DATA_UPDATE_FIELD_HIGHLIGHT =
  'border-blue-500 bg-blue-50/40 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]';

export const DATA_UPDATE_FIELD_NEUTRAL = 'border-slate-200 bg-white';

export const DATA_UPDATE_BOX_HIGHLIGHT =
  'rounded-lg border-blue-500 bg-blue-50/40 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]';

export const DATA_UPDATE_BOX_NEUTRAL = 'rounded-lg border-transparent';

export const DATA_UPDATE_ACTION_HIGHLIGHT =
  'rounded-xl border-blue-500 bg-blue-50/40 text-blue-950 shadow-[0_0_0_2px_rgba(59,130,246,0.2)] hover:bg-blue-50/60';

export function dataUpdateFieldBorderClass(
  highlightActive: boolean,
  isEmpty: boolean,
  neutralClass = DATA_UPDATE_FIELD_NEUTRAL
): string {
  return highlightActive && isEmpty ? DATA_UPDATE_FIELD_HIGHLIGHT : neutralClass;
}

export function dataUpdateInputClassName(
  highlightActive: boolean,
  isEmpty: boolean,
  base = 'w-full rounded-lg border px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500'
): string {
  return `${base} ${dataUpdateFieldBorderClass(highlightActive, isEmpty)}`;
}

export function dataUpdateBoxClassName(highlightActive: boolean, isEmpty: boolean): string {
  return highlightActive && isEmpty ? DATA_UPDATE_BOX_HIGHLIGHT : DATA_UPDATE_BOX_NEUTRAL;
}
