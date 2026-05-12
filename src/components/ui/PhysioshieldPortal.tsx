import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getPhysioshieldPortalRoot } from '../../lib/physioshieldPortalRoot';

type Props = { children: ReactNode };

/**
 * Mounts children inside `#physioshield-portal-root` (last in `document.body`).
 * Inner layer is `pointer-events: none`; interactive nodes must use `pointer-events-auto`.
 */
export default function PhysioshieldPortal({ children }: Props) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="physioshield-portal-layer">{children}</div>,
    getPhysioshieldPortalRoot()
  );
}
