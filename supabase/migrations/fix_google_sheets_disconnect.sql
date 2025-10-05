-- Fix Google Sheets disconnect issue by adding proper CASCADE behavior
-- This migration fixes the foreign key constraint violation when disconnecting Google account

-- First, let's check if the constraint exists and drop it
DO $$ 
BEGIN
    -- Drop the existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'whatsapp_ai_config_data_collection_config_id_fkey'
        AND table_name = 'whatsapp_ai_config'
    ) THEN
        ALTER TABLE whatsapp_ai_config 
        DROP CONSTRAINT whatsapp_ai_config_data_collection_config_id_fkey;
        
        RAISE NOTICE 'Dropped existing foreign key constraint: whatsapp_ai_config_data_collection_config_id_fkey';
    END IF;
END $$;

-- Add the foreign key constraint with proper ON DELETE SET NULL behavior
-- This will automatically set data_collection_config_id to NULL when the referenced google_sheets_config is deleted
ALTER TABLE whatsapp_ai_config 
ADD CONSTRAINT whatsapp_ai_config_data_collection_config_id_fkey 
FOREIGN KEY (data_collection_config_id) 
REFERENCES google_sheets_config(id) ON DELETE SET NULL;

-- Also ensure enable_data_collection is set to false when config is deleted
-- This is handled by application logic, but we add a trigger as backup
CREATE OR REPLACE FUNCTION handle_google_sheets_config_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- When a google_sheets_config is deleted, disable data collection for related WhatsApp instances
    UPDATE whatsapp_ai_config 
    SET 
        enable_data_collection = false,
        data_collection_config_id = NULL
    WHERE data_collection_config_id = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically handle cleanup when google_sheets_config is deleted
CREATE TRIGGER google_sheets_config_cleanup_trigger
    BEFORE DELETE ON google_sheets_config
    FOR EACH ROW
    EXECUTE FUNCTION handle_google_sheets_config_deletion();

-- Add helpful comments for documentation
COMMENT ON CONSTRAINT whatsapp_ai_config_data_collection_config_id_fkey ON whatsapp_ai_config IS 
    'Foreign key with SET NULL on delete to prevent constraint violations when disconnecting Google Sheets';

COMMENT ON FUNCTION handle_google_sheets_config_deletion() IS 
    'Automatically disables data collection and clears config reference when Google Sheets config is deleted';

COMMENT ON TRIGGER google_sheets_config_cleanup_trigger ON google_sheets_config IS 
    'Ensures clean disconnection of Google Sheets by disabling data collection before deletion';

-- Log the completion
DO $$ 
BEGIN
    RAISE NOTICE 'Successfully updated foreign key constraint and added cleanup triggers for Google Sheets disconnect functionality';
END $$;