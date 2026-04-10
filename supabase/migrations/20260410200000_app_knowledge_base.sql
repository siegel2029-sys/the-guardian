-- בסיס ידע קליני גלובלי (אישור מטפל + סנכרון)
CREATE TABLE IF NOT EXISTS public.app_knowledge_base (
  id TEXT PRIMARY KEY DEFAULT 'global',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_knowledge_base IS 'מאמרי "הידעת?" — מערך JSON של KnowledgeFact (כולל isApproved)';
