-- Repair (idempotent): public.app_knowledge_base + deleted_seed_ids
-- Use when the remote project never ran earlier migrations or PostgREST reports a missing relation.
-- Safe to run in Supabase SQL Editor or via `supabase db push` after `supabase link`.

CREATE TABLE IF NOT EXISTS public.app_knowledge_base (
  id TEXT PRIMARY KEY DEFAULT 'global',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_knowledge_base
  ADD COLUMN IF NOT EXISTS deleted_seed_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON TABLE public.app_knowledge_base IS 'מאמרי "הידעת?" — מערך JSON של KnowledgeFact (כולל isApproved)';
COMMENT ON COLUMN public.app_knowledge_base.deleted_seed_ids IS 'מערך מחרוזות id של עובדות seed שהוסרו מהמאגר על ידי מטפל';
