import { useEffect } from 'react';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '../lib/bodyScrollLock';

/**
 * Locks document/body scroll while `locked` is true.
 * Prefer GlobalModalScrollLock for aria-modal / data-scroll-lock overlays;
 * use this hook for imperative or non-standard overlays.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquireBodyScrollLock();
    return () => releaseBodyScrollLock();
  }, [locked]);
}
