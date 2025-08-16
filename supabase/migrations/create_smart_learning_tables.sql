-- ================================================================
-- إنشاء جداول النظام الذكي للتعلم السياقي
-- تحويل النظام من الكلمات المفتاحية إلى التعلم الذكي
-- ================================================================

-- جدول أنماط السياق التجاري
-- يحفظ أنماط الأعمال المختلفة التي تعلمها النظام
CREATE TABLE IF NOT EXISTS public.business_context_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- معلومات السياق التجاري
    business_type VARCHAR(100) NOT NULL, -- نوع العمل (تقنية، طبية، تجارة، إلخ)
    industry_keywords JSONB DEFAULT '{}'::jsonb, -- المصطلحات المكتشفة تلقائياً
    communication_style VARCHAR(50) DEFAULT 'casual', -- أسلوب التواصل
    cultural_markers JSONB DEFAULT '[]'::jsonb, -- العلامات الثقافية واللهجية
    
    -- معلومات الأداء
    detection_count INTEGER DEFAULT 1, -- عدد مرات اكتشاف هذا النمط
    success_rate DECIMAL(5,4) DEFAULT 0.0, -- معدل النجاح
    average_confidence DECIMAL(5,4) DEFAULT 0.0, -- متوسط الثقة
    
    -- بيانات التعلم
    learned_patterns JSONB DEFAULT '{}'::jsonb, -- الأنماط المتعلمة
    common_phrases JSONB DEFAULT '[]'::jsonb, -- العبارات الشائعة
    intent_preferences JSONB DEFAULT '{}'::jsonb, -- تفضيلات النوايا لهذا المجال
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول تاريخ التعلم والنجاح
-- يحفظ كل تفاعل ناجح لتحسين الأداء المستقبلي
CREATE TABLE IF NOT EXISTS public.intent_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- بيانات الرسالة
    message_text TEXT NOT NULL,
    message_hash VARCHAR(64), -- هاش الرسالة لتجنب التكرار
    
    -- بيانات السياق
    business_context JSONB DEFAULT '{}'::jsonb, -- السياق التجاري المكتشف
    dialect_analysis JSONB DEFAULT '{}'::jsonb, -- تحليل اللهجة
    communication_style JSONB DEFAULT '{}'::jsonb, -- أسلوب التواصل
    
    -- نتائج التصنيف
    detected_intent VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(5,4) NOT NULL,
    reasoning TEXT, -- سبب التصنيف
    
    -- ردود الفعل والتعلم
    user_feedback VARCHAR(20), -- positive, negative, neutral
    correction_intent VARCHAR(50), -- التصحيح في حالة الخطأ
    success BOOLEAN DEFAULT true, -- هل كان التصنيف ناجحاً
    
    -- بيانات الأداء
    processing_time_ms INTEGER DEFAULT 0,
    model_version VARCHAR(20) DEFAULT 'smart-v1.0',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول بيانات التكيف مع اللهجات
-- يحفظ أنماط اللهجات المختلفة لكل منطقة ومجال
CREATE TABLE IF NOT EXISTS public.dialect_adaptation_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- معلومات اللهجة
    primary_dialect VARCHAR(50) NOT NULL, -- اللهجة الأساسية
    region VARCHAR(50), -- المنطقة الجغرافية
    confidence DECIMAL(5,4) DEFAULT 0.0, -- ثقة التحديد
    
    -- خصائص اللهجة
    formality_level VARCHAR(20) DEFAULT 'casual', -- مستوى الرسمية
    emotional_tone VARCHAR(30) DEFAULT 'neutral', -- النبرة العاطفية
    cultural_markers JSONB DEFAULT '[]'::jsonb, -- العلامات الثقافية
    
    -- تحليل اللغة
    language_mix JSONB DEFAULT '{}'::jsonb, -- نسبة اللغات المختلطة
    common_expressions JSONB DEFAULT '[]'::jsonb, -- التعبيرات الشائعة
    communication_patterns JSONB DEFAULT '{}'::jsonb, -- أنماط التواصل
    
    -- إحصائيات الاستخدام
    usage_count INTEGER DEFAULT 1,
    success_rate DECIMAL(5,4) DEFAULT 0.0,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول مقاييس الأداء الذكي
-- يتتبع أداء النظام ونجاحه مع الوقت
CREATE TABLE IF NOT EXISTS public.intent_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- مقاييس الأداء العامة
    total_interactions INTEGER DEFAULT 0,
    successful_classifications INTEGER DEFAULT 0,
    accuracy_rate DECIMAL(5,4) DEFAULT 0.0,
    average_confidence DECIMAL(5,4) DEFAULT 0.0,
    
    -- مقاييس الأداء حسب النية
    intent_breakdown JSONB DEFAULT '{}'::jsonb, -- تفصيل الأداء لكل نية
    business_type_performance JSONB DEFAULT '{}'::jsonb, -- الأداء حسب نوع العمل
    dialect_performance JSONB DEFAULT '{}'::jsonb, -- الأداء حسب اللهجة
    
    -- مقاييس التحسن
    learning_progress JSONB DEFAULT '{}'::jsonb, -- تقدم التعلم
    improvement_trends JSONB DEFAULT '{}'::jsonb, -- اتجاهات التحسن
    
    -- إحصائيات زمنية
    daily_stats JSONB DEFAULT '{}'::jsonb, -- إحصائيات يومية
    weekly_performance JSONB DEFAULT '{}'::jsonb, -- أداء أسبوعي
    monthly_trends JSONB DEFAULT '{}'::jsonb, -- اتجاهات شهرية
    
    -- معلومات أخيرة
    last_calculation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- إنشاء الفهارس لتحسين الأداء
-- ================================================================

-- فهارس جدول business_context_patterns
CREATE INDEX IF NOT EXISTS idx_business_context_instance 
ON public.business_context_patterns(whatsapp_instance_id);

CREATE INDEX IF NOT EXISTS idx_business_context_type 
ON public.business_context_patterns(business_type);

CREATE INDEX IF NOT EXISTS idx_business_context_success 
ON public.business_context_patterns(success_rate DESC);

-- فهارس جدول intent_learning_history
CREATE INDEX IF NOT EXISTS idx_learning_history_instance 
ON public.intent_learning_history(whatsapp_instance_id);

CREATE INDEX IF NOT EXISTS idx_learning_history_intent 
ON public.intent_learning_history(detected_intent);

CREATE INDEX IF NOT EXISTS idx_learning_history_success 
ON public.intent_learning_history(success) WHERE success = true;

CREATE INDEX IF NOT EXISTS idx_learning_history_date 
ON public.intent_learning_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_history_hash 
ON public.intent_learning_history(message_hash);

-- فهارس جدول dialect_adaptation_data
CREATE INDEX IF NOT EXISTS idx_dialect_adaptation_instance 
ON public.dialect_adaptation_data(whatsapp_instance_id);

CREATE INDEX IF NOT EXISTS idx_dialect_adaptation_dialect 
ON public.dialect_adaptation_data(primary_dialect);

CREATE INDEX IF NOT EXISTS idx_dialect_adaptation_region 
ON public.dialect_adaptation_data(region);

-- فهارس جدول intent_performance_metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_instance 
ON public.intent_performance_metrics(whatsapp_instance_id);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_accuracy 
ON public.intent_performance_metrics(accuracy_rate DESC);

-- ================================================================
-- إعداد Row Level Security (RLS)
-- ================================================================

-- تفعيل RLS لجميع الجداول
ALTER TABLE public.business_context_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intent_learning_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialect_adaptation_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intent_performance_metrics ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول - المستخدمون يمكنهم الوصول لبيانات instances الخاصة بهم فقط
CREATE POLICY "Users can access their own business context patterns" ON public.business_context_patterns
    FOR ALL USING (
        whatsapp_instance_id IN (
            SELECT id FROM public.whatsapp_instances 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can access their own learning history" ON public.intent_learning_history
    FOR ALL USING (
        whatsapp_instance_id IN (
            SELECT id FROM public.whatsapp_instances 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can access their own dialect data" ON public.dialect_adaptation_data
    FOR ALL USING (
        whatsapp_instance_id IN (
            SELECT id FROM public.whatsapp_instances 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can access their own performance metrics" ON public.intent_performance_metrics
    FOR ALL USING (
        whatsapp_instance_id IN (
            SELECT id FROM public.whatsapp_instances 
            WHERE user_id = auth.uid()
        )
    );

-- ================================================================
-- دوال التحديث التلقائي للتوقيت
-- ================================================================

-- دالة تحديث updated_at
CREATE OR REPLACE FUNCTION update_smart_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق دالة التحديث على الجداول المناسبة
CREATE TRIGGER update_business_context_patterns_updated_at
    BEFORE UPDATE ON public.business_context_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_tables_updated_at();

CREATE TRIGGER update_dialect_adaptation_updated_at
    BEFORE UPDATE ON public.dialect_adaptation_data
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_tables_updated_at();

CREATE TRIGGER update_performance_metrics_updated_at
    BEFORE UPDATE ON public.intent_performance_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_tables_updated_at();

-- ================================================================
-- إضافة تعليقات للجداول والأعمدة
-- ================================================================

COMMENT ON TABLE public.business_context_patterns IS 'أنماط السياق التجاري المتعلمة للنظام الذكي';
COMMENT ON COLUMN public.business_context_patterns.business_type IS 'نوع العمل المكتشف تلقائياً';
COMMENT ON COLUMN public.business_context_patterns.industry_keywords IS 'المصطلحات المهمة لهذا المجال';
COMMENT ON COLUMN public.business_context_patterns.learned_patterns IS 'الأنماط التي تعلمها النظام';

COMMENT ON TABLE public.intent_learning_history IS 'تاريخ التعلم من التفاعلات الناجحة';
COMMENT ON COLUMN public.intent_learning_history.business_context IS 'السياق التجاري المكتشف للرسالة';
COMMENT ON COLUMN public.intent_learning_history.dialect_analysis IS 'تحليل اللهجة والأسلوب اللغوي';

COMMENT ON TABLE public.dialect_adaptation_data IS 'بيانات التكيف مع اللهجات العربية المختلفة';
COMMENT ON COLUMN public.dialect_adaptation_data.cultural_markers IS 'العلامات الثقافية واللهجية المميزة';

COMMENT ON TABLE public.intent_performance_metrics IS 'مقاييس أداء النظام الذكي ونجاحه';