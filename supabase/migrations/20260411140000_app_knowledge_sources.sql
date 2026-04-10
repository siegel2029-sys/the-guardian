-- ניהול מקורות מידע ל־AI (דומיינים מותרים)
CREATE TABLE IF NOT EXISTS public.app_knowledge_sources (
  id TEXT PRIMARY KEY DEFAULT 'global',
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_seed_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_knowledge_sources IS 'מקורות מידע לבסיס ידע + Gemini — KnowledgeSource[] ומזהי seed שנמחקו';
