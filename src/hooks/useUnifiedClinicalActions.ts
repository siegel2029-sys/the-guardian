import { useMemo } from 'react';
import type { UnifiedClinicalNarrative } from '../ai/clinicalInsightsNarrative';
import type { AiSuggestion } from '../types';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import {
  buildUnifiedClinicalActions,
  type UnifiedClinicalAction,
} from '../utils/clinicalUnifiedActions';

export type UseUnifiedClinicalActionsParams = {
  narrative: UnifiedClinicalNarrative | null;
  pendingSuggestions: AiSuggestion[];
  dismissedAiRowKeys: Set<string>;
  dismissedPendingIds: Set<string>;
  catalog?: ClinicalExerciseCatalog | null;
};

export type UseUnifiedClinicalActionsResult = {
  unifiedActions: UnifiedClinicalAction[];
};

/** Merge AI modifications + pending approvals with conflict resolution. */
export function useUnifiedClinicalActions(
  params: UseUnifiedClinicalActionsParams
): UseUnifiedClinicalActionsResult {
  const unifiedActions = useMemo(
    () => buildUnifiedClinicalActions(params),
    [
      params.narrative,
      params.pendingSuggestions,
      params.dismissedAiRowKeys,
      params.dismissedPendingIds,
      params.catalog,
    ]
  );

  return { unifiedActions };
}
