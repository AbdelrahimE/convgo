CREATE OR REPLACE FUNCTION get_contextual_personality(
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
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
BEGIN
    -- استخراج نوع العمل من السياق (ممكن تستفيد بيه في المستقبل)
    v_business_type := COALESCE(p_business_context->>'industry', 'عام');
    
    -- إضافة logging للتأكد من البيانات
    INSERT INTO public.system_logs (level, message, details, created_at)
    VALUES (
        'INFO',
        'get_contextual_personality called', 
        jsonb_build_object(
            'instance_id', p_whatsapp_instance_id,
            'intent', p_intent,
            'business_context', p_business_context,
            'business_type', v_business_type
        ), 
        NOW()
    );
    
    -- إرجاع أفضل شخصية مطابقة للـ intent أو الافتراضية
    RETURN QUERY
    SELECT 
        p.id as personality_id,
        p.name as personality_name,
        p.system_prompt,
        p.temperature,
        0.7::DECIMAL(5,4) as confidence_score
    FROM public.ai_personalities p
    WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
      AND p.is_active = true
      AND (
          p.intent_categories @> jsonb_build_array(p_intent)
          OR p.is_default = true
      )
    ORDER BY 
        CASE 
            WHEN p.intent_categories @> jsonb_build_array(p_intent) THEN 1
            WHEN p.is_default = true THEN 2
            ELSE 3
        END,
        p.priority DESC,
        p.usage_count DESC,
        p.created_at DESC
    LIMIT 1;
    
    -- إذا لم توجد شخصية مطابقة، رجّع أي شخصية افتراضية أو أعلى شخصية متاحة
    -- إضافة logging للنتيجة
    INSERT INTO public.system_logs (level, message, details, created_at)
    VALUES (
        'INFO',
        'get_contextual_personality result', 
        jsonb_build_object(
            'instance_id', p_whatsapp_instance_id,
            'intent', p_intent,
            'found_personality', false,
            'fallback_used', true
        ), 
        NOW()
    );
    
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            p.id as personality_id,
            p.name as personality_name,
            p.system_prompt,
            p.temperature,
            0.5::DECIMAL(5,4) as confidence_score
        FROM public.ai_personalities p
        WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
          AND p.is_active = true
        ORDER BY 
            p.is_default DESC,
            p.priority DESC,
            p.usage_count DESC,
            p.created_at DESC
        LIMIT 1;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- في حالة الخطأ، نسجل الخطأ ولا نرجع شيئاً
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES (
            'ERROR',
            'get_contextual_personality failed', 
            jsonb_build_object(
                'error', SQLERRM, 
                'instance_id', p_whatsapp_instance_id,
                'intent', p_intent,
                'business_context', p_business_context
            ), 
            NOW()
        );
        RETURN;
END;
$$ LANGUAGE plpgsql;