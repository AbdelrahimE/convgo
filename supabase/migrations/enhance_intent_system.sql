-- Enhanced Intent Recognition System Improvements
-- This migration improves the personality selection logic and adds advanced features

-- First, create the enhanced personality selection function
CREATE OR REPLACE FUNCTION get_enhanced_personality_for_intent(
    p_whatsapp_instance_id UUID,
    p_intent_category VARCHAR(50),
    p_confidence DECIMAL(5,4) DEFAULT 0.6,
    p_language VARCHAR(10) DEFAULT 'en'
)
RETURNS TABLE(
    personality_id UUID,
    personality_name VARCHAR(100),
    system_prompt TEXT,
    temperature DECIMAL(3,2),
    model VARCHAR(50),
    process_voice_messages BOOLEAN,
    voice_message_default_response TEXT,
    default_voice_language VARCHAR(10),
    match_score DECIMAL(5,4)
) AS $$
DECLARE
    confidence_threshold DECIMAL(5,4);
    has_exact_match BOOLEAN;
BEGIN
    -- Set language-aware confidence thresholds
    confidence_threshold := CASE 
        WHEN p_language = 'ar' THEN 0.4
        WHEN p_language = 'mixed' THEN 0.45
        ELSE 0.6
    END;
    
    -- Check if we have any exact intent matches
    SELECT EXISTS(
        SELECT 1 FROM public.ai_personalities p
        WHERE p.whatsapp_instance_id = p_whatsapp_instance_id
        AND p.is_active = true
        AND p.intent_categories ? p_intent_category
    ) INTO has_exact_match;
    
    RETURN QUERY
    WITH personality_scores AS (
        SELECT 
            p.id,
            p.name,
            p.system_prompt,
            p.temperature,
            p.model,
            p.process_voice_messages,
            p.voice_message_default_response,
            p.default_voice_language,
            CASE 
                -- Exact intent match gets highest score
                WHEN p.intent_categories ? p_intent_category THEN 
                    1.0 + (p.priority::DECIMAL / 10.0)
                
                -- Default personality only if no exact matches exist AND confidence is low
                WHEN p.is_default = true AND NOT has_exact_match AND p_confidence < confidence_threshold THEN 
                    0.5 + (p.priority::DECIMAL / 20.0)
                
                -- If we have exact matches but they're all inactive, use default
                WHEN p.is_default = true AND has_exact_match AND p_confidence < confidence_threshold THEN
                    0.3 + (p.priority::DECIMAL / 20.0)
                
                ELSE 0.0
            END as match_score,
            p.created_at
        FROM public.ai_personalities p
        WHERE 
            p.whatsapp_instance_id = p_whatsapp_instance_id
            AND p.is_active = true
    )
    SELECT 
        ps.id,
        ps.name,
        ps.system_prompt,
        ps.temperature,
        ps.model,
        ps.process_voice_messages,
        ps.voice_message_default_response,
        ps.default_voice_language,
        ps.match_score
    FROM personality_scores ps
    WHERE ps.match_score > 0
    ORDER BY 
        ps.match_score DESC,
        ps.created_at DESC
    LIMIT 1;
END;
$$ language 'plpgsql';

-- Enhanced intent categories with better Arabic support
INSERT INTO public.intent_categories (
    user_id, category_key, display_name, description, keywords, example_phrases, 
    classification_prompt, is_system_category, confidence_threshold
) VALUES 
-- Enhanced Sales category with Arabic keywords
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'sales_enhanced',
    'Sales Inquiries (Enhanced)',
    'Enhanced sales inquiries with comprehensive Arabic and English keyword support',
    '[
        "price", "cost", "buy", "purchase", "order", "product", "service", "package", "plan", "subscription", "discount", "offer",
        "سعر", "أسعار", "تكلفة", "شراء", "اشتري", "طلب", "منتج", "منتجات", "خدمة", "خدمات", "باقة", "باقات", 
        "اشتراك", "اشتراكات", "عرض", "عروض", "خصم", "تخفيض", "خطة", "خطط", "أريد", "عايز", "بدي", "ابي", "محتاج",
        "بكام", "بكم", "كلفة", "اقتناء", "الشراء", "المنتج", "الخدمة", "الباقة", "الاشتراك", "العرض"
    ]'::jsonb,
    '[
        "How much does this cost?", "I want to buy...", "What are your prices?", "Can I order...?", "Tell me about your products",
        "كم سعر هذا؟", "أريد أن أشتري...", "ما هي أسعاركم؟", "هل يمكنني طلب...؟", "أخبرني عن منتجاتكم",
        "ازيك يريس عندي استفسار بسيط عن اشتراكات المنصة", "بكام الباقة دي؟", "عايز اعرف الأسعار"
    ]'::jsonb,
    'This message appears to be a sales inquiry. Look for keywords related to pricing, purchasing, products, subscriptions, or commercial interest. Pay special attention to Arabic expressions like "اشتراك", "سعر", "شراء", "أريد", "عايز", "بكام".',
    true,
    0.4
),

-- Enhanced Customer Support with Arabic
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'support_enhanced',
    'Customer Support (Enhanced)',
    'Enhanced customer support with comprehensive Arabic and English support',
    '[
        "help", "support", "problem", "issue", "complaint", "assistance", "trouble", "broken", "not working", "error",
        "مساعدة", "ساعدني", "ساعدوني", "مساعد", "دعم", "مشكلة", "مشاكل", "شكوى", "شكاوى", "استفسار", "استفسارات",
        "عطل", "عطال", "مشكل", "يشتغل", "ما يشتغل", "مش شغال", "لا يعمل", "معطل", "تعطل", "مكسور"
    ]'::jsonb,
    '[
        "I need help with...", "I have a problem with...", "Can you assist me?", "Something is not working", "I want to complain about...",
        "محتاج مساعدة في...", "عندي مشكلة في...", "ممكن تساعدني؟", "فيه حاجة مش شغالة", "عايز اشتكي من..."
    ]'::jsonb,
    'This message appears to be a customer support request. Look for keywords indicating problems, requests for help, complaints, or general assistance needs in both Arabic and English.',
    true,
    0.4
),

-- Enhanced Technical Support
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'technical_enhanced',
    'Technical Support (Enhanced)',
    'Enhanced technical support with Arabic and English technical terms',
    '[
        "technical", "software", "app", "website", "login", "password", "installation", "setup", "configuration", "bug", "crash", "freeze",
        "تقني", "تقنية", "فني", "برنامج", "برامج", "تطبيق", "موقع", "دخول", "تسجيل الدخول", "كلمة المرور", "الباسورد",
        "تثبيت", "تنصيب", "إعداد", "تحديث", "ابديت", "انستال", "لوجن", "لوج ان", "سوفتوير", "ويب سايت"
    ]'::jsonb,
    '[
        "The app is crashing", "I cannot log in", "How do I install...?", "The website is not loading", "I am having technical issues",
        "التطبيق بيقفل", "مش قادر ادخل", "إزاي أنصب...؟", "الموقع مش بيفتح", "عندي مشاكل تقنية"
    ]'::jsonb,
    'This message appears to be a technical support request. Look for keywords related to software, technical problems, installations, login issues, or system problems.',
    true,
    0.5
);

-- Add enhanced caching with metadata support
ALTER TABLE public.intent_recognition_cache ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add performance tracking table
CREATE TABLE IF NOT EXISTS public.intent_recognition_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- Performance metrics
    total_classifications INTEGER DEFAULT 0,
    successful_classifications INTEGER DEFAULT 0,
    failed_classifications INTEGER DEFAULT 0,
    average_confidence DECIMAL(5,4) DEFAULT 0.0,
    average_processing_time_ms INTEGER DEFAULT 0,
    
    -- Language-specific metrics
    arabic_classifications INTEGER DEFAULT 0,
    english_classifications INTEGER DEFAULT 0,
    mixed_classifications INTEGER DEFAULT 0,
    
    -- Intent-specific success rates
    intent_performance JSONB DEFAULT '{}'::jsonb,
    
    -- Temporal data
    date_period DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_intent_performance_instance_date 
ON public.intent_recognition_performance(whatsapp_instance_id, date_period);

CREATE INDEX IF NOT EXISTS idx_intent_performance_user_date 
ON public.intent_recognition_performance(user_id, date_period);

-- Function to update performance metrics
CREATE OR REPLACE FUNCTION update_intent_performance(
    p_user_id UUID,
    p_whatsapp_instance_id UUID,
    p_intent VARCHAR(50),
    p_confidence DECIMAL(5,4),
    p_processing_time_ms INTEGER,
    p_language VARCHAR(10),
    p_success BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
DECLARE
    current_date DATE := CURRENT_DATE;
BEGIN
    INSERT INTO public.intent_recognition_performance (
        user_id,
        whatsapp_instance_id,
        date_period,
        total_classifications,
        successful_classifications,
        failed_classifications,
        average_confidence,
        average_processing_time_ms,
        arabic_classifications,
        english_classifications,
        mixed_classifications,
        intent_performance
    ) VALUES (
        p_user_id,
        p_whatsapp_instance_id,
        current_date,
        1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        CASE WHEN p_success THEN p_confidence ELSE 0 END,
        p_processing_time_ms,
        CASE WHEN p_language = 'ar' THEN 1 ELSE 0 END,
        CASE WHEN p_language = 'en' THEN 1 ELSE 0 END,
        CASE WHEN p_language = 'mixed' THEN 1 ELSE 0 END,
        jsonb_build_object(p_intent, jsonb_build_object(
            'count', 1,
            'success_rate', CASE WHEN p_success THEN 1.0 ELSE 0.0 END,
            'avg_confidence', CASE WHEN p_success THEN p_confidence ELSE 0 END
        ))
    )
    ON CONFLICT (user_id, whatsapp_instance_id, date_period)
    DO UPDATE SET
        total_classifications = public.intent_recognition_performance.total_classifications + 1,
        successful_classifications = public.intent_recognition_performance.successful_classifications + 
            CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_classifications = public.intent_recognition_performance.failed_classifications + 
            CASE WHEN p_success THEN 0 ELSE 1 END,
        average_confidence = (
            public.intent_recognition_performance.average_confidence * 
            public.intent_recognition_performance.successful_classifications + 
            CASE WHEN p_success THEN p_confidence ELSE 0 END
        ) / NULLIF(public.intent_recognition_performance.successful_classifications + 
            CASE WHEN p_success THEN 1 ELSE 0 END, 0),
        average_processing_time_ms = (
            public.intent_recognition_performance.average_processing_time_ms * 
            public.intent_recognition_performance.total_classifications + p_processing_time_ms
        ) / (public.intent_recognition_performance.total_classifications + 1),
        arabic_classifications = public.intent_recognition_performance.arabic_classifications + 
            CASE WHEN p_language = 'ar' THEN 1 ELSE 0 END,
        english_classifications = public.intent_recognition_performance.english_classifications + 
            CASE WHEN p_language = 'en' THEN 1 ELSE 0 END,
        mixed_classifications = public.intent_recognition_performance.mixed_classifications + 
            CASE WHEN p_language = 'mixed' THEN 1 ELSE 0 END,
        intent_performance = public.intent_recognition_performance.intent_performance || 
            jsonb_build_object(p_intent, 
                COALESCE(public.intent_recognition_performance.intent_performance->p_intent, '{}'::jsonb) || 
                jsonb_build_object(
                    'count', COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'count')::INTEGER, 0) + 1,
                    'success_rate', (
                        COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'count')::INTEGER, 0) * 
                        COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'success_rate')::DECIMAL, 0) + 
                        CASE WHEN p_success THEN 1.0 ELSE 0.0 END
                    ) / (COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'count')::INTEGER, 0) + 1),
                    'avg_confidence', (
                        COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'count')::INTEGER, 0) * 
                        COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'avg_confidence')::DECIMAL, 0) + 
                        CASE WHEN p_success THEN p_confidence ELSE 0 END
                    ) / NULLIF(COALESCE((public.intent_recognition_performance.intent_performance->p_intent->>'count')::INTEGER, 0) + 
                        CASE WHEN p_success THEN 1 ELSE 0 END, 0)
                )
            ),
        updated_at = CURRENT_TIMESTAMP;
END;
$$ language 'plpgsql';

-- Add unique constraint for performance tracking
ALTER TABLE public.intent_recognition_performance 
ADD CONSTRAINT unique_performance_per_instance_date 
UNIQUE (user_id, whatsapp_instance_id, date_period);

-- Add RLS policies for performance table
ALTER TABLE public.intent_recognition_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own performance data" ON public.intent_recognition_performance
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert performance data" ON public.intent_recognition_performance
    FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update performance data" ON public.intent_recognition_performance
    FOR UPDATE USING (true);

-- Enhanced increment cache hit function with metadata
CREATE OR REPLACE FUNCTION increment_intent_cache_hit(cache_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.intent_recognition_cache 
    SET 
        hit_count = hit_count + 1,
        last_hit_at = CURRENT_TIMESTAMP,
        metadata = metadata || jsonb_build_object('total_hits', COALESCE((metadata->>'total_hits')::INTEGER, 0) + 1)
    WHERE id = cache_id;
END;
$$ language 'plpgsql';

-- Comments
COMMENT ON FUNCTION get_enhanced_personality_for_intent(UUID, VARCHAR, DECIMAL, VARCHAR) 
IS 'Enhanced personality selection with language awareness and improved intent matching logic';

COMMENT ON FUNCTION update_intent_performance(UUID, UUID, VARCHAR, DECIMAL, INTEGER, VARCHAR, BOOLEAN) 
IS 'Updates daily performance metrics for intent recognition system';

COMMENT ON TABLE public.intent_recognition_performance 
IS 'Tracks daily performance metrics for intent recognition system including language-specific and intent-specific success rates';