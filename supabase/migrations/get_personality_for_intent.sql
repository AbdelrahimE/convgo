-- Fix intent confidence threshold for MVP
-- Use optimized fixed value instead of user-controlled setting

-- Update get_personality_for_intent to use fixed optimized threshold
CREATE OR REPLACE FUNCTION get_personality_for_intent(
    p_whatsapp_instance_id UUID,
    p_intent_category VARCHAR(50),
    p_confidence DECIMAL(5,4) DEFAULT 0.7
)
RETURNS TABLE(
    personality_id UUID,
    personality_name VARCHAR(100),
    system_prompt TEXT,
    temperature DECIMAL(3,2),
    model VARCHAR(50),
    process_voice_messages BOOLEAN,
    voice_message_default_response TEXT,
    default_voice_language VARCHAR(10)
) AS $$
DECLARE
    v_optimized_threshold DECIMAL(5,4) := 0.7; -- Fixed optimized value for MVP
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.system_prompt,
        p.temperature,
        p.model,
        p.process_voice_messages,
        p.voice_message_default_response,
        p.default_voice_language
    FROM public.ai_personalities p
    WHERE 
        p.whatsapp_instance_id = p_whatsapp_instance_id
        AND p.is_active = true
        AND (
            -- Direct intent match
            p.intent_categories ? p_intent_category
            -- OR fallback to default personality if confidence is below optimized threshold
            OR (p.is_default = true AND p_confidence < v_optimized_threshold)
        )
    ORDER BY 
        -- Prioritize exact intent matches
        CASE WHEN p.intent_categories ? p_intent_category THEN 0 ELSE 1 END,
        -- Then by priority
        p.priority DESC,
        -- Finally by creation date (newer first)
        p.created_at DESC
    LIMIT 1;
END;
$$ language 'plpgsql';

-- Comment explaining the change
COMMENT ON FUNCTION get_personality_for_intent(UUID, VARCHAR, DECIMAL) IS 'Returns the most appropriate personality for a given intent category using optimized fixed threshold (0.7) for MVP';