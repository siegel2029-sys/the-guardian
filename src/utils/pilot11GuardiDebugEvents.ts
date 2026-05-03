import type { GuardiSemanticKind } from './guardiSemanticKinds';

/** אירוע מפאנל דיבאג pilot11 — מפעיל בועת גארדי ב־PatientDailyView */
export const PILOT11_GUARDI_DEBUG_EVENT = 'physioshield-pilot11-guardi-preview';

export type Pilot11GuardiDebugDetail =
  | {
      action: 'transient';
      mood: 'like' | 'joy' | 'concerned';
      bubble: string;
    }
  | {
      action: 'ambient';
      /** null = ניקוי override */
      line: string | null;
    }
  | {
      action: 'semantic';
      kind: GuardiSemanticKind;
    };
