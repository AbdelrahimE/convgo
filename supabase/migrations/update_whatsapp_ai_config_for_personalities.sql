-- Update whatsapp_ai_config table to support multi-personality system
-- This migration enhances the existing AI config to work with the new personality system

-- Add new columns to support personality system
ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    use_personality_system BOOLEAN DEFAULT false;

ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    fallback_personality_id UUID REFERENCES public.ai_personalities(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    intent_recognition_enabled BOOLEAN DEFAULT true;

ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    intent_confidence_threshold DECIMAL(3,2) DEFAULT 0.6 CHECK (intent_confidence_threshold >= 0 AND intent_confidence_threshold <= 1);

-- Analytics and performance tracking
ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    total_personality_switches INTEGER DEFAULT 0;

ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    intent_recognition_accuracy DECIMAL(5,4) DEFAULT 0.0;

-- Add metadata for system configuration
ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS 
    personality_system_metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for fallback personality lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_config_fallback_personality 
ON public.whatsapp_ai_config(fallback_personality_id) 
WHERE fallback_personality_id IS NOT NULL;

-- Create index for personality system usage
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_config_personality_system 
ON public.whatsapp_ai_config(use_personality_system) 
WHERE use_personality_system = true;

-- Function to migrate existing single-prompt configs to personality system
CREATE OR REPLACE FUNCTION migrate_to_personality_system(p_whatsapp_instance_id UUID)
RETURNS UUID AS $$
DECLARE
    config_record RECORD;
    new_personality_id UUID;
BEGIN
    -- Get the existing AI config
    SELECT * INTO config_record 
    FROM public.whatsapp_ai_config 
    WHERE whatsapp_instance_id = p_whatsapp_instance_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AI config not found for instance %', p_whatsapp_instance_id;
    END IF;
    
    -- Create a default personality from the existing system prompt
    INSERT INTO public.ai_personalities (
        whatsapp_instance_id,
        user_id,
        name,
        description,
        system_prompt,
        temperature,
        intent_categories,
        is_active,
        is_default,
        priority,
        process_voice_messages,
        voice_message_default_response,
        default_voice_language
    ) VALUES (
        p_whatsapp_instance_id,
        config_record.user_id,
        'Default Assistant',
        'Migrated from original system prompt configuration',
        config_record.system_prompt,
        config_record.temperature,
        '["general"]'::jsonb, -- Default to general intent
        true,
        true, -- This becomes the default personality
        1,
        config_record.process_voice_messages,
        config_record.voice_message_default_response,
        config_record.default_voice_language
    ) RETURNING id INTO new_personality_id;
    
    -- Update the AI config to use personality system
    UPDATE public.whatsapp_ai_config 
    SET 
        use_personality_system = true,
        fallback_personality_id = new_personality_id,
        intent_recognition_enabled = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE whatsapp_instance_id = p_whatsapp_instance_id;
    
    RETURN new_personality_id;
END;
$$ language 'plpgsql';

-- Function to get the appropriate personality for an intent
CREATE OR REPLACE FUNCTION get_personality_for_intent(
    p_whatsapp_instance_id UUID,
    p_intent_category VARCHAR(50),
    p_confidence DECIMAL(5,4) DEFAULT 0.6
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
            -- OR fallback to default personality if no specific match and confidence is low
            OR (p.is_default = true AND p_confidence < 0.7)
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

-- Function to update personality usage statistics
CREATE OR REPLACE FUNCTION update_personality_usage(p_personality_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.ai_personalities 
    SET usage_count = usage_count + 1
    WHERE id = p_personality_id;
    
    -- Also update the parent AI config
    UPDATE public.whatsapp_ai_config 
    SET total_personality_switches = total_personality_switches + 1
    WHERE whatsapp_instance_id = (
        SELECT whatsapp_instance_id 
        FROM public.ai_personalities 
        WHERE id = p_personality_id
    );
END;
$$ language 'plpgsql';

-- Function to get intent recognition statistics
CREATE OR REPLACE FUNCTION get_intent_recognition_stats(p_whatsapp_instance_id UUID)
RETURNS TABLE(
    total_recognitions BIGINT,
    avg_confidence DECIMAL(5,4),
    most_common_intent VARCHAR(50),
    cache_hit_rate DECIMAL(5,4)
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            COUNT(*) as total_count,
            AVG(confidence_score) as avg_conf,
            MODE() WITHIN GROUP (ORDER BY recognized_intent) as common_intent
        FROM public.intent_recognition_cache 
        WHERE whatsapp_instance_id = p_whatsapp_instance_id
    ),
    cache_stats AS (
        SELECT 
            AVG(CASE WHEN hit_count > 0 THEN 1.0 ELSE 0.0 END) as hit_rate
        FROM public.intent_recognition_cache 
        WHERE whatsapp_instance_id = p_whatsapp_instance_id
    )
    SELECT 
        s.total_count,
        s.avg_conf,
        s.common_intent,
        cs.hit_rate
    FROM stats s
    CROSS JOIN cache_stats cs;
END;
$$ language 'plpgsql';

-- Add helpful comments
COMMENT ON COLUMN public.whatsapp_ai_config.use_personality_system IS 'Whether to use the multi-personality system or stick with single prompt';
COMMENT ON COLUMN public.whatsapp_ai_config.fallback_personality_id IS 'Default personality to use when intent recognition fails or confidence is low';
COMMENT ON COLUMN public.whatsapp_ai_config.intent_recognition_enabled IS 'Whether to perform intent recognition before response generation';
COMMENT ON COLUMN public.whatsapp_ai_config.intent_confidence_threshold IS 'Minimum confidence required for intent-based personality selection';
COMMENT ON COLUMN public.whatsapp_ai_config.personality_system_metadata IS 'Additional configuration and analytics data for personality system';

COMMENT ON FUNCTION migrate_to_personality_system(UUID) IS 'Migrates an existing single-prompt AI config to the personality system';
COMMENT ON FUNCTION get_personality_for_intent(UUID, VARCHAR, DECIMAL) IS 'Returns the most appropriate personality for a given intent category';
COMMENT ON FUNCTION update_personality_usage(UUID) IS 'Updates usage statistics when a personality is used for a response';
COMMENT ON FUNCTION get_intent_recognition_stats(UUID) IS 'Returns analytics about intent recognition performance for an instance';