-- Enable realtime for escalated_conversations table
-- This migration fixes the red dot notification issue in the sidebar

-- Enable REPLICA IDENTITY FULL to ensure we get the full row data on updates
ALTER TABLE public.escalated_conversations REPLICA IDENTITY FULL;

-- Add the table to the realtime publication
-- Check if the publication exists first (it should, but just to be safe)
DO $$
BEGIN
  -- If the publication doesn't exist, create it
  IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
      CREATE PUBLICATION supabase_realtime;
  END IF;
  
  -- Add the table to the publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.escalated_conversations;
END
$$;