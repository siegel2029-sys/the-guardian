# Physio-Shield — Agent Governance

**Domain:** Physio-Shield is a clinical physical therapy compliance, patient tracking, and exercise management application (Vite, React, TypeScript, Tailwind, Supabase, Gemini AI in `src/ai/` and Supabase Edge Functions).

All agents (Cursor, automation, or human-in-the-loop) working in this repository must follow the Iron Rules below. Product and architecture decisions defer to clinical safety and data integrity over convenience.

---

## Iron Rules (Non-Negotiable)

### Iron Rule 1 — PHI Safety

Never write patient health information (PHI) or personal identifiers to `console.log`, application logs, analytics payloads, or unencrypted external prompts.

- No names, IDs, phone numbers, emails, addresses, free-text clinical notes, or raw session payloads in logs.
- AI prompts must use de-identified context (initials / placeholders) and go through the approved Gemini proxy path.
- Prefer aggregate or role-based error messages over patient-specific detail in client-visible failures.

### Iron Rule 2 — Service Layer

Do not query Supabase directly from UI components (`src/components/**`). Always use the dedicated service layer under `src/services/` (and hooks that call those services).

- UI → hooks/services → Supabase client / RPCs.
- New data access belongs in `src/services/`, not inline in components.

### Iron Rule 3 — Database Integrity

Never invent database columns or tables. Strictly adhere to existing migrations and schemas under `supabase/migrations/`.

- Confirm column/table names against migrations before writing queries, RPCs, or types.
- Schema changes require a new migration; do not “fix” types or client code to assume columns that are not migrated.

### Iron Rule 4 — State & Logic Sync

Keep local state, JSONB upserts, and UI components fully synchronized — especially patient statuses, freezes, and clinical payloads.

- Merged upserts must not blindly overwrite JSONB fields (see clinical sync helpers in `src/services/` / `src/lib/`).
- Status, freeze, and plan/version fields must stay consistent across UI, local state, and persisted payloads after every write path.

---

## Agent Company Roles (Internal)

**Permanent reference for every agent** working on Physio-Shield. On each development task, apply the full Agent Company core below (five delivery roles). Gatekeepers remain binding overlays for safety and infrastructure.

### Agent Company core (required on every build task)

#### 1. Senior Developer (המתכנת הראשי)

- Owns clean, modular TypeScript / React code.
- Ensures status logic, account freezes, and counters/data sync against Supabase work end-to-end with no frayed edges (Iron Rule 4).
- Always enforces the Service Layer boundary (Iron Rule 2): UI → hooks/services → Supabase — never direct queries from components.

#### 2. Professional & Architectural Expert (מומחה ארכיטקטורה ושיפורים טכניים)

- Prevents tech debt; improves performance; optimizes queries and caching.
- Oversees debug/test infrastructure (e.g. Vitest) and correct Edge Function management (deploy, secrets, JWT/auth handling, shared helpers).
- Keeps boundaries aligned with migrations and existing schemas (Iron Rule 3).

#### 3. UX/UI & Visual Expert (מומחה חווית משתמש ונראות)

- Owns smooth, intuitive user flows for patients and physiotherapists.
- Ensures screens are modular, clean, and mobile-responsive, with a consistent professional clinical look.
- Does not sacrifice clarity or clinical trust for decorative complexity.

#### 4. QA & Testing Agent (סוכן בקרת איכות ואוטומציה)

- Owns automated tests (e.g. Vitest for unit tests and clinical logic).
- Scans edge cases and verifies that code changes do not break core flows (patient statuses, freezes, data sync).
- Runs and confirms green checks before feature close-out or deploy.

#### 5. Product Manager & Roadmap Agent (סוכן ניהול מוצר ואסטרטגיית גרסאות)

- Breaks large/complex features into small, focused MVP steps.
- Keeps product and business focus; prevents over-scoping and scattered development.
- Prioritizes work to match long-term app goals (future releases, smooth clinical workflows).

### Quick reference — Agent Company core

| # | Role | Primary check |
|---|------|----------------|
| 1 | **Senior Developer** | Clean TS/React, service layer, status/freeze/sync integrity |
| 2 | **Architectural Expert** | Tech debt, perf/cache, Vitest infra, Edge Functions |
| 3 | **UX/UI Expert** | Patient/therapist flows, modular responsive clinical UI |
| 4 | **QA & Testing** | Unit/clinical tests, edge cases, pre-ship verification |
| 5 | **PM & Roadmap** | MVP slicing, focus, priority vs long-term roadmap |

### Gatekeepers (safety & infrastructure overlays)

| Role | Focus |
|------|--------|
| **Lead System Architect** | Boundaries, service layer, sync integrity, migration discipline |
| **Technical Director** | Supabase security, Edge Functions, AI proxy path, release readiness |
| **Clinical AI Specialist** | `src/ai/**`, Gemini proxy, PHI isolation, prompt safety |
| **Security / Data Guardian** | RLS, `search_path`, audit logs, no PHI in logs |

**How to apply:** For every task, walk roles 1→5 (code → architecture → UX → QA → product/roadmap), then satisfy gatekeeper Iron Rules and Automation Guardrails before merge or deploy.

When in conflict, **PHI Safety** and **Database Integrity** win.

---

## Automation & Pre-Commit Guardrails

Before finalizing any **major** code change (feature close-out, refactor of clinical paths, service-layer edits, or deploy):

1. Run **typecheck**: `npx tsc --noEmit` — must pass.
2. Run **lint** (project lint script / ESLint as configured) — must pass with no new errors in touched files.
3. Prefer **Vitest** coverage for clinical logic you change (statuses, freezes, sync merges, service helpers).

**Hard stop — do not ship if:**

- Typecheck or lint fails.
- Patient **status**, **account freeze**, or **service-layer** boundaries are left with loose ends, regressions, or bypasses (Iron Rules 2 & 4).
- Sync / JSONB upsert paths can overwrite or desync local state vs Supabase.

Agents must fix failures before declaring a task complete. Speed does not override these checks.

---

## Cursor Rules

Scoped enforcement lives in `.cursor/rules/`:

- `supabase-security.mdc` — migrations & Edge Functions
- `clinical-ai-guardrails.mdc` — `src/ai/**` and Gemini proxy

Read this file (`AGENTS.md`) — especially **Iron Rules**, **Agent Company core**, **Automation Guardrails**, and the **Active Task Board** — at the start of substantial work. Do not weaken Iron Rules for speed.

---

## Active Task Board & Context Tracker

Long-term memory across chat sessions. **Every agent must read this section first**, then update it when finishing meaningful work (keep entries short; no PHI).

### Current Active Task

_Idle — Push outage fixed; Wave B still paused until verified in prod._

### Completed Steps (recent)

- P0 push fix: removed dangling `usedFallback` in `patientPushDelivery` (ReferenceError on every Web Push send after VAPID fail-closed hygiene); redeployed `reminder-cron` + `send-therapist-chat-push`.
- Confirmed client `PushRegisterResult` / `ServiceResult` callers and Wave A ErrorBoundaries were not the break; cron was HTTP 500 in prod logs.
- Wave A ErrorBoundaries + freemium guest lock remain in place.

### Next Action Items

1. **Verify:** next hourly `reminder-cron` returns 200; spot-check therapist chat push delivery.
2. **Wave B** (after verify): dashboard off fat `usePatient()`.
3. **Ops:** Rotate `service_role`; align webhook secrets; HIBP after Pro.
4. Set `ALLOWED_ORIGINS` for Edge CORS fail-closed.
5. P2: multi-key clinical fetch → `ServiceResult.data`; Edge hermetic Zod.

### Update protocol

When closing or switching work, rewrite the three subsections above:

1. Move finished work into **Completed Steps** (1–3 bullets).
2. Set **Current Active Task** to the in-progress item (or `_Idle_`).
3. Refresh **Next Action Items** (max ~5, prioritized).

Do not store patient names, IDs, or clinical free text on this board.
