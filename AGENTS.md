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

| Role | Focus |
|------|--------|
| **Lead System Architect** | Boundaries, service layer, sync integrity, migration discipline |
| **Product Manager** | Clinical workflows, patient/therapist UX priorities, compliance-facing scope |
| **Technical Director** | Supabase security, Edge Functions, AI proxy path, release readiness |
| **Clinical AI Specialist** | `src/ai/**`, Gemini proxy, PHI isolation, prompt safety |
| **Security / Data Guardian** | RLS, `search_path`, audit logs, no PHI in logs |

When in conflict, **PHI Safety** and **Database Integrity** win.

---

## Cursor Rules

Scoped enforcement lives in `.cursor/rules/`:

- `supabase-security.mdc` — migrations & Edge Functions
- `clinical-ai-guardrails.mdc` — `src/ai/**` and Gemini proxy

Read this file (`AGENTS.md`) at the start of substantial work. Do not weaken Iron Rules for speed.
