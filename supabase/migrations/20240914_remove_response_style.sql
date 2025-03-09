
-- This migration removes the "Response Style" metadata field from the system
-- First, delete any existing "Response Style" metadata values
DELETE FROM public.file_metadata
WHERE field_id IN (
  SELECT id FROM public.metadata_fields
  WHERE name = 'Response Style'
);

-- Then delete the "Response Style" metadata field definition
DELETE FROM public.metadata_fields
WHERE name = 'Response Style';

-- Update the insert_default_metadata_fields function to remove the Response Style field
CREATE OR REPLACE FUNCTION public.insert_default_metadata_fields(target_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO metadata_fields (name, description, field_type, is_required, profile_id, options)
  VALUES 
    -- Basic Information Fields
    ('Document Title', 'The title/name of the document or content', 'text', true, target_profile_id, NULL),
    ('Description', 'Detailed description of the document''s content and purpose', 'text', true, target_profile_id, NULL),
    ('Priority', 'Importance level of the content', 'select', true, target_profile_id, '[{"label": "High", "value": "high"}, {"label": "Medium", "value": "medium"}, {"label": "Low", "value": "low"}]'::jsonb),

    -- Content Classification
    ('Custom Categories', 'User-defined categories for organizing content', 'text', false, target_profile_id, NULL),
    ('Keywords', 'Relevant keywords for content searching and AI matching', 'text', true, target_profile_id, NULL),

    -- Business Context
    ('Department', 'Department or team the content belongs to', 'text', false, target_profile_id, NULL),
    ('Use Case', 'Specific business scenarios where this content applies', 'text', false, target_profile_id, NULL),

    -- Content Management
    ('Expiration Date', 'Date when the content should be reviewed/updated', 'date', false, target_profile_id, NULL),
    ('Version Notes', 'Version information and change history', 'text', false, target_profile_id, NULL),
    
    -- Custom Instructions (kept because it's different from Response Style)
    ('Custom Instructions', 'Special instructions for AI when using this content', 'text', false, target_profile_id, NULL);
END;
$function$;
