-- Update whatsapp_escalated_conversations table to support smart escalation system

-- Add new columns for smart escalation data
ALTER TABLE whatsapp_escalated_conversations 
ADD COLUMN IF NOT EXISTS escalation_type VARCHAR(20) DEFAULT 'keyword_based' CHECK (escalation_type IN ('keyword_based', 'smart_analysis', 'manual')),
ADD COLUMN IF NOT EXISTS intent_analysis JSONB,
ADD COLUMN IF NOT EXISTS emotion_analysis JSONB,
ADD COLUMN IF NOT EXISTS customer_journey JSONB,
ADD COLUMN IF NOT EXISTS product_interest JSONB,
ADD COLUMN IF NOT EXISTS ai_attempts_count INTEGER DEFAULT 0 CHECK (ai_attempts_count >= 0),
ADD COLUMN IF NOT EXISTS rag_context_used TEXT,
ADD COLUMN IF NOT EXISTS escalation_reasoning TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(10) DEFAULT 'medium' CHECK (urgency_level IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS can_solve_with_rag BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS conversation_context TEXT,
ADD COLUMN IF NOT EXISTS escalation_trigger_message TEXT;

-- Create indexes for better performance on new columns
CREATE INDEX IF NOT EXISTS idx_whatsapp_escalated_conversations_escalation_type 
ON whatsapp_escalated_conversations(escalation_type);

CREATE INDEX IF NOT EXISTS idx_whatsapp_escalated_conversations_urgency_level 
ON whatsapp_escalated_conversations(urgency_level);

CREATE INDEX IF NOT EXISTS idx_whatsapp_escalated_conversations_ai_attempts 
ON whatsapp_escalated_conversations(ai_attempts_count);

CREATE INDEX IF NOT EXISTS idx_whatsapp_escalated_conversations_confidence 
ON whatsapp_escalated_conversations(confidence_score);

-- Add comments for documentation
COMMENT ON COLUMN whatsapp_escalated_conversations.escalation_type IS 'Type of escalation: keyword_based (old system), smart_analysis (new system), manual';
COMMENT ON COLUMN whatsapp_escalated_conversations.intent_analysis IS 'JSON data from smart intent analyzer';
COMMENT ON COLUMN whatsapp_escalated_conversations.emotion_analysis IS 'JSON data from emotion analysis';
COMMENT ON COLUMN whatsapp_escalated_conversations.customer_journey IS 'JSON data about customer journey stage';
COMMENT ON COLUMN whatsapp_escalated_conversations.product_interest IS 'JSON data about product/service interest';
COMMENT ON COLUMN whatsapp_escalated_conversations.ai_attempts_count IS 'Number of AI solution attempts before escalation';
COMMENT ON COLUMN whatsapp_escalated_conversations.rag_context_used IS 'RAG context that was available for the query';
COMMENT ON COLUMN whatsapp_escalated_conversations.escalation_reasoning IS 'Detailed reasoning for why escalation was triggered';
COMMENT ON COLUMN whatsapp_escalated_conversations.confidence_score IS 'Confidence score of the escalation decision (0-1)';
COMMENT ON COLUMN whatsapp_escalated_conversations.urgency_level IS 'Detected urgency level: low, medium, high';
COMMENT ON COLUMN whatsapp_escalated_conversations.can_solve_with_rag IS 'Whether the query could potentially be solved with RAG system';
COMMENT ON COLUMN whatsapp_escalated_conversations.conversation_context IS 'Summary of conversation context for human agents';
COMMENT ON COLUMN whatsapp_escalated_conversations.escalation_trigger_message IS 'The specific message that triggered escalation';

-- Update existing records to have escalation_type as 'keyword_based'
UPDATE whatsapp_escalated_conversations 
SET escalation_type = 'keyword_based' 
WHERE escalation_type IS NULL;

-- Create a view for smart escalation analytics
CREATE OR REPLACE VIEW smart_escalation_analytics AS
SELECT 
    wi.instance_name,
    wi.user_id,
    COUNT(*) as total_escalations,
    COUNT(*) FILTER (WHERE wec.escalation_type = 'smart_analysis') as smart_escalations,
    COUNT(*) FILTER (WHERE wec.escalation_type = 'keyword_based') as keyword_escalations,
    COUNT(*) FILTER (WHERE wec.escalation_type = 'manual') as manual_escalations,
    AVG(wec.confidence_score) as avg_confidence_score,
    AVG(wec.ai_attempts_count) as avg_ai_attempts,
    COUNT(*) FILTER (WHERE wec.urgency_level = 'high') as high_urgency_count,
    COUNT(*) FILTER (WHERE wec.urgency_level = 'medium') as medium_urgency_count,
    COUNT(*) FILTER (WHERE wec.urgency_level = 'low') as low_urgency_count,
    COUNT(*) FILTER (WHERE wec.can_solve_with_rag = true) as rag_solvable_count,
    COUNT(*) FILTER (WHERE wec.is_resolved = true) as resolved_count,
    AVG(EXTRACT(EPOCH FROM (wec.resolved_at - wec.escalated_at))/3600) as avg_resolution_hours
FROM whatsapp_escalated_conversations wec
JOIN whatsapp_instances wi ON wec.whatsapp_instance_id = wi.id
WHERE wec.escalated_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wi.instance_name, wi.user_id
ORDER BY total_escalations DESC;

-- Grant access to the view
GRANT SELECT ON smart_escalation_analytics TO authenticated;

-- Add RLS policies if they don't exist
DO $$
BEGIN
    -- Check if the policy already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'whatsapp_escalated_conversations' 
        AND policyname = 'Users can view smart escalation analytics for their instances'
    ) THEN
        CREATE POLICY "Users can view smart escalation analytics for their instances"
        ON whatsapp_escalated_conversations
        FOR SELECT
        USING (
            whatsapp_instance_id IN (
                SELECT id FROM whatsapp_instances 
                WHERE user_id = auth.uid()
            )
        );
    END IF;
END
$$;