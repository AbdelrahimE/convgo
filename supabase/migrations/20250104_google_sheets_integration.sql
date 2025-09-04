-- Create Google Sheets integration tables
-- This migration adds support for dynamic field collection and Google Sheets export

-- Table for Google Sheets configuration per user/instance
CREATE TABLE IF NOT EXISTS google_sheets_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    google_sheet_id TEXT NOT NULL,
    sheet_name TEXT DEFAULT 'Sheet1',
    google_tokens JSONB, -- Will store encrypted OAuth tokens
    google_email TEXT, -- User's Google account email
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, whatsapp_instance_id)
);

-- Table for custom field definitions per configuration
CREATE TABLE IF NOT EXISTS data_collection_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID REFERENCES google_sheets_config(id) ON DELETE CASCADE NOT NULL,
    field_name TEXT NOT NULL, -- Internal field name (e.g., 'customer_name')
    field_display_name TEXT NOT NULL, -- Display name (e.g., 'Customer Name')
    field_display_name_ar TEXT, -- Arabic display name
    field_type TEXT DEFAULT 'text' CHECK (field_type IN ('text', 'phone', 'email', 'number', 'date', 'address', 'select', 'boolean')),
    is_required BOOLEAN DEFAULT false,
    validation_rules JSONB, -- Contains regex, min/max values, options for select, etc.
    extraction_keywords TEXT[], -- Keywords to help AI identify this field
    prompt_template TEXT, -- Custom prompt for extracting this specific field
    ask_if_missing_template TEXT, -- Template for asking user if field is missing
    field_order INTEGER DEFAULT 0,
    column_letter TEXT, -- Google Sheets column (A, B, C, etc.)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_id, field_name)
);

-- Table for data collection sessions (tracks ongoing data collection from conversations)
CREATE TABLE IF NOT EXISTS collected_data_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID REFERENCES google_sheets_config(id) ON DELETE CASCADE NOT NULL,
    conversation_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    collected_data JSONB DEFAULT '{}', -- Stores collected field values
    missing_fields TEXT[] DEFAULT '{}', -- Fields that still need to be collected
    validation_errors JSONB, -- Stores validation errors if any
    is_complete BOOLEAN DEFAULT false,
    exported_to_sheets BOOLEAN DEFAULT false,
    sheet_row_number INTEGER, -- Row number in Google Sheet
    export_error TEXT, -- Error message if export failed
    retry_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    exported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_id, conversation_id)
);

-- Table for tracking export history and analytics
CREATE TABLE IF NOT EXISTS sheets_export_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES collected_data_sessions(id) ON DELETE CASCADE,
    config_id UUID REFERENCES google_sheets_config(id) ON DELETE CASCADE,
    sheet_id TEXT NOT NULL,
    row_number INTEGER,
    exported_data JSONB,
    status TEXT CHECK (status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    response_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_google_sheets_config_user_id ON google_sheets_config(user_id);
CREATE INDEX IF NOT EXISTS idx_google_sheets_config_instance ON google_sheets_config(whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_data_collection_fields_config ON data_collection_fields(config_id);
CREATE INDEX IF NOT EXISTS idx_collected_data_sessions_config ON collected_data_sessions(config_id);
CREATE INDEX IF NOT EXISTS idx_collected_data_sessions_conversation ON collected_data_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_collected_data_sessions_phone ON collected_data_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_collected_data_sessions_complete ON collected_data_sessions(is_complete);
CREATE INDEX IF NOT EXISTS idx_sheets_export_logs_session ON sheets_export_logs(session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE google_sheets_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_collection_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE collected_data_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_export_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for google_sheets_config
CREATE POLICY "Users can view their own Google Sheets configs" ON google_sheets_config
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Google Sheets configs" ON google_sheets_config
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Google Sheets configs" ON google_sheets_config
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Google Sheets configs" ON google_sheets_config
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for data_collection_fields
CREATE POLICY "Users can view their own field configurations" ON data_collection_fields
    FOR SELECT USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

-- Separate policies for better security control
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

-- RLS Policies for collected_data_sessions
CREATE POLICY "Users can view their own data sessions" ON collected_data_sessions
    FOR SELECT USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own data sessions" ON collected_data_sessions
    FOR DELETE USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all data sessions" ON collected_data_sessions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for sheets_export_logs
CREATE POLICY "Users can view their own export logs" ON sheets_export_logs
    FOR SELECT USING (
        config_id IN (
            SELECT id FROM google_sheets_config WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all export logs" ON sheets_export_logs
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_google_sheets_config_updated_at BEFORE UPDATE ON google_sheets_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_collection_fields_updated_at BEFORE UPDATE ON data_collection_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collected_data_sessions_updated_at BEFORE UPDATE ON collected_data_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add column to whatsapp_ai_config to enable/disable data collection
ALTER TABLE whatsapp_ai_config 
ADD COLUMN IF NOT EXISTS enable_data_collection BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_collection_config_id UUID REFERENCES google_sheets_config(id);

-- Create a view for easier querying of complete sessions with their configs
CREATE OR REPLACE VIEW data_collection_overview AS
SELECT 
    s.id as session_id,
    s.phone_number,
    s.conversation_id,
    s.collected_data,
    s.is_complete,
    s.exported_to_sheets,
    s.created_at as session_created_at,
    s.completed_at,
    s.exported_at,
    c.google_sheet_id,
    c.sheet_name,
    c.google_email,
    c.user_id,
    w.instance_name as whatsapp_instance_name,
    COUNT(f.id) as total_fields,
    COUNT(f.id) FILTER (WHERE f.is_required = true) as required_fields
FROM collected_data_sessions s
JOIN google_sheets_config c ON s.config_id = c.id
LEFT JOIN whatsapp_instances w ON c.whatsapp_instance_id = w.id
LEFT JOIN data_collection_fields f ON c.id = f.config_id AND f.is_active = true
GROUP BY s.id, c.id, w.instance_name;

-- Grant necessary permissions to authenticated users
GRANT SELECT ON data_collection_overview TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE google_sheets_config IS 'Stores Google Sheets integration configuration for each user/WhatsApp instance';
COMMENT ON TABLE data_collection_fields IS 'Defines custom fields to be collected from WhatsApp conversations';
COMMENT ON TABLE collected_data_sessions IS 'Tracks ongoing data collection sessions from WhatsApp conversations';
COMMENT ON TABLE sheets_export_logs IS 'Logs all exports to Google Sheets for auditing and debugging';
COMMENT ON COLUMN google_sheets_config.google_tokens IS 'Encrypted OAuth2 tokens for Google Sheets API access';
COMMENT ON COLUMN data_collection_fields.validation_rules IS 'JSON object containing validation rules like regex patterns, min/max values, select options';
COMMENT ON COLUMN collected_data_sessions.collected_data IS 'JSON object storing the collected field values keyed by field_name';