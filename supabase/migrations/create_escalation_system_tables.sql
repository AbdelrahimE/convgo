-- Create escalated_conversations table for tracking escalated chats
CREATE TABLE IF NOT EXISTS public.escalated_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_number TEXT NOT NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  escalated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT CHECK (reason IN ('user_request', 'ai_failure', 'sensitive_topic', 'low_confidence', 'repeated_question')),
  conversation_context JSONB DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_active_escalation UNIQUE (whatsapp_number, instance_id, resolved_at)
);

-- Create support_team_numbers table for managing support team WhatsApp numbers
CREATE TABLE IF NOT EXISTS public.support_team_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, whatsapp_number)
);

-- Add escalation configuration columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS escalation_threshold INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS escalation_message TEXT DEFAULT 'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly. Thank you for your patience.',
ADD COLUMN IF NOT EXISTS escalated_conversation_message TEXT DEFAULT 'Your conversation is under review by our support team. We will contact you soon.',
ADD COLUMN IF NOT EXISTS escalation_keywords TEXT[] DEFAULT ARRAY['human support', 'speak to someone', 'agent', 'representative', 'talk to person', 'customer service', 'help me', 'support team'];

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_escalated_conversations_instance ON public.escalated_conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_escalated_conversations_status ON public.escalated_conversations(resolved_at);
CREATE INDEX IF NOT EXISTS idx_escalated_conversations_number ON public.escalated_conversations(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_support_team_active ON public.support_team_numbers(user_id, is_active);

-- Create function to check if conversation is escalated
CREATE OR REPLACE FUNCTION public.is_conversation_escalated(
  p_phone_number TEXT,
  p_instance_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.escalated_conversations
    WHERE whatsapp_number = p_phone_number
    AND instance_id = p_instance_id
    AND resolved_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to escalate conversation
CREATE OR REPLACE FUNCTION public.escalate_conversation(
  p_phone_number TEXT,
  p_instance_id UUID,
  p_reason TEXT,
  p_context JSONB DEFAULT '[]'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_escalation_id UUID;
BEGIN
  -- Check if already escalated
  IF NOT is_conversation_escalated(p_phone_number, p_instance_id) THEN
    INSERT INTO public.escalated_conversations (
      whatsapp_number,
      instance_id,
      reason,
      conversation_context
    ) VALUES (
      p_phone_number,
      p_instance_id,
      p_reason,
      p_context
    ) RETURNING id INTO v_escalation_id;
    
    RETURN v_escalation_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to resolve escalation
CREATE OR REPLACE FUNCTION public.resolve_escalation(
  p_phone_number TEXT,
  p_instance_id UUID,
  p_resolved_by UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.escalated_conversations
  SET resolved_at = NOW(),
      resolved_by = p_resolved_by
  WHERE whatsapp_number = p_phone_number
    AND instance_id = p_instance_id
    AND resolved_at IS NULL;
    
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE public.escalated_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_team_numbers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for escalated_conversations
CREATE POLICY "Users can view their escalated conversations"
  ON public.escalated_conversations
  FOR SELECT
  TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their escalated conversations"
  ON public.escalated_conversations
  FOR ALL
  TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

-- Create RLS policies for support_team_numbers
CREATE POLICY "Users can view their support team numbers"
  ON public.support_team_numbers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their support team numbers"
  ON public.support_team_numbers
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Grant necessary permissions
GRANT ALL ON public.escalated_conversations TO authenticated;
GRANT ALL ON public.support_team_numbers TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_escalated TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.escalate_conversation TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_escalation TO authenticated;