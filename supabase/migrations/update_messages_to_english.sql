-- Smart Escalation System Redesign - Phase 1.2
-- Update all Arabic messages to English for global accessibility

-- Step 1: Update smart_escalation_config default messages to English
UPDATE smart_escalation_config 
SET 
  ai_attempt_message = 'Let me try to help you with this...',
  escalation_warning_message = 'If this doesn''t help, I''ll connect you with one of our specialists.',
  updated_at = NOW()
WHERE 
  ai_attempt_message LIKE '%دعني%' OR 
  ai_attempt_message LIKE '%أحاول%' OR
  escalation_warning_message LIKE '%لم تجد%' OR
  escalation_warning_message LIKE '%زملائي%';

-- Step 2: Update the table schema defaults to English
-- (This affects new records, existing records updated above)
ALTER TABLE smart_escalation_config 
ALTER COLUMN ai_attempt_message SET DEFAULT 'Let me try to help you with this...';

ALTER TABLE smart_escalation_config 
ALTER COLUMN escalation_warning_message SET DEFAULT 'If this doesn''t help, I''ll connect you with one of our specialists.';

-- Step 3: Update whatsapp_support_config default messages
UPDATE whatsapp_support_config 
SET 
  notification_message = 'A customer needs support. Please check your WhatsApp Support dashboard.',
  escalation_message = 'Thank you for your message. A support representative will get back to you as soon as possible.',
  updated_at = NOW()
WHERE 
  -- Update any messages that might be in Arabic or old English versions
  (notification_message != 'A customer needs support. Please check your WhatsApp Support dashboard.' OR
   escalation_message != 'Thank you for your message. A support representative will get back to you as soon as possible.');

-- Step 4: Update table schema defaults for support config
ALTER TABLE whatsapp_support_config 
ALTER COLUMN notification_message SET DEFAULT 'A customer needs support. Please check your WhatsApp Support dashboard.';

ALTER TABLE whatsapp_support_config 
ALTER COLUMN escalation_message SET DEFAULT 'Thank you for your message. A support representative will get back to you as soon as possible.';

-- Step 6: Create a function to auto-translate messages based on customer language
-- This ensures customers still get responses in their preferred language
CREATE OR REPLACE FUNCTION get_escalation_message_by_language(
  base_message TEXT,
  customer_language TEXT DEFAULT 'en'
) RETURNS TEXT AS $$
BEGIN
  -- If customer is using Arabic, provide Arabic response
  IF customer_language = 'ar' THEN
    CASE base_message
      WHEN 'Let me try to help you with this...' THEN
        RETURN 'دعني أحاول مساعدتك في هذا الأمر...';
      WHEN 'If this doesn''t help, I''ll connect you with one of our specialists.' THEN
        RETURN 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين';
      WHEN 'Thank you for your message. A support representative will get back to you as soon as possible.' THEN
        RETURN 'شكراً لك على رسالتك. سيتواصل معك أحد ممثلي الدعم في أقرب وقت ممكن.';
      WHEN 'A customer needs support. Please check your WhatsApp Support dashboard.' THEN
        RETURN 'عميل يحتاج للدعم. يرجى مراجعة لوحة دعم الواتساب.';
      ELSE
        RETURN base_message;
    END CASE;
  ELSE
    -- Default to English
    RETURN base_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Add comments explaining the language system
COMMENT ON FUNCTION get_escalation_message_by_language IS 'Returns escalation messages in appropriate language based on customer preference. Defaults to English for global accessibility.';