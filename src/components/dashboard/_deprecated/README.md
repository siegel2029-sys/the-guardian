# Deprecated dashboard panels

Quarantined therapist UI — not mounted in the live dashboard.

| File | Former role |
|------|-------------|
| `ProgramReviewProposalsPanel.tsx` | Sidebar «ביקורת 3 ימים» Force Review / approve UI |
| `AiSuggestionsPanel.tsx` | «הצעות AI (מעקב היסטורי)» read-only archive |
| `PendingApprovalsPanel.tsx` | Orphaned Recommendation Engine approve queue |

Actionable Gemini plan recommendations now live in Smart Clinical Center
(`TherapistAiInsightsPanel`) with explicit Approve / Decline.
Background `clinical-review-cron` may still insert DB proposals for ops; there is
no therapist sidebar UI for them.
