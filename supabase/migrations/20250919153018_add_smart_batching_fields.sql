-- Add smart batching fields to customer_profiles table
-- This enables smart conversation summarization every 5 messages

-- Add each column separately (PostgreSQL requirement)
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS last_summary_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]';
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS messages_since_last_summary INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_profiles_last_summary_update 
  ON customer_profiles(last_summary_update);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_messages_since_summary 
  ON customer_profiles(messages_since_last_summary);

-- Add comment to track the enhancement
COMMENT ON COLUMN customer_profiles.last_summary_update IS 'Timestamp of last conversation summary update for smart batching';
COMMENT ON COLUMN customer_profiles.action_items IS 'JSON array of action items extracted from conversations';
COMMENT ON COLUMN customer_profiles.messages_since_last_summary IS 'Counter for messages since last summary update';