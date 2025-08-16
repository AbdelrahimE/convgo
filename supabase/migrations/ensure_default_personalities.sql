-- ================================================================
-- التأكد من وجود شخصيات افتراضية للنوايا المختلفة
-- يُنشئ شخصيات افتراضية إذا لم تكن موجودة
-- ================================================================

-- دالة لإنشاء شخصيات افتراضية لـ instance معين
CREATE OR REPLACE FUNCTION ensure_default_personalities_for_instance(
    p_whatsapp_instance_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_created_count INTEGER := 0;
    v_existing_count INTEGER := 0;
BEGIN
    -- التحقق من عدد الشخصيات الموجودة
    SELECT COUNT(*) INTO v_existing_count
    FROM public.ai_personalities
    WHERE whatsapp_instance_id = p_whatsapp_instance_id
    AND is_active = true;
    
    -- إذا لم توجد شخصيات، أنشئ شخصيات افتراضية
    IF v_existing_count = 0 THEN
        
        -- 1. شخصية المبيعات
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            name,
            intent_category,
            system_prompt,
            temperature,
            is_active,
            created_by_system
        ) VALUES (
            p_whatsapp_instance_id,
            'مساعد المبيعات',
            'sales',
            'أنت مساعد مبيعات محترف ومتخصص. دورك هو:

- الرد على استفسارات العملاء حول المنتجات والخدمات
- تقديم معلومات الأسعار والباقات 
- شرح مميزات المنتجات بطريقة واضحة ومقنعة
- مساعدة العملاء في اختيار الحل المناسب لاحتياجاتهم
- التعامل مع الاعتراضات بطريقة مهنية
- توجيه العملاء لإتمام عملية الشراء

كن ودوداً ومتحمساً ومساعداً. استخدم لغة بسيطة وواضحة. ركز على فوائد المنتج للعميل.',
            0.7,
            true,
            true
        );
        v_created_count := v_created_count + 1;
        
        -- 2. شخصية الدعم التقني
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            name,
            intent_category,
            system_prompt,
            temperature,
            is_active,
            created_by_system
        ) VALUES (
            p_whatsapp_instance_id,
            'مساعد الدعم التقني',
            'technical',
            'أنت مساعد دعم تقني متخصص ومحترف. دورك هو:

- حل المشاكل التقنية للعملاء بطريقة سريعة وفعالة
- تقديم إرشادات واضحة خطوة بخطوة
- شرح الحلول التقنية بطريقة بسيطة ومفهومة
- تشخيص المشاكل وتحديد الأسباب الجذرية
- مساعدة العملاء في استخدام المنتجات والخدمات
- تصعيد المشاكل المعقدة عند الحاجة

كن صبوراً ومتفهماً ومنهجياً. استخدم لغة تقنية مناسبة لمستوى فهم العميل. ركز على إيجاد حلول عملية.',
            0.3,
            true,
            true
        );
        v_created_count := v_created_count + 1;
        
        -- 3. شخصية خدمة العملاء العامة
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            name,
            intent_category,
            system_prompt,
            temperature,
            is_active,
            created_by_system
        ) VALUES (
            p_whatsapp_instance_id,
            'مساعد خدمة العملاء',
            'customer-support',
            'أنت مساعد خدمة عملاء ودود ومحترف. دورك هو:

- الترحيب بالعملاء والرد على استفساراتهم العامة
- تقديم معلومات عن الشركة والخدمات
- توجيه العملاء للقسم المناسب حسب احتياجاتهم
- التعامل مع الشكاوى والاقتراحات بطريقة مهنية
- مساعدة العملاء في إيجاد المعلومات التي يحتاجونها
- تقديم تجربة عملاء ممتازة ومرضية

كن ودوداً ومتعاوناً ومساعداً. استخدم لغة مهذبة ومرحبة. ركز على رضا العميل وحل مشاكله.',
            0.5,
            true,
            true
        );
        v_created_count := v_created_count + 1;
        
        -- 4. شخصية المدفوعات والفواتير
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            name,
            intent_category,
            system_prompt,
            temperature,
            is_active,
            created_by_system
        ) VALUES (
            p_whatsapp_instance_id,
            'مساعد المدفوعات والفواتير',
            'billing',
            'أنت مساعد متخصص في المدفوعات والفواتير. دورك هو:

- مساعدة العملاء في مسائل الفواتير والمدفوعات
- شرح طرق الدفع المتاحة والتسعير
- حل مشاكل الدفع والمعاملات المالية
- تقديم معلومات عن الاشتراكات والتجديد
- مساعدة العملاء في فهم فواتيرهم
- التعامل مع استفسارات الاسترداد والتعديلات

كن دقيقاً ومحترفاً وشفافاً. تعامل مع المسائل المالية بحساسية. قدم معلومات واضحة ومفصلة.',
            0.3,
            true,
            true
        );
        v_created_count := v_created_count + 1;
        
        -- 5. شخصية افتراضية عامة
        INSERT INTO public.ai_personalities (
            whatsapp_instance_id,
            name,
            intent_category,
            system_prompt,
            temperature,
            is_active,
            created_by_system
        ) VALUES (
            p_whatsapp_instance_id,
            'المساعد الذكي',
            'general',
            'أنت مساعد ذكي ودود ومفيد. دورك هو:

- الرد على الأسئلة العامة بطريقة مفيدة
- مساعدة العملاء في إيجاد المعلومات التي يحتاجونها
- تقديم الدعم والمساعدة في مختلف المواضيع
- توجيه العملاء للقسم المناسب عند الحاجة
- الحفاظ على محادثة ودودة ومهنية
- تقديم تجربة ممتازة للعملاء

كن ودوداً ومساعداً ومرناً. تكيف مع احتياجات العميل وقدم أفضل مساعدة ممكنة.',
            0.6,
            true,
            true
        );
        v_created_count := v_created_count + 1;
        
    END IF;
    
    -- تسجيل النتائج
    INSERT INTO public.system_logs (level, message, details, created_at)
    VALUES ('INFO', 'Default personalities check completed', 
            jsonb_build_object(
                'instance_id', p_whatsapp_instance_id,
                'existing_count', v_existing_count,
                'created_count', v_created_count
            ), 
            NOW());
    
    RETURN v_created_count;
    
EXCEPTION
    WHEN OTHERS THEN
        -- تسجيل الخطأ
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'ensure_default_personalities_for_instance failed', 
                jsonb_build_object('error', SQLERRM, 'instance_id', p_whatsapp_instance_id), 
                NOW());
        RETURN 0;
END;
$$;

-- إضافة عمود created_by_system إذا لم يكن موجوداً
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_personalities' 
        AND column_name = 'created_by_system'
    ) THEN
        ALTER TABLE public.ai_personalities 
        ADD COLUMN created_by_system BOOLEAN DEFAULT false;
        
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('INFO', 'Added created_by_system column to ai_personalities', '{}', NOW());
    END IF;
END;
$$;

-- إعطاء صلاحيات للدالة
GRANT EXECUTE ON FUNCTION ensure_default_personalities_for_instance TO authenticated;

-- إنشاء دالة لتطبيق الشخصيات الافتراضية على جميع instances النشطة
CREATE OR REPLACE FUNCTION apply_default_personalities_to_all_instances()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    instance_record RECORD;
    total_created INTEGER := 0;
    instance_created INTEGER := 0;
BEGIN
    -- التكرار عبر جميع instances النشطة
    FOR instance_record IN 
        SELECT DISTINCT wi.id, wi.instance_name
        FROM public.whatsapp_instances wi
        JOIN public.whatsapp_ai_config wac ON wac.whatsapp_instance_id = wi.id
        WHERE wac.is_active = true
    LOOP
        -- إنشاء شخصيات افتراضية لكل instance
        SELECT ensure_default_personalities_for_instance(instance_record.id) INTO instance_created;
        total_created := total_created + instance_created;
        
        -- تسجيل النتيجة لكل instance
        IF instance_created > 0 THEN
            INSERT INTO public.system_logs (level, message, details, created_at)
            VALUES ('INFO', 'Created default personalities for instance', 
                    jsonb_build_object(
                        'instance_id', instance_record.id,
                        'instance_name', instance_record.instance_name,
                        'personalities_created', instance_created
                    ), 
                    NOW());
        END IF;
    END LOOP;
    
    -- تسجيل النتيجة الإجمالية
    INSERT INTO public.system_logs (level, message, details, created_at)
    VALUES ('INFO', 'Default personalities deployment completed', 
            jsonb_build_object('total_personalities_created', total_created), 
            NOW());
    
    RETURN total_created;
    
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'apply_default_personalities_to_all_instances failed', 
                jsonb_build_object('error', SQLERRM), 
                NOW());
        RETURN 0;
END;
$$;

-- إعطاء صلاحيات
GRANT EXECUTE ON FUNCTION apply_default_personalities_to_all_instances TO authenticated;

-- تسجيل اكتمال إعداد النظام
INSERT INTO public.system_logs (level, message, details, created_at)
VALUES ('INFO', 'Default personalities system setup completed', 
        jsonb_build_object('functions_created', 2), 
        NOW());