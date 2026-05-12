/**
 * Dedicated mount point for Guardi + assistant FAB (last child of `document.body`).
 * Full-viewport `pointer-events: none` shell — children must set `pointer-events: auto`.
 */
export const PHYSIOSHIELD_PORTAL_ROOT_ID = 'physioshield-portal-root';

export function getPhysioshieldPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getPhysioshieldPortalRoot: document is not available');
  }
  let el = document.getElementById(PHYSIOSHIELD_PORTAL_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = PHYSIOSHIELD_PORTAL_ROOT_ID;
  }
  if (el.parentNode !== document.body || document.body.lastElementChild !== el) {
    document.body.appendChild(el);
  }
  return el;
}

export function ensurePhysioshieldPortalRoot(): HTMLElement {
  return getPhysioshieldPortalRoot();
}
