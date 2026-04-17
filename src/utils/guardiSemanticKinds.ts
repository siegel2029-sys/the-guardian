/** הקשר מוגדר מראש לתמונה + טקסט קנוניים ב־GuardiAssistantModal */
export const GUARDI_SEMANTIC_KINDS = [
  'welcome',
  'learning',
  'success',
  'pain',
  'pain_intense',
  'strength',
] as const;

export type GuardiSemanticKind = (typeof GUARDI_SEMANTIC_KINDS)[number];
