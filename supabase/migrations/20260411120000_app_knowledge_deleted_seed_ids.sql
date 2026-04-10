-- מזהי עובדות seed שנמחקו — נשמר בענן יחד עם items
ALTER TABLE public.app_knowledge_base
ADD COLUMN IF NOT EXISTS deleted_seed_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.app_knowledge_base.deleted_seed_ids IS 'מערך מחרוזות id של עובדות seed שהוסרו מהמאגר על ידי מטפל';
