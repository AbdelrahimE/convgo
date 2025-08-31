-- =====================================================
-- Migration: Support Smart Escalation Detection
-- Description: Update constraint to support both keyword and AI-detected escalation
-- Date: 2025-09-01
-- =====================================================

-- 1. Drop the current restrictive constraint
ALTER TABLE public.escalated_conversations 
DROP CONSTRAINT IF EXISTS escalated_conversations_reason_check;

-- 2. Add new constraint to support both escalation types
ALTER TABLE public.escalated_conversations 
ADD CONSTRAINT escalated_conversations_reason_check 
CHECK (reason IN ('user_request', 'ai_detected_intent') OR reason IS NULL);

-- 3. Update the comment to reflect the new system
COMMENT ON COLUMN public.escalated_conversations.reason IS 
'Escalation reason: user_request (keyword-based escalation) or ai_detected_intent (AI-detected need for human support)';

-- 4. Log the migration completion
DO $$
BEGIN
    RAISE NOTICE 'Smart escalation system enabled successfully. Now supporting both keyword and AI-detected escalation.';
END $$;