-- Conversation Summaries Archive Table
-- This table archives all conversation summaries before they get truncated
-- Enables RAG (Retrieval-Augmented Generation) for long-term customer memory

-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE conversation_summaries_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Customer relationship
  customer_profile_id UUID NOT NULL,
  whatsapp_instance_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  
  -- Summary content
  summary_text TEXT NOT NULL,
  summary_embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimension
  
  -- Message batch information
  messages_batch_start INTEGER NOT NULL, -- Starting message number for this summary
  messages_batch_end INTEGER NOT NULL,   -- Ending message number for this summary
  total_messages_at_time INTEGER NOT NULL, -- Total customer messages when this summary was created
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_summaries_customer_profile 
    FOREIGN KEY (customer_profile_id) 
    REFERENCES customer_profiles(id) 
    ON DELETE CASCADE,
    
  -- Ensure no duplicate summaries for same message batch
  UNIQUE(customer_profile_id, messages_batch_start, messages_batch_end)
);

-- Performance indexes
CREATE INDEX idx_summaries_customer_profile ON conversation_summaries_archive(customer_profile_id);
CREATE INDEX idx_summaries_instance_phone ON conversation_summaries_archive(whatsapp_instance_id, phone_number);
CREATE INDEX idx_summaries_created_at ON conversation_summaries_archive(created_at DESC);
CREATE INDEX idx_summaries_batch_range ON conversation_summaries_archive(messages_batch_start, messages_batch_end);

-- Vector search index (will be created when embeddings are added)
-- CREATE INDEX idx_summaries_embedding ON conversation_summaries_archive 
--   USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security
ALTER TABLE conversation_summaries_archive ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own summaries
CREATE POLICY "Users can access their own conversation summaries" 
ON conversation_summaries_archive
FOR ALL USING (
  customer_profile_id IN (
    SELECT cp.id 
    FROM customer_profiles cp
    JOIN whatsapp_instances wi ON cp.whatsapp_instance_id = wi.id
    WHERE wi.user_id = auth.uid()
  )
);

-- Comments for documentation
COMMENT ON TABLE conversation_summaries_archive IS 'Archive of all conversation summaries for long-term customer memory and RAG';
COMMENT ON COLUMN conversation_summaries_archive.summary_text IS 'Full text of the conversation summary before truncation';
COMMENT ON COLUMN conversation_summaries_archive.summary_embedding IS 'Vector embedding for semantic search (OpenAI text-embedding-3-small)';
COMMENT ON COLUMN conversation_summaries_archive.messages_batch_start IS 'Starting message number in the conversation for this summary';
COMMENT ON COLUMN conversation_summaries_archive.messages_batch_end IS 'Ending message number in the conversation for this summary';
COMMENT ON COLUMN conversation_summaries_archive.total_messages_at_time IS 'Total messages the customer had sent when this summary was created';