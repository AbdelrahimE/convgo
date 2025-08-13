-- Migration to standardize WhatsApp instance connection status from uppercase to capitalize format
-- This converts CONNECTED -> Connected, DISCONNECTED -> Disconnected, etc.

BEGIN;

-- Update existing records to use capitalize format
UPDATE public.whatsapp_instances 
SET status = CASE 
    WHEN status = 'CONNECTED' THEN 'Connected'
    WHEN status = 'DISCONNECTED' THEN 'Disconnected' 
    WHEN status = 'CONNECTING' THEN 'Connecting'
    WHEN status = 'CREATED' THEN 'Created'
    ELSE status -- Keep any other values as-is for safety
END
WHERE status IN ('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'CREATED');

-- Log the changes for verification
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % WhatsApp instance status records to capitalize format', updated_count;
END $$;

COMMIT;