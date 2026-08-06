import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchOpenOnboardingLeads,
  type OnboardingLeadRow,
} from '../services/onboardingLeadService';

/**
 * Therapist portal: open (non-converted) onboarding leads + count badge.
 * Prefetches on mount so the sidebar badge is visible at login; refresh on demand.
 */
export function useOpenOnboardingLeads() {
  const [leads, setLeads] = useState<OnboardingLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchOpenOnboardingLeads();
    if (!mountedRef.current) return;
    if (!result.ok) {
      setLeads([]);
      setError(result.message);
      setLoading(false);
      return;
    }
    setLeads(result.data);
    setLoading(false);
  }, []);

  // Prefetch badge count once on mount (setState only after the async RPC returns).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchOpenOnboardingLeads();
      if (cancelled || !mountedRef.current) return;
      if (!result.ok) {
        setLeads([]);
        setError(result.message);
      } else {
        setLeads(result.data);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    leads,
    openCount: leads.length,
    loading,
    error,
    refresh,
  };
}
