-- Critical Security Fix: Add missing RLS policies to core tables
-- This migration fixes the security vulnerabilities in the core system

-- Enable RLS on critical tables that were missing it
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_config ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES FOR: whatsapp_instances
-- =====================================================================

CREATE POLICY "Users can view their own WhatsApp instances" ON whatsapp_instances
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own WhatsApp instances" ON whatsapp_instances
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WhatsApp instances" ON whatsapp_instances
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WhatsApp instances" ON whatsapp_instances
    FOR DELETE USING (auth.uid() = user_id);

-- Service role needs full access for webhook operations
CREATE POLICY "Service role can manage all WhatsApp instances" ON whatsapp_instances
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================================
-- RLS POLICIES FOR: whatsapp_ai_config  
-- =====================================================================

CREATE POLICY "Users can view their own AI configurations" ON whatsapp_ai_config
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI configurations" ON whatsapp_ai_config
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI configurations" ON whatsapp_ai_config
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id AND
        -- Ensure user cannot link to config_id they don't own
        (data_collection_config_id IS NULL OR 
         data_collection_config_id IN (
             SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
         ))
    );

CREATE POLICY "Users can delete their own AI configurations" ON whatsapp_ai_config
    FOR DELETE USING (auth.uid() = user_id);

-- Service role needs full access for AI operations
CREATE POLICY "Service role can manage all AI configurations" ON whatsapp_ai_config
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================================
-- ENHANCED RLS POLICIES FOR: data_collection_fields
-- =====================================================================

-- Replace the existing overly permissive policy
DROP POLICY IF EXISTS "Users can manage their own field configurations" ON data_collection_fields;

-- Add separate policies for better security
CREATE POLICY "Users can insert their own field configurations" ON data_collection_fields
    FOR INSERT WITH CHECK (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own field configurations" ON data_collection_fields
    FOR UPDATE USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own field configurations" ON data_collection_fields
    FOR DELETE USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

-- =====================================================================
-- ENHANCED RLS POLICIES FOR: collected_data_sessions
-- =====================================================================

-- Add user delete policy for their own sessions
CREATE POLICY "Users can delete their own data sessions" ON collected_data_sessions
    FOR DELETE USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

-- =====================================================================
-- ADDITIONAL SECURITY: Update google_sheets_config policies
-- =====================================================================

-- Update the UPDATE policy to prevent malicious config_id linking
DROP POLICY IF EXISTS "Users can update their own Google Sheets configs" ON google_sheets_config;

CREATE POLICY "Users can update their own Google Sheets configs" ON google_sheets_config
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- SECURITY FOR: View and other objects
-- =====================================================================

-- The view data_collection_overview inherits RLS from underlying tables
-- No additional RLS needed since it joins with RLS-protected tables

-- =====================================================================
-- VERIFY SECURITY SETUP
-- =====================================================================

-- Add comments to document security measures
COMMENT ON TABLE whatsapp_instances IS 'WhatsApp instances - RLS enabled, users can only access their own instances';
COMMENT ON TABLE whatsapp_ai_config IS 'AI configurations - RLS enabled, users can only access their own configs, data_collection_config_id is validated';
COMMENT ON TABLE data_collection_fields IS 'Custom fields - RLS enabled via config ownership chain';
COMMENT ON TABLE collected_data_sessions IS 'Data collection sessions - RLS enabled via config ownership chain, users can delete their own sessions';
COMMENT ON TABLE sheets_export_logs IS 'Export logs - RLS enabled via config ownership chain';

-- Create function to verify user can access a config (useful for debugging)
CREATE OR REPLACE FUNCTION user_can_access_config(config_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM google_sheets_config 
        WHERE id = config_uuid AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION user_can_access_config(UUID) TO authenticated;

-- Create function to verify user can access a WhatsApp instance (useful for debugging)
CREATE OR REPLACE FUNCTION user_can_access_instance(instance_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM whatsapp_instances 
        WHERE id = instance_uuid AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users  
GRANT EXECUTE ON FUNCTION user_can_access_instance(UUID) TO authenticated;

-- =====================================================================
-- TESTING QUERIES (commented out - uncomment for testing)
-- =====================================================================

/*
-- Test if RLS is working correctly:

-- 1. Test whatsapp_instances isolation
-- This should only return instances for the current user
SELECT COUNT(*) FROM whatsapp_instances;

-- 2. Test whatsapp_ai_config isolation  
-- This should only return configs for the current user
SELECT COUNT(*) FROM whatsapp_ai_config;

-- 3. Test data_collection_fields isolation
-- This should only return fields for configs owned by current user
SELECT COUNT(*) FROM data_collection_fields;

-- 4. Test helper functions
SELECT user_can_access_config('some-config-uuid');
SELECT user_can_access_instance('some-instance-uuid');
*/