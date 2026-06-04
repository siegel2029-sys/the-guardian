export function createStableRowId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureRowIdList(ids: string[], targetLength: number, prefix: string): string[] {
  const next = [...ids];
  while (next.length < targetLength) {
    next.push(createStableRowId(prefix));
  }
  return next.slice(0, targetLength);
}
