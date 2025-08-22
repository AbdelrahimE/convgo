-- Final English Conversion for Simple Escalation System
-- Ensures all default messages and system text is in English

-- Step 1: Update any remaining Arabic default messages in simple_escalation_config
UPDATE simple_escalation_config 
SET 
  ai_attempt_message = 'Let me try to help you with this...',
  escalation_warning_message = 'If this doesn''t help, I''ll connect you with one of our specialists.',
  updated_at = NOW()
WHERE 
  ai_attempt_message LIKE '%دعني%' OR 
  ai_attempt_message LIKE '%أحاول%' OR
  escalation_warning_message LIKE '%لم تجد%' OR
  escalation_warning_message LIKE '%زملائي%' OR
  escalation_warning_message LIKE '%المتخصصين%';

-- Step 2: Update webhook debug logs with English messages
UPDATE webhook_debug_logs 
SET 
  message = CASE
    WHEN message LIKE '%تم إنشاء%' THEN 'Simple escalation system created successfully'
    WHEN message LIKE '%تم تحديث%' THEN 'Escalation configuration updated'
    WHEN message LIKE '%تم التصعيد%' THEN 'Escalation completed successfully'
    WHEN message LIKE '%خطأ في%' THEN 'Error in escalation processing'
    WHEN message LIKE '%فشل%' THEN 'Operation failed'
    ELSE message
  END
WHERE 
  category IN ('simple_escalation', 'escalation_error', 'system_update') AND
  (message LIKE '%تم%' OR message LIKE '%فشل%' OR message LIKE '%خطأ%');

-- Step 3: Create English language preference function
CREATE OR REPLACE FUNCTION get_user_language_preference(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_lang TEXT;
BEGIN
  -- Check if user has a language preference (could be added to profiles table later)
  -- For now, default to English for global accessibility
  SELECT 'en' INTO user_lang;
  
  -- Future enhancement: Check user's locale from profiles
  -- SELECT COALESCE(preferred_language, 'en') INTO user_lang
  -- FROM profiles WHERE id = user_id;
  
  RETURN COALESCE(user_lang, 'en');
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update the language function to be more robust
CREATE OR REPLACE FUNCTION get_escalation_message_by_language(
  base_message TEXT,
  customer_language TEXT DEFAULT NULL,
  user_id UUID DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  detected_lang TEXT;
  user_pref_lang TEXT;
BEGIN
  -- Determine the appropriate language
  IF customer_language IS NOT NULL THEN
    detected_lang := customer_language;
  ELSIF user_id IS NOT NULL THEN
    detected_lang := get_user_language_preference(user_id);
  ELSE
    detected_lang := 'en'; -- Default to English
  END IF;
  
  -- Return Arabic translations for Arabic-speaking customers
  IF detected_lang = 'ar' THEN
    CASE base_message
      WHEN 'Let me try to help you with this...' THEN
        RETURN 'دعني أحاول مساعدتك في هذا الأمر...';
      WHEN 'If this doesn''t help, I''ll connect you with one of our specialists.' THEN
        RETURN 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين';
      WHEN 'Thank you for your message. A support representative will get back to you as soon as possible.' THEN
        RETURN 'شكراً لك على رسالتك. سيتواصل معك أحد ممثلي الدعم في أقرب وقت ممكن.';
      WHEN 'A customer needs support. Please check your WhatsApp Support dashboard.' THEN
        RETURN 'عميل يحتاج للدعم. يرجى مراجعة لوحة دعم الواتساب.';
      WHEN 'Customer Support Needed' THEN
        RETURN 'عميل يحتاج للدعم';
      WHEN 'Max AI attempts reached' THEN
        RETURN 'تم الوصول للحد الأقصى من المحاولات';
      WHEN 'Customer frustration detected' THEN
        RETURN 'تم اكتشاف إحباط العميل';
      WHEN 'Human agent requested' THEN
        RETURN 'طلب وكيل بشري';
      WHEN 'AI unable to help' THEN
        RETURN 'الذكاء الاصطناعي غير قادر على المساعدة';
      ELSE
        RETURN base_message; -- Return original if no translation
    END CASE;
  ELSE
    -- Default to English for all other languages
    RETURN base_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a function to detect customer language from message
CREATE OR REPLACE FUNCTION detect_customer_language(message_text TEXT)
RETURNS TEXT AS $$
DECLARE
  arabic_chars INTEGER;
  total_chars INTEGER;
  arabic_ratio NUMERIC;
BEGIN
  -- Count Arabic characters (Unicode range U+0600 to U+06FF)
  arabic_chars := length(regexp_replace(message_text, '[^\u0600-\u06FF]', '', 'g'));
  total_chars := length(regexp_replace(message_text, '[^A-Za-z\u0600-\u06FF]', '', 'g'));
  
  -- Avoid division by zero
  IF total_chars = 0 THEN
    RETURN 'en'; -- Default to English for empty/non-text messages
  END IF;
  
  arabic_ratio := arabic_chars::NUMERIC / total_chars::NUMERIC;
  
  -- If more than 30% Arabic characters, consider it Arabic
  IF arabic_ratio > 0.3 THEN
    RETURN 'ar';
  ELSE
    RETURN 'en';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Update simple_escalation_config table comments to English
COMMENT ON TABLE simple_escalation_config IS 'Simplified escalation configuration with user-friendly settings and AI-managed intelligence';
COMMENT ON COLUMN simple_escalation_config.max_ai_attempts IS 'Number of AI attempts before escalation (1-3) - User-configurable setting';
COMMENT ON COLUMN simple_escalation_config.escalation_triggers IS 'Escalation trigger conditions - User-configurable setting';
COMMENT ON COLUMN simple_escalation_config.ai_attempt_message IS 'Message sent to customer when AI attempts to solve their issue';
COMMENT ON COLUMN simple_escalation_config.escalation_warning_message IS 'Message sent to customer when escalating to human support';

-- Step 7: Create a view for English system status
CREATE OR REPLACE VIEW system_language_status AS
SELECT 
  'Simple Escalation System Language Status' as component,
  COUNT(*) as total_configs,
  COUNT(*) FILTER (WHERE ai_attempt_message = 'Let me try to help you with this...') as english_ai_messages,
  COUNT(*) FILTER (WHERE escalation_warning_message = 'If this doesn''t help, I''ll connect you with one of our specialists.') as english_escalation_messages,
  CASE 
    WHEN COUNT(*) = COUNT(*) FILTER (WHERE ai_attempt_message = 'Let me try to help you with this...' AND escalation_warning_message = 'If this doesn''t help, I''ll connect you with one of our specialists.') 
    THEN 'Fully English' 
    ELSE 'Mixed Languages' 
  END as language_status
FROM simple_escalation_config

UNION ALL

SELECT 
  'Support Configuration Status' as component,
  COUNT(*) as total_configs,
  COUNT(*) FILTER (WHERE notification_message = 'A customer needs support. Please check your WhatsApp Support dashboard.') as english_notifications,
  COUNT(*) FILTER (WHERE escalation_message = 'Thank you for your message. A support representative will get back to you as soon as possible.') as english_escalations,
  CASE 
    WHEN COUNT(*) = COUNT(*) FILTER (WHERE notification_message = 'A customer needs support. Please check your WhatsApp Support dashboard.' AND escalation_message = 'Thank you for your message. A support representative will get back to you as soon as possible.') 
    THEN 'Fully English' 
    ELSE 'Mixed Languages' 
  END as language_status
FROM whatsapp_support_config;

-- Step 8: Grant permissions for new functions and views
GRANT EXECUTE ON FUNCTION get_user_language_preference(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_escalation_message_by_language(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_customer_language(TEXT) TO authenticated;
GRANT SELECT ON system_language_status TO authenticated;

-- Step 9: Create English constants table for easy maintenance
CREATE TABLE IF NOT EXISTS system_messages_en (
  id SERIAL PRIMARY KEY,
  message_key VARCHAR(100) UNIQUE NOT NULL,
  english_text TEXT NOT NULL,
  arabic_text TEXT,
  context VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard system messages
INSERT INTO system_messages_en (message_key, english_text, arabic_text, context) VALUES
('ai_attempt_message', 'Let me try to help you with this...', 'دعني أحاول مساعدتك في هذا الأمر...', 'Message when AI attempts to solve customer issue'),
('escalation_warning', 'If this doesn''t help, I''ll connect you with one of our specialists.', 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين', 'Warning before escalation'),
('customer_escalation', 'Thank you for your message. A support representative will get back to you as soon as possible.', 'شكراً لك على رسالتك. سيتواصل معك أحد ممثلي الدعم في أقرب وقت ممكن.', 'Message to customer when escalated'),
('support_notification', 'A customer needs support. Please check your WhatsApp Support dashboard.', 'عميل يحتاج للدعم. يرجى مراجعة لوحة دعم الواتساب.', 'Notification to support team'),
('escalation_reason_max_attempts', 'Max AI attempts reached', 'تم الوصول للحد الأقصى من المحاولات', 'Escalation reason label'),
('escalation_reason_frustrated', 'Customer frustration detected', 'تم اكتشاف إحباط العميل', 'Escalation reason label'),
('escalation_reason_human_request', 'Human agent requested', 'طلب وكيل بشري', 'Escalation reason label'),
('escalation_reason_confusion', 'AI unable to help', 'الذكاء الاصطناعي غير قادر على المساعدة', 'Escalation reason label')
ON CONFLICT (message_key) DO UPDATE SET
  english_text = EXCLUDED.english_text,
  arabic_text = EXCLUDED.arabic_text,
  updated_at = NOW();

-- Create trigger for updated_at
CREATE OR REPLACE TRIGGER handle_system_messages_en_updated_at
  BEFORE UPDATE ON system_messages_en
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Step 10: Log the completion of English conversion
INSERT INTO webhook_debug_logs (category, message, data) VALUES (
  'system_update',
  'English conversion completed for simple escalation system',
  json_build_object(
    'action', 'finalize_english_conversion',
    'timestamp', NOW(),
    'updated_configs', (
      SELECT COUNT(*) FROM simple_escalation_config 
      WHERE ai_attempt_message = 'Let me try to help you with this...'
    ),
    'language_functions_created', true,
    'message_constants_table_created', true,
    'multilingual_support_enabled', true,
    'status', 'success'
  )
);