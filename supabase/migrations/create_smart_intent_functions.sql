-- ================================================================
-- إنشاء دوال قاعدة البيانات للنظام الذكي
-- تحويل النظام من الكلمات المفتاحية إلى التعلم الذكي
-- ================================================================

-- ================================================================
-- 1. دالة التعلم من التفاعل الناجح
-- ================================================================
CREATE OR REPLACE FUNCTION learn_from_successful_intent(
    p_whatsapp_instance_id UUID,
    p_message TEXT,
    p_business_context JSONB,
    p_intent VARCHAR(50),
    p_confidence DECIMAL(5,4),
    p_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_hash VARCHAR(64);
    v_business_type VARCHAR(100);
    v_pattern_exists BOOLEAN := FALSE;
BEGIN
    -- توليد هاش للرسالة لتجنب التكرار
    v_message_hash := encode(digest(p_message, 'sha256'), 'hex');
    
    -- استخراج نوع العمل من السياق
    v_business_type := COALESCE(p_business_context->>'industry', 'عام');
    
    -- تحقق من وجود هذا النمط مسبقاً
    SELECT EXISTS(
        SELECT 1 FROM public.intent_learning_history 
        WHERE message_hash = v_message_hash 
        AND whatsapp_instance_id = p_whatsapp_instance_id
    ) INTO v_pattern_exists;
    
    -- إذا لم يكن موجوداً، احفظه
    IF NOT v_pattern_exists THEN
        INSERT INTO public.intent_learning_history (
            whatsapp_instance_id,
            message_text,
            message_hash,
            business_context,
            detected_intent,
            confidence_score,
            success,
            created_at
        ) VALUES (
            p_whatsapp_instance_id,
            p_message,
            v_message_hash,
            p_business_context,
            p_intent,
            p_confidence,
            TRUE,
            p_timestamp
        );
        
        -- تحديث أو إنشاء نمط السياق التجاري
        PERFORM update_business_context_pattern(
            p_whatsapp_instance_id,
            v_business_type,
            p_business_context,
            p_intent,
            p_confidence
        );
        
        -- تحديث مقاييس الأداء
        PERFORM update_intent_success_metrics(
            p_whatsapp_instance_id,
            p_intent,
            p_confidence,
            TRUE,
            p_timestamp
        );
    END IF;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        -- تسجيل الخطأ وإرجاع FALSE
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'learn_from_successful_intent failed', 
                jsonb_build_object('error', SQLERRM, 'instance_id', p_whatsapp_instance_id), 
                NOW());
        RETURN FALSE;
END;
$$;

-- ================================================================
-- 2. دالة تحديث نمط السياق التجاري
-- ================================================================
CREATE OR REPLACE FUNCTION update_business_context_pattern(
    p_whatsapp_instance_id UUID,
    p_business_type VARCHAR(100),
    p_business_context JSONB,
    p_intent VARCHAR(50),
    p_confidence DECIMAL(5,4)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pattern_id UUID;
    v_current_count INTEGER := 0;
    v_current_success_rate DECIMAL(5,4) := 0.0;
    v_current_avg_confidence DECIMAL(5,4) := 0.0;
    v_new_keywords JSONB;
    v_new_phrases JSONB;
BEGIN
    -- البحث عن النمط الموجود
    SELECT id, detection_count, success_rate, average_confidence
    INTO v_pattern_id, v_current_count, v_current_success_rate, v_current_avg_confidence
    FROM public.business_context_patterns
    WHERE whatsapp_instance_id = p_whatsapp_instance_id
    AND business_type = p_business_type;
    
    -- إعداد البيانات الجديدة
    v_new_keywords := COALESCE(p_business_context->'detectedTerms', '[]'::jsonb);
    v_new_phrases := jsonb_build_array(p_business_context->>'message');
    
    IF v_pattern_id IS NOT NULL THEN
        -- تحديث النمط الموجود
        UPDATE public.business_context_patterns
        SET 
            detection_count = v_current_count + 1,
            success_rate = (v_current_success_rate * v_current_count + p_confidence) / (v_current_count + 1),
            average_confidence = (v_current_avg_confidence * v_current_count + p_confidence) / (v_current_count + 1),
            industry_keywords = industry_keywords || v_new_keywords,
            common_phrases = common_phrases || v_new_phrases,
            intent_preferences = jsonb_set(
                COALESCE(intent_preferences, '{}'::jsonb),
                ('{"' || p_intent || '"}')::text[],
                to_jsonb(COALESCE((intent_preferences->>p_intent)::integer, 0) + 1)
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_pattern_id;
    ELSE
        -- إنشاء نمط جديد
        INSERT INTO public.business_context_patterns (
            whatsapp_instance_id,
            business_type,
            industry_keywords,
            communication_style,
            detection_count,
            success_rate,
            average_confidence,
            common_phrases,
            intent_preferences
        ) VALUES (
            p_whatsapp_instance_id,
            p_business_type,
            v_new_keywords,
            COALESCE(p_business_context->>'communicationStyle', 'casual'),
            1,
            p_confidence,
            p_confidence,
            v_new_phrases,
            jsonb_build_object(p_intent, 1)
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- تسجيل الخطأ
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'update_business_context_pattern failed', 
                jsonb_build_object('error', SQLERRM, 'business_type', p_business_type), 
                NOW());
END;
$$;

-- ================================================================
-- 3. دالة الحصول على الشخصية المناسبة حسب السياق
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
-- 4. دالة تحديث مقاييس النجاح
-- ================================================================
CREATE OR REPLACE FUNCTION update_intent_success_metrics(
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
    p_confidence DECIMAL(5,4),
    p_is_success BOOLEAN,
    p_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_metrics_id UUID;
    v_current_total INTEGER := 0;
    v_current_successful INTEGER := 0;
    v_current_avg_confidence DECIMAL(5,4) := 0.0;
    v_intent_breakdown JSONB := '{}'::jsonb;
BEGIN
    -- البحث عن المقاييس الحالية
    SELECT 
        id, 
        total_interactions, 
        successful_classifications, 
        average_confidence,
        intent_breakdown
    INTO 
        v_metrics_id, 
        v_current_total, 
        v_current_successful, 
        v_current_avg_confidence,
        v_intent_breakdown
    FROM public.intent_performance_metrics
    WHERE whatsapp_instance_id = p_whatsapp_instance_id;
    
    -- تحديث تفصيل النوايا
    v_intent_breakdown := jsonb_set(
        COALESCE(v_intent_breakdown, '{}'::jsonb),
        ('{"' || p_intent || '", "count"}')::text[],
        to_jsonb(COALESCE((v_intent_breakdown->p_intent->>'count')::integer, 0) + 1)
    );
    
    IF p_is_success THEN
        v_intent_breakdown := jsonb_set(
            v_intent_breakdown,
            ('{"' || p_intent || '", "successful"}')::text[],
            to_jsonb(COALESCE((v_intent_breakdown->p_intent->>'successful')::integer, 0) + 1)
        );
    END IF;
    
    IF v_metrics_id IS NOT NULL THEN
        -- تحديث المقاييس الموجودة
        UPDATE public.intent_performance_metrics
        SET 
            total_interactions = v_current_total + 1,
            successful_classifications = v_current_successful + CASE WHEN p_is_success THEN 1 ELSE 0 END,
            accuracy_rate = CASE 
                WHEN (v_current_total + 1) > 0 THEN 
                    (v_current_successful + CASE WHEN p_is_success THEN 1 ELSE 0 END)::DECIMAL / (v_current_total + 1)
                ELSE 0 
            END,
            average_confidence = (v_current_avg_confidence * v_current_total + p_confidence) / (v_current_total + 1),
            intent_breakdown = v_intent_breakdown,
            last_calculation = p_timestamp,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_metrics_id;
    ELSE
        -- إنشاء مقاييس جديدة
        INSERT INTO public.intent_performance_metrics (
            whatsapp_instance_id,
            total_interactions,
            successful_classifications,
            accuracy_rate,
            average_confidence,
            intent_breakdown,
            last_calculation
        ) VALUES (
            p_whatsapp_instance_id,
            1,
            CASE WHEN p_is_success THEN 1 ELSE 0 END,
            CASE WHEN p_is_success THEN 1.0 ELSE 0.0 END,
            p_confidence,
            v_intent_breakdown,
            p_timestamp
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- تسجيل الخطأ
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'update_intent_success_metrics failed', 
                jsonb_build_object('error', SQLERRM, 'intent', p_intent), 
                NOW());
END;
$$;

-- ================================================================
-- 5. دالة تحليل الأنماط المتعلمة
-- ================================================================
CREATE OR REPLACE FUNCTION analyze_learned_patterns_for_intent(
    p_whatsapp_instance_id UUID,
    p_message TEXT,
    p_business_type VARCHAR(100) DEFAULT 'عام'
)
RETURNS TABLE(
    suggested_intent VARCHAR(50),
    confidence DECIMAL(5,4),
    reasoning TEXT,
    pattern_source VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_words TEXT[];
    v_pattern_record RECORD;
    v_best_match RECORD := NULL;
    v_best_similarity DECIMAL(5,4) := 0.0;
BEGIN
    -- تقسيم الرسالة إلى كلمات
    v_message_words := string_to_array(lower(p_message), ' ');
    
    -- البحث في الأنماط المتعلمة
    FOR v_pattern_record IN 
        SELECT 
            ilh.detected_intent,
            ilh.confidence_score,
            ilh.message_text,
            ilh.business_context
        FROM public.intent_learning_history ilh
        WHERE ilh.whatsapp_instance_id = p_whatsapp_instance_id
        AND ilh.success = true
        AND (
            p_business_type = 'عام' 
            OR ilh.business_context->>'industry' = p_business_type
        )
        ORDER BY ilh.created_at DESC
        LIMIT 50
    LOOP
        DECLARE
            v_pattern_words TEXT[];
            v_common_words INTEGER;
            v_similarity DECIMAL(5,4);
        BEGIN
            -- تقسيم نص النمط إلى كلمات
            v_pattern_words := string_to_array(lower(v_pattern_record.message_text), ' ');
            
            -- حساب الكلمات المشتركة
            SELECT COUNT(*)::INTEGER INTO v_common_words
            FROM unnest(v_message_words) AS msg_word
            WHERE msg_word = ANY(v_pattern_words);
            
            -- حساب التشابه
            v_similarity := v_common_words::DECIMAL / GREATEST(array_length(v_message_words, 1), array_length(v_pattern_words, 1));
            
            -- تحديث أفضل تطابق
            IF v_similarity > v_best_similarity AND v_similarity > 0.3 THEN
                v_best_similarity := v_similarity;
                v_best_match := v_pattern_record;
            END IF;
        END;
    END LOOP;
    
    -- إرجاع النتيجة إذا وجدت تطابق جيد
    IF v_best_match IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            v_best_match.detected_intent,
            (v_best_similarity * v_best_match.confidence_score)::DECIMAL(5,4),
            ('نمط متعلم: ' || substring(v_best_match.message_text, 1, 50) || '...')::TEXT,
            ('تعلم سابق')::VARCHAR(100);
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- في حالة الخطأ، لا ترجع شيئاً
        RETURN;
END;
$$;

-- ================================================================
-- 6. دالة تنظيف البيانات القديمة
-- ================================================================
CREATE OR REPLACE FUNCTION cleanup_old_learning_data(
    p_whatsapp_instance_id UUID,
    p_days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
    v_cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- حساب تاريخ القطع
    v_cutoff_date := CURRENT_TIMESTAMP - (p_days_to_keep || ' days')::INTERVAL;
    
    -- حذف البيانات القديمة غير الناجحة فقط
    DELETE FROM public.intent_learning_history
    WHERE whatsapp_instance_id = p_whatsapp_instance_id
    AND created_at < v_cutoff_date
    AND success = false;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- تسجيل عملية التنظيف
    INSERT INTO public.system_logs (level, message, details, created_at)
    VALUES ('INFO', 'Cleaned up old learning data', 
            jsonb_build_object(
                'instance_id', p_whatsapp_instance_id,
                'deleted_count', v_deleted_count,
                'cutoff_date', v_cutoff_date
            ), 
            NOW());
    
    RETURN v_deleted_count;
    
EXCEPTION
    WHEN OTHERS THEN
        -- تسجيل الخطأ
        INSERT INTO public.system_logs (level, message, details, created_at)
        VALUES ('ERROR', 'cleanup_old_learning_data failed', 
                jsonb_build_object('error', SQLERRM, 'instance_id', p_whatsapp_instance_id), 
                NOW());
        RETURN 0;
END;
$$;

-- ================================================================
-- إنشاء جدول السجلات إذا لم يكن موجوداً
-- ================================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- إعطاء صلاحيات للدوال
-- ================================================================
GRANT EXECUTE ON FUNCTION learn_from_successful_intent TO authenticated;
GRANT EXECUTE ON FUNCTION get_contextual_personality TO authenticated;
GRANT EXECUTE ON FUNCTION update_intent_success_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_learned_patterns_for_intent TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_learning_data TO authenticated;