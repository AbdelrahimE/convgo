-- =====================================================
-- Migration: Simplify Escalation System
-- Description: Remove complex escalation logic and keep only keyword-based escalation
-- Date: 2025-08-31
-- =====================================================

-- 1. Remove escalation_threshold column from whatsapp_instances
ALTER TABLE public.whatsapp_instances 
DROP COLUMN IF EXISTS escalation_threshold;

-- 2. Update all existing escalation reasons to 'user_request'
-- This preserves existing escalated conversations but simplifies the reason
UPDATE public.escalated_conversations 
SET reason = 'user_request' 
WHERE reason IN ('ai_failure', 'sensitive_topic', 'low_confidence', 'repeated_question');

-- 3. Modify the constraint to only allow 'user_request' as reason
ALTER TABLE public.escalated_conversations 
DROP CONSTRAINT IF EXISTS escalated_conversations_reason_check;

ALTER TABLE public.escalated_conversations 
ADD CONSTRAINT escalated_conversations_reason_check 
CHECK (reason = 'user_request' OR reason IS NULL);

-- 4. Remove quality assessment columns from whatsapp_ai_interactions if they exist
ALTER TABLE public.whatsapp_ai_interactions
DROP COLUMN IF EXISTS response_quality_score,
DROP COLUMN IF EXISTS question_clarity_score,
DROP COLUMN IF EXISTS context_relevance_score;

-- 5. Add comment to document the simplified system
COMMENT ON COLUMN public.whatsapp_instances.escalation_keywords IS 
'Keywords that trigger immediate escalation to human support. This is the only escalation method in the simplified system.';

COMMENT ON COLUMN public.escalated_conversations.reason IS 
'Escalation reason - simplified to only user_request (keyword-based escalation)';

-- 6. Remove DEFAULT value from escalation_keywords column
ALTER TABLE public.whatsapp_instances 
ALTER COLUMN escalation_keywords DROP DEFAULT;

-- 7. Clear all existing default escalation keywords
-- Remove keywords if they contain default English keywords (indicating they're auto-generated)
UPDATE public.whatsapp_instances 
SET escalation_keywords = ARRAY[]::TEXT[]
WHERE 'human support' = ANY(escalation_keywords) 
   OR 'speak to someone' = ANY(escalation_keywords)
   OR 'agent' = ANY(escalation_keywords);

-- 8. Log the migration completion
DO $$
BEGIN
    RAISE NOTICE 'Escalation system simplified successfully. Now using keyword-based escalation only.';
END $$;