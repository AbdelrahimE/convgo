-- =====================================================
-- Migration: Add Separate Escalation Controls
-- Description: Add individual controls for smart and keyword escalation
-- Date: 2025-09-01
-- =====================================================

-- 1. Add new columns for separate escalation controls
ALTER TABLE public.whatsapp_instances 
ADD COLUMN smart_escalation_enabled BOOLEAN DEFAULT true,
ADD COLUMN keyword_escalation_enabled BOOLEAN DEFAULT true;

-- 2. Update existing records to maintain current behavior
-- If escalation_enabled is true, enable both methods
-- If escalation_enabled is false, disable both methods
UPDATE public.whatsapp_instances 
SET smart_escalation_enabled = escalation_enabled,
    keyword_escalation_enabled = escalation_enabled;

-- 3. Add helpful comments for the new columns
COMMENT ON COLUMN public.whatsapp_instances.smart_escalation_enabled IS 
'Enable AI-based intent detection for automatic escalation when customers need human support';

COMMENT ON COLUMN public.whatsapp_instances.keyword_escalation_enabled IS 
'Enable keyword-based escalation triggers using predefined escalation keywords';

-- 4. Update the existing escalation_enabled column comment
COMMENT ON COLUMN public.whatsapp_instances.escalation_enabled IS 
'Master escalation switch - when disabled, no escalation occurs regardless of individual method settings';

-- 5. Create an index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_escalation_methods 
ON public.whatsapp_instances(smart_escalation_enabled, keyword_escalation_enabled) 
WHERE escalation_enabled = true;

-- 6. Log the migration completion
DO $$
BEGIN
    RAISE NOTICE 'Separate escalation controls added successfully. Users can now control smart AI and keyword escalation independently.';
END $$;