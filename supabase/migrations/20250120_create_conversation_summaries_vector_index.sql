-- Create Vector Index for Conversation Summaries Archive
-- This enables fast semantic search using cosine similarity

-- 1. Primary vector index for semantic search (ivfflat for vector similarity)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_embedding_cosine 
ON conversation_summaries_archive 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

-- 2. Standard B-tree indexes for filtering (separate from vector index)
-- PostgreSQL query planner will use multiple indexes efficiently

-- Customer profile filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_customer_profile 
ON conversation_summaries_archive (customer_profile_id);

-- Instance + phone filtering  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_instance_phone 
ON conversation_summaries_archive (whatsapp_instance_id, phone_number);

-- Timestamp filtering for chronological queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_created_at_desc 
ON conversation_summaries_archive (created_at DESC);

-- Batch range filtering for specific message ranges
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_message_batch 
ON conversation_summaries_archive (messages_batch_start, messages_batch_end);

-- 3. Partial vector indexes for most common filtering scenarios
-- These combine vector search with common filters

-- Vector index filtered by non-null embeddings (optimization)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summaries_embedding_filtered
ON conversation_summaries_archive 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100)
WHERE summary_embedding IS NOT NULL;

-- Update table statistics for query optimizer
ANALYZE conversation_summaries_archive;

-- Add helpful comments
COMMENT ON INDEX idx_summaries_embedding_cosine IS 'Primary vector index for semantic search across all conversation summaries';
COMMENT ON INDEX idx_summaries_customer_profile IS 'B-tree index for customer profile filtering';
COMMENT ON INDEX idx_summaries_instance_phone IS 'Composite B-tree index for instance+phone filtering';
COMMENT ON INDEX idx_summaries_created_at_desc IS 'B-tree index for chronological ordering';
COMMENT ON INDEX idx_summaries_message_batch IS 'B-tree index for message batch range queries';
COMMENT ON INDEX idx_summaries_embedding_filtered IS 'Filtered vector index excluding null embeddings';