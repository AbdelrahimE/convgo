-- ================================================================
-- إصلاح سريع لدالة get_contextual_personality
-- يُصلح مشكلة عدم إرجاع الشخصيات المناسبة للنوايا
-- ================================================================

-- حذف الدالة القديمة المعطلة
DROP FUNCTION IF EXISTS public.get_contextual_personality(UUID, VARCHAR(50), JSONB);

-- إعادة إنشاء الدالة بشكل صحيح
CREATE OR REPLACE FUNCTION get_contextual_personality(
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
    p_business_context JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    personality_id UUID,
    personality_name VARCHAR(100),
    system_prompt TEXT,
    temperature DECIMAL(3,2),
    confidence_score DECIMAL(5,4)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_type VARCHAR(100);
    v_pattern_success_rate DECIMAL(5,4) := 0.0;
BEGIN
    -- استخراج نوع العمل من السياق
    v_business_type := COALESCE(p_business_context->>'industry', 'عام');
    
    -- الحصول على معدل النجاح لهذا النمط
    SELECT success_rate INTO v_pattern_success_rate
    FROM public.business_context_patterns
    WHERE whatsapp_instance_id = p_whatsapp_instance_id
    AND business_type = v_business_type;
    
    -- FIX الصحيح: استخدام البنية الصحيحة للجدول مع intent_categories JSONB
    RETURN QUERY
    SELECT 
        p.id as personality_id,
        p.name as personality_name,
        p.system_prompt,
        p.temperature,
        COALESCE(v_pattern_success_rate, 0.7) as confidence_score
    FROM public.ai_personalities p
    WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
    AND p.is_active = true
    AND (
        -- البحث في JSONB array باستخدام ? operator
        p.intent_categories ? p_intent
        -- أو الشخصية الافتراضية
        OR p.is_default = true
    )
    ORDER BY 
        CASE 
            WHEN p.intent_categories ? p_intent THEN 1    -- أولوية عالية للتطابق المباشر
            WHEN p.is_default = true THEN 2               -- أولوية متوسطة للافتراضية
            ELSE 3                                         -- أولوية منخفضة للباقي
        END,
        p.priority DESC,        -- الأولوية المحددة
        p.usage_count DESC,     -- الأكثر استخداماً أولاً
        p.created_at DESC       -- الأحدث أولاً في حالة التساوي
    LIMIT 1;
    
    -- إذا لم توجد شخصية مطابقة، ابحث عن أي شخصية افتراضية
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
            p.is_default DESC,    -- الافتراضية أولاً
            p.priority DESC,      -- ثم الأولوية
            p.usage_count DESC,   -- ثم الأكثر استخداماً
            p.created_at DESC     -- ثم الأحدث
        LIMIT 1;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- في حالة الخطأ، نسجل الخطأ ولا نرجع شيئاً
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'get_contextual_personality failed', 
                jsonb_build_object(
                    'error', SQLERRM, 
                    'instance_id', p_whatsapp_instance_id,
                    'intent', p_intent,
                    'business_context', p_business_context
                ), 
                NOW());
        RETURN;
END;
$$;