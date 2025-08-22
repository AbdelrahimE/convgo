-- Debug query to check personality system issue
-- This is a diagnostic query to understand why get_contextual_personality is not returning results

-- First, let's create a simple debug function that logs everything step by step
CREATE OR REPLACE FUNCTION debug_personality_search(
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
    p_business_context JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(
    step_number INTEGER,
    step_description TEXT,
    result_data JSONB
) AS $$
BEGIN
    -- Step 1: Check if instance exists
    RETURN QUERY
    SELECT 
        1 as step_number,
        'Check if instance exists' as step_description,
        jsonb_build_object(
            'instance_id', p_whatsapp_instance_id,
            'instance_count', (
                SELECT COUNT(*) 
                FROM public.whatsapp_instances 
                WHERE id = p_whatsapp_instance_id
            )
        ) as result_data;
    
    -- Step 2: Check how many personalities exist for this instance
    RETURN QUERY
    SELECT 
        2 as step_number,
        'Count personalities for instance' as step_description,
        jsonb_build_object(
            'total_personalities', (
                SELECT COUNT(*) 
                FROM public.ai_personalities 
                WHERE whatsapp_instance_id = p_whatsapp_instance_id
            ),
            'active_personalities', (
                SELECT COUNT(*) 
                FROM public.ai_personalities 
                WHERE whatsapp_instance_id = p_whatsapp_instance_id 
                AND is_active = true
            )
        ) as result_data;
    
    -- Step 3: Show all personalities for this instance
    RETURN QUERY
    SELECT 
        3 as step_number,
        'List all personalities' as step_description,
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'is_active', p.is_active,
                'is_default', p.is_default,
                'intent_categories', p.intent_categories
            )
        ) as result_data
    FROM public.ai_personalities p
    WHERE p.whatsapp_instance_id = p_whatsapp_instance_id;
    
    -- Step 4: Check intent match specifically
    RETURN QUERY
    SELECT 
        4 as step_number,
        'Check intent match for: ' || p_intent as step_description,
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'intent_categories', p.intent_categories,
                'has_intent_match', (p.intent_categories @> jsonb_build_array(p_intent)),
                'is_default', p.is_default
            )
        ) as result_data
    FROM public.ai_personalities p
    WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
      AND p.is_active = true
      AND (
          p.intent_categories @> jsonb_build_array(p_intent)
          OR p.is_default = true
      );
      
    -- Step 5: Test the original function
    RETURN QUERY
    SELECT 
        5 as step_number,
        'Original function result' as step_description,
        jsonb_agg(
            jsonb_build_object(
                'personality_id', gcp.personality_id,
                'personality_name', gcp.personality_name,
                'system_prompt_preview', LEFT(gcp.system_prompt, 100),
                'temperature', gcp.temperature,
                'confidence_score', gcp.confidence_score
            )
        ) as result_data
    FROM get_contextual_personality(p_whatsapp_instance_id, p_intent, p_business_context) gcp;
    
END;
$$ LANGUAGE plpgsql;

-- Test query that you can run manually to debug
-- Just replace the UUID with your actual instance ID
-- SELECT * FROM debug_personality_search('c6156467-06c7-41e4-ae8a-b6cd667be693', 'sales', '{"industry": "subscription"}'::jsonb);