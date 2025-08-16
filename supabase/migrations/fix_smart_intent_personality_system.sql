-- ================================================================
-- إصلاح النظام الذكي للشخصيات - حل المشكلة من الجذور
-- ================================================================

-- ================================================================
-- 1. إصلاح دالة get_contextual_personality (المشكلة الأساسية)
-- ================================================================
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

-- ================================================================
-- 2. إنشاء دالة مساعدة للتحقق من الشخصيات الموجودة
-- ================================================================
CREATE OR REPLACE FUNCTION check_personalities_for_instance(
    p_whatsapp_instance_id UUID
)
RETURNS TABLE(
    personality_count INTEGER,
    active_personalities INTEGER,
    intent_categories TEXT[],
    has_general_personality BOOLEAN,
    has_technical_personality BOOLEAN,
    has_sales_personality BOOLEAN,
    has_billing_personality BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH ap AS (
        SELECT *
        FROM public.ai_personalities
        WHERE whatsapp_instance_id = p_whatsapp_instance_id
    ),
    cats AS (
        SELECT DISTINCT jsonb_array_elements_text(ap.intent_categories) AS cat
        FROM ap
        WHERE ap.intent_categories IS NOT NULL
          AND jsonb_typeof(ap.intent_categories) = 'array'
    )
    SELECT
        COUNT(*)::INTEGER AS personality_count,
        COUNT(*) FILTER (WHERE ap.is_active = true)::INTEGER AS active_personalities,
        COALESCE(ARRAY(SELECT cat FROM cats), ARRAY[]::text[]) AS intent_categories,
        EXISTS(SELECT 1 FROM ap WHERE ap.is_active = true AND ap.intent_categories ? 'general')   AS has_general_personality,
        EXISTS(SELECT 1 FROM ap WHERE ap.is_active = true AND ap.intent_categories ? 'technical') AS has_technical_personality,
        EXISTS(SELECT 1 FROM ap WHERE ap.is_active = true AND ap.intent_categories ? 'sales')     AS has_sales_personality,
        EXISTS(SELECT 1 FROM ap WHERE ap.is_active = true AND ap.intent_categories ? 'billing')   AS has_billing_personality
    FROM ap;
END;
$$;

-- ================================================================
-- 3. إنشاء دالة تنظيف وتحديث الشخصيات
-- ================================================================
CREATE OR REPLACE FUNCTION ensure_default_personalities(
    p_whatsapp_instance_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_personalities_count INTEGER := 0;
    v_default_prompt TEXT;
BEGIN
    -- عد الشخصيات الحالية
    SELECT COUNT(*) INTO v_personalities_count
    FROM public.ai_personalities
    WHERE whatsapp_instance_id = p_whatsapp_instance_id
    AND is_active = true;
    
    -- إذا لم توجد شخصيات، إنشاء شخصيات افتراضية
    IF v_personalities_count = 0 THEN
        -- نص افتراضي للشخصيات
        v_default_prompt := 'أنت مساعد ذكي متخصص في خدمة العملاء. اجب على استفسارات العملاء بطريقة مهنية وودودة. تأكد من فهم احتياجاتهم وقدم لهم المساعدة المناسبة.';
        
        -- إنشاء شخصية عامة افتراضية
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            user_id,
            name,
            system_prompt,
            intent_categories,
            temperature,
            is_active,
            is_default,
            usage_count
        ) VALUES (
            p_whatsapp_instance_id,
            p_user_id,
            'المساعد العام',
            v_default_prompt || ' تخصصك هو تقديم المساعدة العامة والإجابة على الاستفسارات المتنوعة.',
            '["general"]'::jsonb,
            0.7,
            true,
            true,  -- افتراضية
            0
        );
        
        -- إنشاء شخصية المبيعات
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            user_id,
            name,
            system_prompt,
            intent_categories,
            temperature,
            is_active,
            is_default,
            usage_count,
            priority
        ) VALUES (
            p_whatsapp_instance_id,
            p_user_id,
            'مختص المبيعات',
            v_default_prompt || ' تخصصك هو المبيعات وتقديم معلومات عن المنتجات والخدمات والأسعار وحل استفسارات العملاء المتعلقة بالشراء.',
            '["sales"]'::jsonb,
            0.6,
            true,
            false,
            0,
            2
        );
        
        -- إنشاء شخصية الدعم التقني
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            user_id,
            name,
            system_prompt,
            intent_categories,
            temperature,
            is_active,
            is_default,
            usage_count,
            priority
        ) VALUES (
            p_whatsapp_instance_id,
            p_user_id,
            'مختص الدعم التقني',
            v_default_prompt || ' تخصصك هو الدعم التقني وحل المشاكل التقنية ومساعدة العملاء في استخدام المنتجات والخدمات التقنية.',
            '["technical", "support"]'::jsonb,
            0.5,
            true,
            false,
            0,
            2
        );
        
        -- إنشاء شخصية الفواتير والمدفوعات
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            user_id,
            name,
            system_prompt,
            intent_categories,
            temperature,
            is_active,
            is_default,
            usage_count,
            priority
        ) VALUES (
            p_whatsapp_instance_id,
            p_user_id,
            'مختص الفواتير والمدفوعات',
            v_default_prompt || ' تخصصك هو مساعدة العملاء في مسائل الفواتير والمدفوعات والاشتراكات والمسائل المالية.',
            '["billing", "payment", "subscription"]'::jsonb,
            0.6,
            true,
            false,
            0,
            2
        );
        
        RETURN true;
    END IF;
    
    RETURN false;
    
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'ensure_default_personalities failed', 
                jsonb_build_object('error', SQLERRM, 'instance_id', p_whatsapp_instance_id), 
                NOW());
        RETURN false;
END;
$$;

-- ================================================================
-- 4. دالة تشخيص النظام الذكي
-- ================================================================
CREATE OR REPLACE FUNCTION diagnose_smart_intent_system(
    p_whatsapp_instance_id UUID
)
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT,
    recommendation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_personality_count INTEGER;
    v_active_personalities INTEGER;
    v_has_technical BOOLEAN;
    v_has_sales BOOLEAN;
    v_has_billing BOOLEAN;
    v_has_general BOOLEAN;
    v_ai_config_exists BOOLEAN;
    v_personality_system_enabled BOOLEAN;
BEGIN
    -- فحص الشخصيات
    SELECT personality_count, active_personalities, has_technical_personality, 
           has_sales_personality, has_billing_personality, has_general_personality
    INTO v_personality_count, v_active_personalities, v_has_technical, 
         v_has_sales, v_has_billing, v_has_general
    FROM check_personalities_for_instance(p_whatsapp_instance_id);
    
    -- فحص إعدادات الـ AI
    SELECT EXISTS(
        SELECT 1 FROM public.whatsapp_ai_config 
        WHERE whatsapp_instance_id = p_whatsapp_instance_id AND is_active = true
    ), COALESCE(
        (SELECT use_personality_system FROM public.whatsapp_ai_config 
         WHERE whatsapp_instance_id = p_whatsapp_instance_id AND is_active = true LIMIT 1), 
        false
    )
    INTO v_ai_config_exists, v_personality_system_enabled;
    
    -- نتائج الفحص
    RETURN QUERY VALUES
        ('الشخصيات الموجودة', 
         CASE WHEN v_personality_count > 0 THEN 'نجح' ELSE 'فشل' END,
         'عدد الشخصيات: ' || v_personality_count || ', نشطة: ' || v_active_personalities,
         CASE WHEN v_personality_count = 0 THEN 'يجب إنشاء شخصيات افتراضية' ELSE 'جيد' END),
         
        ('شخصية المبيعات',
         CASE WHEN v_has_sales THEN 'نجح' ELSE 'فشل' END,
         CASE WHEN v_has_sales THEN 'موجودة' ELSE 'غير موجودة' END,
         CASE WHEN v_has_sales THEN 'جيد' ELSE 'يجب إنشاء شخصية للمبيعات' END),
         
        ('شخصية الدعم التقني',
         CASE WHEN v_has_technical THEN 'نجح' ELSE 'فشل' END,
         CASE WHEN v_has_technical THEN 'موجودة' ELSE 'غير موجودة' END,
         CASE WHEN v_has_technical THEN 'جيد' ELSE 'يجب إنشاء شخصية للدعم التقني' END),
         
        ('شخصية الفواتير',
         CASE WHEN v_has_billing THEN 'نجح' ELSE 'فشل' END,
         CASE WHEN v_has_billing THEN 'موجودة' ELSE 'غير موجودة' END,
         CASE WHEN v_has_billing THEN 'جيد' ELSE 'يجب إنشاء شخصية للفواتير' END),
         
        ('إعدادات الـ AI',
         CASE WHEN v_ai_config_exists THEN 'نجح' ELSE 'فشل' END,
         CASE WHEN v_ai_config_exists THEN 'موجودة' ELSE 'غير موجودة' END,
         CASE WHEN v_ai_config_exists THEN 'جيد' ELSE 'يجب إعداد AI Config' END),
         
        ('نظام الشخصيات مفعل',
         CASE WHEN v_personality_system_enabled THEN 'نجح' ELSE 'فشل' END,
         CASE WHEN v_personality_system_enabled THEN 'مفعل' ELSE 'معطل' END,
         CASE WHEN v_personality_system_enabled THEN 'جيد' ELSE 'يجب تفعيل نظام الشخصيات' END);
END;
$$;

-- ================================================================
-- 5. منح الصلاحيات للدوال الجديدة
-- ================================================================
GRANT EXECUTE ON FUNCTION get_contextual_personality TO authenticated;
GRANT EXECUTE ON FUNCTION check_personalities_for_instance TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_default_personalities TO authenticated;
GRANT EXECUTE ON FUNCTION diagnose_smart_intent_system TO authenticated;

-- ================================================================
-- 6. إضافة فهرس لتحسين الأداء
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_ai_personalities_intent_active 
ON public.ai_personalities(whatsapp_instance_id, intent_categories, is_active)
WHERE is_active = true;

-- ================================================================
-- تعليق على الإصلاحات
-- ================================================================
COMMENT ON FUNCTION get_contextual_personality IS 'دالة مُصلحة للحصول على الشخصية المناسبة - تم إصلاح مشكلة JOIN';
COMMENT ON FUNCTION check_personalities_for_instance IS 'فحص الشخصيات الموجودة لInstance معين';
COMMENT ON FUNCTION ensure_default_personalities IS 'إنشاء شخصيات افتراضية إذا لم توجد';
COMMENT ON FUNCTION diagnose_smart_intent_system IS 'تشخيص شامل لنظام النوايا الذكي';