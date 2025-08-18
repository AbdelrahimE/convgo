-- Enable personality system by default for all instances
-- This migration safely updates the default behavior while preserving existing data
-- Created: 2025-08-18

-- Step 1: Update the default value for new records
-- This ensures all future configurations will have personality system enabled by default
ALTER TABLE public.whatsapp_ai_config 
ALTER COLUMN use_personality_system SET DEFAULT true;

-- Step 2: Safely update existing configurations
-- Only update records where use_personality_system is currently false or NULL
-- This preserves any configurations that were explicitly set to true
UPDATE public.whatsapp_ai_config 
SET 
    use_personality_system = true,
    updated_at = CURRENT_TIMESTAMP
WHERE 
    (use_personality_system = false OR use_personality_system IS NULL)
    AND whatsapp_instance_id IS NOT NULL  -- Safety check to ensure valid records
    AND user_id IS NOT NULL;              -- Safety check to ensure valid records

-- Step 3: Ensure intent_recognition_enabled is also true for consistency
-- Only update if it's currently false or NULL, preserving explicit settings
UPDATE public.whatsapp_ai_config 
SET 
    intent_recognition_enabled = true,
    updated_at = CURRENT_TIMESTAMP
WHERE 
    use_personality_system = true  -- Only for configs with personality system enabled
    AND (intent_recognition_enabled = false OR intent_recognition_enabled IS NULL)
    AND whatsapp_instance_id IS NOT NULL
    AND user_id IS NOT NULL;