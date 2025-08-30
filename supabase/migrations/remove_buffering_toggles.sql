-- Remove message buffering toggle system - making buffering the default behavior
-- This migration removes the per-instance toggle since buffering becomes mandatory

-- Drop the index first
DROP INDEX IF EXISTS idx_whatsapp_ai_config_message_buffering;

-- Remove the column from whatsapp_ai_config table
ALTER TABLE public.whatsapp_ai_config 
DROP COLUMN IF EXISTS enable_message_buffering;

-- Add comment to record the change
COMMENT ON TABLE public.whatsapp_ai_config IS 
'AI configuration for WhatsApp instances. Message buffering is now always enabled by default (removed enable_message_buffering column).';