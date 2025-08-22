-- Complete Escalation System Removal Migration
-- This migration removes all escalation-related tables, functions, views, and columns
-- while preserving core AI functionality like intent analysis and RAG system

-- Step 1: Drop all escalation-related views first (to avoid dependency issues)
DROP VIEW IF EXISTS simple_escalation_analytics CASCADE;
DROP VIEW IF EXISTS simple_system_performance CASCADE;
DROP VIEW IF EXISTS smart_escalation_analytics CASCADE;
DROP VIEW IF EXISTS conversation_ai_attempts_analytics CASCADE;

-- Step 2: Drop all escalation-related functions and triggers
DROP FUNCTION IF EXISTS auto_adjust_escalation_thresholds() CASCADE;
DROP FUNCTION IF EXISTS get_conversation_ai_attempts(UUID) CASCADE;
DROP FUNCTION IF EXISTS increment_conversation_ai_attempts(UUID) CASCADE;
DROP FUNCTION IF EXISTS reset_conversation_ai_attempts(UUID) CASCADE;
DROP FUNCTION IF EXISTS record_ai_attempt_message(UUID, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS trigger_update_ai_attempts_count() CASCADE;

-- Step 3: Drop all escalation-related tables
-- Note: These tables are specific to escalation and safe to remove completely
DROP TABLE IF EXISTS whatsapp_escalated_conversations CASCADE;
DROP TABLE IF EXISTS whatsapp_support_config CASCADE;
DROP TABLE IF EXISTS smart_escalation_config_deprecated CASCADE;
DROP TABLE IF EXISTS smart_escalation_config CASCADE;
DROP TABLE IF EXISTS simple_escalation_config CASCADE;

-- Step 4: Remove escalation-related columns from existing tables
-- Remove AI attempts tracking columns (these were added specifically for escalation)
ALTER TABLE IF EXISTS whatsapp_conversations 
DROP COLUMN IF EXISTS ai_attempts_count CASCADE;

ALTER TABLE IF EXISTS whatsapp_conversation_messages 
DROP COLUMN IF EXISTS is_ai_attempt CASCADE,
DROP COLUMN IF EXISTS attempt_number CASCADE;

-- Step 5: Drop any escalation-related indexes
DROP INDEX IF EXISTS idx_whatsapp_conversations_ai_attempts;
DROP INDEX IF EXISTS idx_whatsapp_conversation_messages_ai_attempt;
DROP INDEX IF EXISTS idx_whatsapp_conversation_messages_attempt_number;
DROP INDEX IF EXISTS idx_smart_escalation_config_instance_id;
DROP INDEX IF EXISTS idx_smart_escalation_config_user_id;
DROP INDEX IF EXISTS idx_simple_escalation_config_instance_id;
DROP INDEX IF EXISTS idx_simple_escalation_config_user_id;

-- Step 6: Clean up any escalation-related policies
DROP POLICY IF EXISTS "Users can manage their own simple escalation configs" ON simple_escalation_config;
DROP POLICY IF EXISTS "Users can view their own simple escalation analytics" ON simple_escalation_config;

-- Step 7: Remove any escalation-related triggers
DROP TRIGGER IF EXISTS auto_adjust_thresholds_trigger ON whatsapp_escalated_conversations;
DROP TRIGGER IF EXISTS trigger_update_ai_attempts_count ON whatsapp_conversation_messages;
DROP TRIGGER IF EXISTS handle_simple_escalation_config_updated_at ON simple_escalation_config;
DROP TRIGGER IF EXISTS handle_smart_escalation_config_updated_at ON smart_escalation_config;

-- Step 8: Clean up webhook debug logs related to escalation (optional)
-- Keep them for historical analysis but mark them as obsolete
UPDATE webhook_debug_logs 
SET category = 'obsolete_' || category 
WHERE category IN (
  'escalation_error', 
  'smart_escalation', 
  'simple_escalation',
  'escalation_warning',
  'AI_ESCALATION_TRIGGERED',
  'COMPLETE_ESCALATION_RESULT',
  'SMART_ESCALATION_ANALYSIS',
  'SIMPLE_ESCALATION'
);

-- Step 9: Verify core systems are intact
-- These should still exist and be functional
DO $$
DECLARE
  missing_tables TEXT[] := '{}';
BEGIN
  -- Check for critical tables that should NOT be removed
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_instances') THEN
    missing_tables := missing_tables || 'whatsapp_instances';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_conversations') THEN
    missing_tables := missing_tables || 'whatsapp_conversations';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_conversation_messages') THEN
    missing_tables := missing_tables || 'whatsapp_conversation_messages';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'text_chunks') THEN
    missing_tables := missing_tables || 'text_chunks';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'intent_categories') THEN
    missing_tables := missing_tables || 'intent_categories';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_ai_config') THEN
    missing_tables := missing_tables || 'whatsapp_ai_config';
  END IF;
  
  IF array_length(missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'Critical tables are missing: %', array_to_string(missing_tables, ', ');
  ELSE
    RAISE NOTICE 'All critical tables verified successfully';
  END IF;
END $$;

-- Step 10: Log the cleanup completion
INSERT INTO webhook_debug_logs (category, message, data) VALUES (
  'system_cleanup',
  'Escalation system completely removed - Core AI systems preserved',
  json_build_object(
    'action', 'remove_escalation_system_completely',
    'timestamp', NOW(),
    'tables_removed', ARRAY[
      'whatsapp_escalated_conversations',
      'whatsapp_support_config', 
      'smart_escalation_config',
      'simple_escalation_config'
    ],
    'functions_removed', ARRAY[
      'auto_adjust_escalation_thresholds',
      'get_conversation_ai_attempts',
      'increment_conversation_ai_attempts',
      'reset_conversation_ai_attempts',
      'record_ai_attempt_message'
    ],
    'preserved_systems', ARRAY[
      'intent_analysis',
      'rag_system',
      'semantic_search',
      'ai_personalities',
      'whatsapp_ai_config'
    ],
    'status', 'success'
  )
);

-- Final verification message
DO $$
BEGIN
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'ESCALATION SYSTEM REMOVAL COMPLETED SUCCESSFULLY';
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Removed Components:';
  RAISE NOTICE '✓ All escalation tables and configurations';
  RAISE NOTICE '✓ All escalation functions and triggers';
  RAISE NOTICE '✓ All escalation views and analytics';
  RAISE NOTICE '✓ AI attempts tracking columns';
  RAISE NOTICE '';
  RAISE NOTICE 'Preserved Components:';
  RAISE NOTICE '✓ Intent analysis system';
  RAISE NOTICE '✓ RAG and semantic search';
  RAISE NOTICE '✓ AI personality system';  
  RAISE NOTICE '✓ Core WhatsApp functionality';
  RAISE NOTICE '✓ Conversation management';
  RAISE NOTICE '===============================================';
END $$;