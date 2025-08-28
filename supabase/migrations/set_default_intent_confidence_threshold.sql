-- Set default intent confidence threshold to optimized value for MVP
-- Update all existing records to use the optimized threshold

-- Update existing records to use optimized threshold
UPDATE whatsapp_ai_config 
SET intent_confidence_threshold = 0.7 
WHERE intent_confidence_threshold IS NULL 
   OR intent_confidence_threshold != 0.7;

-- Set column default to optimized value
ALTER TABLE whatsapp_ai_config 
ALTER COLUMN intent_confidence_threshold SET DEFAULT 0.7;

-- Add comment explaining the optimization
COMMENT ON COLUMN whatsapp_ai_config.intent_confidence_threshold IS 'Fixed optimized confidence threshold (0.7) for intent-based personality selection in MVP - automatically managed';