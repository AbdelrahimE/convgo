-- Fix get_contextual_personality to use optimized confidence threshold for MVP

CREATE OR REPLACE FUNCTION get_contextual_personality(
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
    p_intent_confidence DECIMAL(5,4) DEFAULT 0.8,  -- Add confidence parameter
    p_business_context JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(
    personality_id UUID,
    personality_name VARCHAR(100),
    system_prompt TEXT,
    temperature DECIMAL(3,2),
    confidence_score DECIMAL(5,4)
) AS $$
DECLARE
    v_business_type VARCHAR(100);
    v_optimized_threshold DECIMAL(5,4) := 0.7; -- Fixed optimized threshold for MVP
BEGIN
    -- استخراج نوع العمل من السياق
    v_business_type := COALESCE(p_business_context->>'industry', 'عام');
    
    -- الآن نقارن confidence الفعلي مع العتبة المحسنة
    IF p_intent_confidence >= v_optimized_threshold THEN
        -- الثقة عالية - استخدم الشخصية المحددة للـ intent
        RETURN QUERY
        SELECT 
            p.id as personality_id,
            p.name as personality_name,
            p.system_prompt,
            p.temperature,
            p_intent_confidence as confidence_score  -- استخدم الثقة الفعلية
        FROM public.ai_personalities p
        WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
          AND p.is_active = true
          AND p.intent_categories @> jsonb_build_array(p_intent)
        ORDER BY 
            p.priority DESC,
            p.usage_count DESC,
            p.created_at DESC
        LIMIT 1;
    END IF;
    
    -- إذا لم توجد شخصية محددة أو الثقة منخفضة - استخدم الافتراضية
    IF NOT FOUND OR p_intent_confidence < v_optimized_threshold THEN
        RETURN QUERY
        SELECT 
            p.id as personality_id,
            p.name as personality_name,
            p.system_prompt,
            p.temperature,
            0.5::DECIMAL(5,4) as confidence_score  -- ثقة منخفضة للافتراضية
        FROM public.ai_personalities p
        WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
          AND p.is_active = true
          AND p.is_default = true
        ORDER BY 
            p.priority DESC,
            p.created_at DESC
        LIMIT 1;
    END IF;
    
    -- إذا لم توجد حتى شخصية افتراضية، خذ أي شخصية متاحة
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            p.id as personality_id,
            p.name as personality_name,
            p.system_prompt,
            p.temperature,
            0.3::DECIMAL(5,4) as confidence_score  -- أقل ثقة للعشوائية
        FROM public.ai_personalities p
        WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
          AND p.is_active = true
        ORDER BY 
            p.priority DESC,
            p.usage_count DESC,
            p.created_at DESC
        LIMIT 1;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- في حالة الخطأ، لا نرجع شيئاً
        RETURN;
END;
$$ LANGUAGE plpgsql;

-- تحديث التعليق
COMMENT ON FUNCTION get_contextual_personality(UUID, VARCHAR, DECIMAL, JSONB) IS 'Returns the most appropriate personality based on intent confidence using optimized threshold (0.7) for MVP';