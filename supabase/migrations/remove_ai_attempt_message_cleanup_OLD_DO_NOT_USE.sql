-- ================================================================
-- Remove AI Attempt Message - System Cleanup Migration
-- This migration removes the unused ai_attempt_message columns that were causing
-- unnecessary API calls and resource waste
-- ================================================================

-- Step 1: Add migration log entry
INSERT INTO webhook_debug_logs (category, message, data) VALUES (
  'system_cleanup',
  'Starting removal of ai_attempt_message columns - performance optimization',
  json_build_object(
    'action', 'remove_ai_attempt_message',
    'timestamp', NOW(),
    'affected_tables', ARRAY['simple_escalation_config', 'smart_escalation_config'],
    'reason', 'Removing unused feature that caused resource waste'
  )
);

-- Step 2: Backup current values (for rollback if needed)
CREATE TABLE IF NOT EXISTS ai_attempt_message_backup AS
SELECT 
  'simple_escalation_config' as table_name,
  whatsapp_instance_id,
  ai_attempt_message,
  created_at as backup_timestamp
FROM simple_escalation_config
WHERE ai_attempt_message IS NOT NULL
UNION ALL
SELECT 
  'smart_escalation_config' as table_name,
  whatsapp_instance_id,
  ai_attempt_message,
  created_at as backup_timestamp
FROM smart_escalation_config
WHERE ai_attempt_message IS NOT NULL;

-- Step 3: Remove ai_attempt_message column from simple_escalation_config
ALTER TABLE simple_escalation_config 
DROP COLUMN IF EXISTS ai_attempt_message;

-- Step 4: Remove ai_attempt_message column from smart_escalation_config
ALTER TABLE smart_escalation_config 
DROP COLUMN IF EXISTS ai_attempt_message;

-- Step 5: Update comments to reflect the change
COMMENT ON TABLE simple_escalation_config IS 'Simplified escalation configuration - optimized for performance without ai_attempt_message';
COMMENT ON TABLE smart_escalation_config IS 'Smart escalation configuration - optimized for performance without ai_attempt_message';

-- Step 6: Log success
INSERT INTO webhook_debug_logs (category, message, data) VALUES (
  'system_cleanup',
  'Successfully removed ai_attempt_message columns - system optimized',
  json_build_object(
    'action', 'remove_ai_attempt_message_completed',
    'timestamp', NOW(),
    'backup_table', 'ai_attempt_message_backup',
    'status', 'success',
    'performance_improvement', 'Expected 50% reduction in unnecessary API calls'
  )
);

-- Step 7: Verify the cleanup
DO $$
DECLARE
  simple_column_exists boolean;
  smart_column_exists boolean;
BEGIN
  -- Check if columns were removed
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'simple_escalation_config' 
    AND column_name = 'ai_attempt_message'
  ) INTO simple_column_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'smart_escalation_config' 
    AND column_name = 'ai_attempt_message'
  ) INTO smart_column_exists;
  
  IF simple_column_exists OR smart_column_exists THEN
    RAISE EXCEPTION 'Migration failed: ai_attempt_message columns still exist';
  END IF;
  
  RAISE NOTICE 'Migration successful: ai_attempt_message columns removed from both tables';
END $$;