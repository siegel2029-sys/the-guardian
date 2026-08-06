# Deprecated AI modules

These files are quarantined — not imported by the app.

They previously expanded the Gemini surface without active UI call sites.
Do not re-wire without product review. Prefer Program Review for plan mutations
and the shared builders under `src/ai/` for new Gemini features.

| File | Former role |
|------|-------------|
| `geminiTherapistDive.ts` | Unused therapist draft summarizers |
| `geminiClinicalContextReview.ts` | Unused note+datastore review |
| `geminiAiPlanAdjustment.ts` | Deprecated re-export shim → clinicalRecommendationEngine |
