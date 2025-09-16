-- Create AI Personalities table for multi-personality system
-- This table stores different AI personalities that can be configured per WhatsApp instance

-- Create the ai_personalities table
CREATE TABLE public.ai_personalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Core personality configuration
    name VARCHAR(100) NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    
    -- AI settings specific to this personality
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    model VARCHAR(50) DEFAULT 'gpt-4.1-mini',
    
    -- Intent categories this personality handles (JSON array)
    intent_categories JSONB DEFAULT '[]'::jsonb,
    
    -- Personality behavior settings
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false, -- One personality per instance can be default
    priority INTEGER DEFAULT 1, -- Higher priority personalities are preferred for overlapping intents
    
    -- Voice processing settings specific to this personality
    process_voice_messages BOOLEAN DEFAULT true,
    voice_message_default_response TEXT,
    default_voice_language VARCHAR(10) DEFAULT 'en',
    
    -- Metadata and analytics
    usage_count INTEGER DEFAULT 0, -- Track how often this personality is usede
    
    -- Template and customization
    is_template BOOLEAN DEFAULT false, -- System-provided templates
    template_category VARCHAR(50), -- e.g., 'customer-support', 'sales', 'technical'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_ai_personalities_instance ON public.ai_personalities(whatsapp_instance_id);
CREATE INDEX idx_ai_personalities_user ON public.ai_personalities(user_id);
CREATE INDEX idx_ai_personalities_active ON public.ai_personalities(is_active) WHERE is_active = true;
CREATE INDEX idx_ai_personalities_default ON public.ai_personalities(whatsapp_instance_id, is_default) WHERE is_default = true;
CREATE INDEX idx_ai_personalities_template ON public.ai_personalities(is_template, template_category) WHERE is_template = true;
CREATE INDEX idx_ai_personalities_intent_categories ON public.ai_personalities USING GIN(intent_categories);

-- Ensure only one default personality per instance
CREATE UNIQUE INDEX idx_ai_personalities_single_default 
ON public.ai_personalities(whatsapp_instance_id) 
WHERE is_default = true;

-- Add RLS (Row Level Security) policies
ALTER TABLE public.ai_personalities ENABLE ROW LEVEL SECURITY;

-- Users can only access their own personalities
CREATE POLICY "Users can view their own personalities" ON public.ai_personalities
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own personalities" ON public.ai_personalities
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own personalities" ON public.ai_personalities
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own personalities" ON public.ai_personalities
    FOR DELETE USING (user_id = auth.uid());

-- Allow access to system templates
CREATE POLICY "Users can view system templates" ON public.ai_personalities
    FOR SELECT USING (is_template = true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_personalities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_personalities_updated_at
    BEFORE UPDATE ON public.ai_personalities
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_personalities_updated_at();

-- Add helpful comments
COMMENT ON TABLE public.ai_personalities IS 'Stores multiple AI personalities per WhatsApp instance for intelligent response switching';
COMMENT ON COLUMN public.ai_personalities.intent_categories IS 'JSON array of intent categories this personality handles, e.g., ["customer-support", "billing", "technical"]';
COMMENT ON COLUMN public.ai_personalities.priority IS 'Higher priority personalities are preferred when multiple personalities handle the same intent';