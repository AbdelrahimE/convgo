-- Enable real-time subscriptions for the files table
-- This migration enables real-time functionality for file updates and insertions

-- Enable REPLICA IDENTITY FULL to ensure we get the full row data on updates
ALTER TABLE public.files REPLICA IDENTITY FULL;

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

  -- Add the files table to the publication if not already added
  ALTER PUBLICATION supabase_realtime ADD TABLE public.files;
COMMIT;

-- Add a comment to document this change
COMMENT ON TABLE public.files IS 'Real-time enabled for file management operations - supports INSERT, UPDATE, DELETE events';