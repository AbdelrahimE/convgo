-- Add message buffering toggle to whatsapp_ai_config table
-- This allows per-instance control of the buffering system

ALTER TABLE public.whatsapp_ai_config 
ADD COLUMN IF NOT EXISTS enable_message_buffering boolean NOT NULL DEFAULT true;

-- Add index for better performance when querying buffering-enabled instances
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_config_message_buffering 
ON public.whatsapp_ai_config (enable_message_buffering)
WHERE enable_message_buffering = true;

-- Add comment to explain the field
COMMENT ON COLUMN public.whatsapp_ai_config.enable_message_buffering IS 
'Enable message buffering and delay system to combine consecutive messages from the same user before processing';