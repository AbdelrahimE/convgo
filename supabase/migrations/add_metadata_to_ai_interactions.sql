-- Add metadata column to whatsapp_ai_interactions for personality system tracking
-- This allows us to track which personality was used for each response

-- Add metadata column to store personality information
ALTER TABLE public.whatsapp_ai_interactions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_interactions_metadata 
ON public.whatsapp_ai_interactions USING GIN(metadata);

-- Create index for personality tracking
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_interactions_personality 
ON public.whatsapp_ai_interactions((metadata->>'personality_id')) 
WHERE metadata->>'personality_id' IS NOT NULL;

-- Function to get personality usage analytics
CREATE OR REPLACE FUNCTION get_personality_usage_analytics(p_whatsapp_instance_id UUID)
RETURNS TABLE(
    personality_id TEXT,
    personality_name TEXT,
    usage_count BIGINT,
    avg_confidence DECIMAL(5,4),
    most_common_intent TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.metadata->>'personality_id' as personality_id,
        i.metadata->>'personality_name' as personality_name,
        COUNT(*) as usage_count,
        AVG((i.metadata->>'intent_confidence')::decimal) as avg_confidence,
        MODE() WITHIN GROUP (ORDER BY i.metadata->>'detected_intent') as most_common_intent,
        MAX(i.created_at) as last_used_at
    FROM public.whatsapp_ai_interactions i
    WHERE 
        i.whatsapp_instance_id = p_whatsapp_instance_id
        AND i.metadata->>'personality_system_used' = 'true'
        AND i.metadata->>'personality_id' IS NOT NULL
    GROUP BY i.metadata->>'personality_id', i.metadata->>'personality_name'
    ORDER BY usage_count DESC;
END;
$$ language 'plpgsql';

-- Add helpful comments
COMMENT ON COLUMN public.whatsapp_ai_interactions.metadata IS 'JSON metadata including personality system information, intent classification results, and other contextual data';
COMMENT ON FUNCTION get_personality_usage_analytics(UUID) IS 'Returns analytics about personality usage for a specific WhatsApp instance';