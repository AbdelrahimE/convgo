
-- Enable REPLICA IDENTITY FULL to ensure we get the full row data on updates
ALTER TABLE public.whatsapp_instances REPLICA IDENTITY FULL;

-- Add the table to the realtime publication
BEGIN;
  -- Check if the publication already exists
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
      -- Create the publication if it doesn't exist
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;

  -- Add the table to the publication if not already added
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
COMMIT;
