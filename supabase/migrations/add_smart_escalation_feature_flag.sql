-- Add feature flag for smart escalation system
-- This allows global enable/disable of the smart escalation feature

-- Add a global feature flag column to user profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS enable_smart_escalation_global BOOLEAN DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN profiles.enable_smart_escalation_global IS 'Global feature flag to enable/disable smart escalation for all user instances';

-- Create a function to check if smart escalation is enabled for a user
CREATE OR REPLACE FUNCTION is_smart_escalation_enabled(user_id UUID, instance_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    global_enabled BOOLEAN;
    instance_enabled BOOLEAN;
BEGIN
    -- Check global flag for user
    SELECT enable_smart_escalation_global INTO global_enabled
    FROM profiles 
    WHERE id = user_id;
    
    -- If global flag is false, return false
    IF NOT COALESCE(global_enabled, false) THEN
        RETURN false;
    END IF;
    
    -- Check instance-specific flag
    SELECT enable_smart_escalation INTO instance_enabled
    FROM smart_escalation_config 
    WHERE whatsapp_instance_id = instance_id AND user_id = user_id;
    
    -- Return instance-specific setting, default to true if not configured
    RETURN COALESCE(instance_enabled, true);
END;
$$;

-- Create a function to get smart escalation configuration with feature flag check
CREATE OR REPLACE FUNCTION get_smart_escalation_config_safe(instance_id UUID, user_id UUID)
RETURNS TABLE (
    id UUID,
    enable_smart_escalation BOOLEAN,
    escalation_sensitivity NUMERIC,
    emotion_threshold NUMERIC,
    urgency_threshold NUMERIC,
    rag_confidence_threshold NUMERIC,
    max_ai_attempts INTEGER,
    escalation_delay_minutes INTEGER,
    ai_attempt_message TEXT,
    escalation_warning_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if smart escalation is enabled
    IF NOT is_smart_escalation_enabled(user_id, instance_id) THEN
        -- Return a row with smart escalation disabled
        RETURN QUERY SELECT 
            NULL::UUID as id,
            false as enable_smart_escalation,
            0.7::NUMERIC as escalation_sensitivity,
            0.8::NUMERIC as emotion_threshold,
            0.7::NUMERIC as urgency_threshold,
            0.6::NUMERIC as rag_confidence_threshold,
            2 as max_ai_attempts,
            5 as escalation_delay_minutes,
            'دعني أحاول مساعدتك في هذا الأمر...'::TEXT as ai_attempt_message,
            'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين'::TEXT as escalation_warning_message;
        RETURN;
    END IF;

    -- Return actual configuration
    RETURN QUERY 
    SELECT 
        sec.id,
        sec.enable_smart_escalation,
        sec.escalation_sensitivity,
        sec.emotion_threshold,
        sec.urgency_threshold,
        sec.rag_confidence_threshold,
        sec.max_ai_attempts,
        sec.escalation_delay_minutes,
        sec.ai_attempt_message,
        sec.escalation_warning_message
    FROM smart_escalation_config sec
    WHERE sec.whatsapp_instance_id = instance_id AND sec.user_id = user_id;
END;
$$;

-- Create an audit table for escalation decisions
CREATE TABLE IF NOT EXISTS smart_escalation_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    whatsapp_instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    user_phone TEXT NOT NULL,
    message_content TEXT NOT NULL,
    decision_type VARCHAR(50) NOT NULL, -- 'smart_analysis', 'keyword_based', 'fallback'
    escalation_decision VARCHAR(50) NOT NULL, -- 'escalated', 'not_escalated', 'ai_attempt'
    confidence_score NUMERIC(3,2),
    intent_analysis JSONB,
    emotion_analysis JSONB,
    rag_available BOOLEAN DEFAULT false,
    reasoning TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit table
CREATE INDEX IF NOT EXISTS idx_smart_escalation_audit_instance_id 
ON smart_escalation_audit(whatsapp_instance_id);

CREATE INDEX IF NOT EXISTS idx_smart_escalation_audit_decision_type 
ON smart_escalation_audit(decision_type);

CREATE INDEX IF NOT EXISTS idx_smart_escalation_audit_created_at 
ON smart_escalation_audit(created_at);

-- Add RLS policies for audit table
ALTER TABLE smart_escalation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view smart escalation audit for their instances"
ON smart_escalation_audit
FOR SELECT
USING (
    whatsapp_instance_id IN (
        SELECT id FROM whatsapp_instances 
        WHERE user_id = auth.uid()
    )
);

-- Grant permissions
GRANT SELECT ON smart_escalation_audit TO authenticated;
GRANT EXECUTE ON FUNCTION is_smart_escalation_enabled(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_smart_escalation_config_safe(UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON TABLE smart_escalation_audit IS 'Audit table for smart escalation decisions and analysis';
COMMENT ON FUNCTION is_smart_escalation_enabled IS 'Checks if smart escalation is enabled for a specific user and instance';
COMMENT ON FUNCTION get_smart_escalation_config_safe IS 'Gets smart escalation configuration with feature flag validation';