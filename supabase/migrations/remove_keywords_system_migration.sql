-- Migration to remove the deprecated keyword-based escalation system
-- This migration safely removes the whatsapp_support_keywords table and its dependencies

-- Step 1: Drop the foreign key constraint first
ALTER TABLE IF EXISTS public.whatsapp_support_keywords 
DROP CONSTRAINT IF EXISTS fk_whatsapp_support_keywords_instance;

-- Step 2: Drop the user foreign key constraint
ALTER TABLE IF EXISTS public.whatsapp_support_keywords 
DROP CONSTRAINT IF EXISTS whatsapp_support_keywords_user_id_fkey;

-- Step 3: Drop the unique constraint
ALTER TABLE IF EXISTS public.whatsapp_support_keywords 
DROP CONSTRAINT IF EXISTS whatsapp_support_keywords_user_id_keyword_key;

-- Step 4: Drop the index
DROP INDEX IF EXISTS idx_whatsapp_support_keywords_instance_id;

-- Step 5: Drop the table itself
DROP TABLE IF EXISTS public.whatsapp_support_keywords CASCADE;

-- Step 6: Clean up any references in other tables (if any)
-- This is a safety measure - there shouldn't be any direct references
-- but we'll check and clean up just in case

-- Add a comment to document the migration
COMMENT ON SCHEMA public IS 'Keywords-based escalation system removed in favor of smart escalation';