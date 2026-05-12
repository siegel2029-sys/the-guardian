import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getPhysioshieldPortalRoot } from '../../lib/physioshieldPortalRoot';

type Props = { children: ReactNode; layerClassName?: string };

/**
 * Mounts children inside `#physioshield-portal-root` (last in `document.body`).
 * Inner layer is `pointer-events: none`; interactive nodes must use `pointer-events-auto`.
 */
export default function PhysioshieldPortal({ children, layerClassName }: Props) {
  if (typeof document === 'undefined') return null;

  const layerClass = ['physioshield-portal-layer', layerClassName].filter(Boolean).join(' ');

  return createPortal(<div className={layerClass}>{children}</div>, getPhysioshieldPortalRoot());
}
