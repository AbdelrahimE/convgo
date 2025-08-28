-- Update escalation keywords to include Arabic support
UPDATE public.whatsapp_instances 
SET escalation_keywords = ARRAY[
  'human support', 'speak to someone', 'agent', 'representative', 
  'talk to person', 'customer service', 'help me', 'support team',
  -- Arabic escalation keywords
  'عاوز اكلم حد', 'عايز اتكلم مع حد', 'محتاج مساعدة', 'كلموني',
  'خدمة العملاء', 'مسؤول', 'موظف', 'شخص حقيقي', 'انسان',
  'اريد التحدث', 'محتاج اتكلم', 'ساعدوني', 'مطلوب مساعدة',
  'دعم فني', 'فريق الدعم', 'خط الدعم'
]
WHERE escalation_keywords = ARRAY[
  'human support', 'speak to someone', 'agent', 'representative', 
  'talk to person', 'customer service', 'help me', 'support team'
];

-- Update escalation_message to include Arabic version
UPDATE public.whatsapp_instances 
SET escalation_message = 'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly. Thank you for your patience.

تم تحويل محادثتك إلى فريق الدعم المختص. سيتواصل معك أحد ممثلينا قريباً. شكراً لصبرك.'
WHERE escalation_message = 'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly. Thank you for your patience.';

-- Update escalated_conversation_message to include Arabic version  
UPDATE public.whatsapp_instances
SET escalated_conversation_message = 'Your conversation is under review by our support team. We will contact you soon.

محادثتك قيد المراجعة من قبل فريق الدعم. سنتواصل معك قريباً.'
WHERE escalated_conversation_message = 'Your conversation is under review by our support team. We will contact you soon.';

-- Add indexes for better performance with Arabic text
CREATE INDEX IF NOT EXISTS idx_escalation_keywords_gin 
ON public.whatsapp_instances USING gin(escalation_keywords);

-- Create function to add more Arabic keywords if needed
CREATE OR REPLACE FUNCTION public.add_arabic_escalation_keywords(
  p_instance_id UUID,
  p_keywords TEXT[]
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.whatsapp_instances
  SET escalation_keywords = escalation_keywords || p_keywords
  WHERE id = p_instance_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission for the new function
GRANT EXECUTE ON FUNCTION public.add_arabic_escalation_keywords TO authenticated;

-- Insert a comment for migration tracking
COMMENT ON FUNCTION public.add_arabic_escalation_keywords IS 'Function to dynamically add Arabic escalation keywords to WhatsApp instances';