import type { RefObject } from 'react';

import GuardiAssistantModal, {
  type GuardiTransientAppearance,
} from './GuardiAssistantModal';

export type { GuardiTransientAppearance };
export type { GuardiSemanticKind } from '../../utils/guardiSemanticKinds';

type Props = {
  eligible: boolean;
  exerciseSafetyLocked: boolean;
  redFlagPortalLock: boolean;
  transient: GuardiTransientAppearance | null;
  /** Increment when XP / rewards fire so the assistant can react in-frame. */
  celebrateBurstKey?: number;
  /**
   * Tab / screen context for default clips (e.g. `Exercise1` on workouts). Overridden by transient
   * bubble moods when those are active.
   */
  contextAnimationName?: string;
  /** הערת מזג/טבע יומית (מסע ההר) — יציבה ליום הקליני */
  ambientEnvironmentBubble?: string | null;
  /** מעל מפת הגוף בבית, או בפינה במסכי אימון */
  placement: 'bodyMap' | 'corner';
  bodyMapAnchorRef?: RefObject<HTMLElement | null>;
  portalTab: 'home' | 'activity';
};

/**
 * גארדי למטה-ימין או מעל מפת הגוף — מוסתר כברירת מחדל; מופיע בפייד עדין לאבני דרך או במצב שומר קליני.
 */
export default function GuardiCompanion(props: Props) {
  return <GuardiAssistantModal {...props} />;
}
