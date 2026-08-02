/**
 * Ref-counted body scroll lock for modals, dialogs, and drawers.
 * Safe with nested overlays: only the first acquire freezes the page;
 * the last release restores scroll position (incl. iOS position:fixed).
 *
 * iOS: touchmove is intercepted with scroll-boundary awareness so rubber-band
 * overscroll inside a modal panel cannot chain-scroll the page behind it.
 */

export const SCROLL_LOCK_ALLOW_ATTR = 'data-scroll-lock-allow';
/** Legacy plan-builder marker — treated as an allow-scroll region. */
export const SCROLL_LOCK_ALLOW_LEGACY_ATTR = 'data-plan-builder-scroll';

type LockSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  mainOverflow: string;
  scrollY: number;
};

let lockCount = 0;
let snapshot: LockSnapshot | null = null;
let touchMoveHandler: ((e: TouchEvent) => void) | null = null;
let touchStartHandler: ((e: TouchEvent) => void) | null = null;
let touchStartY = 0;

function therapistMain(): HTMLElement | null {
  return document.getElementById('therapist-dashboard-main');
}

function findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;

  const allow = target.closest(
    `[${SCROLL_LOCK_ALLOW_ATTR}], [${SCROLL_LOCK_ALLOW_LEGACY_ATTR}]`
  );
  if (allow instanceof HTMLElement) {
    const { overflowY, overflowX } = getComputedStyle(allow);
    const yScrollable =
      /(auto|scroll|overlay)/.test(overflowY) && allow.scrollHeight > allow.clientHeight;
    const xScrollable =
      /(auto|scroll|overlay)/.test(overflowX) && allow.scrollWidth > allow.clientWidth;
    if (yScrollable || xScrollable) return allow;
    // Allow-marked region that isn't itself scrollable: walk for a nested scroller.
  }

  let node: Element | null = target;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const { overflowY, overflowX } = getComputedStyle(node);
      const yScrollable =
        /(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight;
      const xScrollable =
        /(auto|scroll|overlay)/.test(overflowX) && node.scrollWidth > node.clientWidth;
      if (yScrollable || xScrollable) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 1) {
    touchStartY = e.touches[0].clientY;
  }
}

function onTouchMove(e: TouchEvent): void {
  if (e.touches.length !== 1) return;

  const scrollEl = findScrollableAncestor(e.target);
  if (!scrollEl) {
    e.preventDefault();
    return;
  }

  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStartY;
  const { overflowY } = getComputedStyle(scrollEl);
  const yScrollable =
    /(auto|scroll|overlay)/.test(overflowY) && scrollEl.scrollHeight > scrollEl.clientHeight;

  if (!yScrollable) {
    // Horizontal-only scroller (or allow marker without overflow): block vertical page bleed.
    if (Math.abs(deltaY) > 0) e.preventDefault();
    return;
  }

  const atTop = scrollEl.scrollTop <= 0;
  const atBottom =
    scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

  // Pulling down at top, or pushing up at bottom → would chain-scroll the page.
  if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
    e.preventDefault();
  }
}

function applyLock(): void {
  const html = document.documentElement;
  const body = document.body;
  const main = therapistMain();
  const scrollY = window.scrollY;

  snapshot = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    mainOverflow: main?.style.overflow ?? '',
    scrollY,
  };

  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  if (main) main.style.overflow = 'hidden';

  touchStartHandler = onTouchStart;
  touchMoveHandler = onTouchMove;
  document.addEventListener('touchstart', touchStartHandler, { passive: true });
  document.addEventListener('touchmove', touchMoveHandler, { passive: false });
}

function restoreLock(): void {
  if (!snapshot) return;

  const html = document.documentElement;
  const body = document.body;
  const main = therapistMain();
  const { scrollY, ...prev } = snapshot;

  html.style.overflow = prev.htmlOverflow;
  body.style.overflow = prev.bodyOverflow;
  body.style.position = prev.bodyPosition;
  body.style.top = prev.bodyTop;
  body.style.left = prev.bodyLeft;
  body.style.right = prev.bodyRight;
  body.style.width = prev.bodyWidth;
  if (main) main.style.overflow = prev.mainOverflow;

  if (touchStartHandler) {
    document.removeEventListener('touchstart', touchStartHandler);
    touchStartHandler = null;
  }
  if (touchMoveHandler) {
    document.removeEventListener('touchmove', touchMoveHandler);
    touchMoveHandler = null;
  }

  snapshot = null;
  window.scrollTo(0, scrollY);
}

/** Acquire a scroll lock. Nested calls are counted; page freezes on the first. */
export function acquireBodyScrollLock(): void {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount === 1) applyLock();
}

/** Release one scroll-lock hold. Restores background scroll when count hits zero. */
export function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) restoreLock();
}

/** Test / debug helper — current hold count. */
export function getBodyScrollLockCount(): number {
  return lockCount;
}

/** True while the page background is frozen. */
export function isBodyScrollLocked(): boolean {
  return lockCount > 0;
}
