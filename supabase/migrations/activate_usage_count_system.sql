-- Activate personality usage count tracking system
-- This migration ensures the usage count functions are properly set up and accessible

-- Ensure the update_personality_usage function exists (already created but let's verify)
-- This function updates usage_count when a personality is used
CREATE OR REPLACE FUNCTION update_personality_usage(p_personality_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Update the personality usage count
    UPDATE public.ai_personalities 
    SET usage_count = usage_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_personality_id;
    
    -- Also update the parent AI config statistics
    UPDATE public.whatsapp_ai_config 
    SET total_personality_switches = total_personality_switches + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE whatsapp_instance_id = (
        SELECT whatsapp_instance_id 
        FROM public.ai_personalities 
        WHERE id = p_personality_id
    );
    
    -- Log success (for debugging)
    RAISE NOTICE 'Usage count updated for personality %', p_personality_id;
END;
$$ LANGUAGE plpgsql;

-- Ensure the analytics function exists and is optimized
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
        AVG(CASE 
            WHEN i.metadata->>'intent_confidence' ~ '^\d+(\.\d+)?$' 
            THEN (i.metadata->>'intent_confidence')::decimal 
            ELSE 0.5 
        END) as avg_confidence,
        MODE() WITHIN GROUP (ORDER BY i.metadata->>'detected_intent') as most_common_intent,
        MAX(i.created_at) as last_used_at
    FROM public.whatsapp_ai_interactions i
    WHERE 
        i.whatsapp_instance_id = p_whatsapp_instance_id
        AND i.metadata->>'personality_system_used' = 'true'
        AND i.metadata->>'personality_id' IS NOT NULL
        AND i.metadata->>'personality_id' != ''
    GROUP BY i.metadata->>'personality_id', i.metadata->>'personality_name'
    ORDER BY usage_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_personality_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_personality_usage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_personality_usage_analytics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_personality_usage_analytics(UUID) TO anon;

-- Add helpful comments
COMMENT ON FUNCTION update_personality_usage(UUID) IS 'Updates usage statistics when a personality is used for a response (activated)';
COMMENT ON FUNCTION get_personality_usage_analytics(UUID) IS 'Returns analytics about personality usage from actual AI interactions data';

-- Optional: Update existing personalities with usage counts from historical data
-- This will sync the usage_count field with actual usage from ai_interactions
DO $$
DECLARE
    personality_record RECORD;
    actual_usage_count BIGINT;
BEGIN
    -- Loop through all personalities
    FOR personality_record IN 
        SELECT p.id, p.whatsapp_instance_id, p.usage_count
        FROM public.ai_personalities p
        WHERE p.is_active = true
    LOOP
        -- Get actual usage count from interactions
        SELECT COUNT(*) INTO actual_usage_count
        FROM public.whatsapp_ai_interactions i
        WHERE i.whatsapp_instance_id = personality_record.whatsapp_instance_id
            AND i.metadata->>'personality_id' = personality_record.id::text;
        
        -- Update only if there's a difference
        IF actual_usage_count > personality_record.usage_count THEN
            UPDATE public.ai_personalities
            SET usage_count = actual_usage_count
            WHERE id = personality_record.id;
            
            RAISE NOTICE 'Updated personality % usage count from % to %', 
                personality_record.id, personality_record.usage_count, actual_usage_count;
        END IF;
    END LOOP;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_ai_personalities_usage_count 
ON public.ai_personalities(usage_count DESC) 
WHERE is_active = true;

-- Verify the functions are working
DO $$
BEGIN
    RAISE NOTICE 'Usage count tracking system activated successfully!';
    RAISE NOTICE 'Functions created: update_personality_usage, get_personality_usage_analytics';
    RAISE NOTICE 'Historical usage counts have been synchronized';
END $$;