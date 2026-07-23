import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTierRouting } from '../../hooks/useTierRouting';
import GuestDailyView from './GuestDailyView';

type Props = {
  /** Pro clinic portal surface (usually lazy PatientDailyView). */
  children: ReactNode;
};

/**
 * Routes authenticated portal users by product tier:
 * - `pro` → clinic PatientDailyView (children)
 * - `free` → GuestDailyView (App Store freemium placeholder)
 * - therapist / anonymous → leave the portal
 */
export default function FreemiumGuard({ children }: Props) {
  const { tier, isLoading } = useTierRouting();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" aria-label="טוען" />
      </div>
    );
  }

  if (tier === 'free') {
    return <GuestDailyView />;
  }

  if (tier === 'pro') {
    return <>{children}</>;
  }

  if (tier === 'therapist') {
    return <Navigate to="/therapist" replace />;
  }

  return <Navigate to="/login" replace />;
}
