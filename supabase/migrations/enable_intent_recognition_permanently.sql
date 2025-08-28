-- Enable Intent Recognition permanently for all users
-- This migration ensures all existing AI configurations have intent_recognition_enabled set to true

-- Update all existing whatsapp_ai_config records to have intent_recognition_enabled = true
UPDATE whatsapp_ai_config 
SET intent_recognition_enabled = true 
WHERE intent_recognition_enabled IS NULL OR intent_recognition_enabled = false;

-- Update the default value for future records to be true (non-nullable)
ALTER TABLE whatsapp_ai_config 
ALTER COLUMN intent_recognition_enabled SET DEFAULT true,
ALTER COLUMN intent_recognition_enabled SET NOT NULL;

-- Update any NULL values to true before setting NOT NULL constraint
UPDATE whatsapp_ai_config 
SET intent_recognition_enabled = true 
WHERE intent_recognition_enabled IS NULL;

-- Add a comment to document this change
COMMENT ON COLUMN whatsapp_ai_config.intent_recognition_enabled IS 'Intent Recognition is permanently enabled for all users as of migration enable_intent_recognition_permanently.sql';