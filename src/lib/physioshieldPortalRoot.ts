/**
 * Dedicated mount point for Guardi + assistant FAB (always last child of `document.body`).
 * Inline `!important` styles mirror CSS so stacking works even if stylesheets load late.
 */
export const PHYSIOSHIELD_PORTAL_ROOT_ID = 'physioshield-portal-root';

function applyPortalRootLayout(el: HTMLElement): void {
  el.style.setProperty('position', 'fixed', 'important');
  el.style.setProperty('top', '0', 'important');
  el.style.setProperty('left', '0', 'important');
  el.style.setProperty('width', '100vw', 'important');
  el.style.setProperty('height', '100vh', 'important');
  el.style.setProperty('pointer-events', 'none', 'important');
  el.style.setProperty('z-index', '999999', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('padding', '0', 'important');
  el.style.setProperty('border', 'none', 'important');
  el.style.setProperty('box-sizing', 'border-box', 'important');
}

export function getPhysioshieldPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getPhysioshieldPortalRoot: document is not available');
  }
  let el = document.getElementById(PHYSIOSHIELD_PORTAL_ROOT_ID) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = PHYSIOSHIELD_PORTAL_ROOT_ID;
  }
  applyPortalRootLayout(el);
  document.body.appendChild(el);
  return el;
}

export function ensurePhysioshieldPortalRoot(): HTMLElement {
  return getPhysioshieldPortalRoot();
}
