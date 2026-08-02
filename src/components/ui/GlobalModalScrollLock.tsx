import { useEffect } from 'react';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '../../lib/bodyScrollLock';

/**
 * Selectors that mean an overlay should freeze background scroll:
 * - `[aria-modal="true"]` — dialogs / modals
 * - `[data-scroll-lock]` — drawers & sheets that are not aria-modal
 */
const OVERLAY_SELECTOR = '[aria-modal="true"], [data-scroll-lock]';

/**
 * App-root observer: whenever any modal/dialog/drawer matching OVERLAY_SELECTOR
 * is in the DOM, hold a global body scroll lock (with nested-safe ref counting).
 */
export default function GlobalModalScrollLock() {
  useEffect(() => {
    let held = false;

    const sync = () => {
      const open = document.querySelector(OVERLAY_SELECTOR) != null;
      if (open && !held) {
        acquireBodyScrollLock();
        held = true;
      } else if (!open && held) {
        releaseBodyScrollLock();
        held = false;
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-scroll-lock'],
    });

    sync();

    return () => {
      observer.disconnect();
      if (held) {
        releaseBodyScrollLock();
        held = false;
      }
    };
  }, []);

  return null;
}
