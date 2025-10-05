-- Create RPC Function for Conversation Summaries Vector Search
-- This enables vector search via Supabase RPC calls, bypassing PostgREST limitations

CREATE OR REPLACE FUNCTION search_conversation_summaries(
  p_instance_id TEXT,
  p_phone_number TEXT, 
  p_query_embedding VECTOR(1536),
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  summary_text TEXT,
  created_at TIMESTAMPTZ,
  messages_batch_start INTEGER,
  messages_batch_end INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return semantically similar conversation summaries
  RETURN QUERY
  SELECT 
    csa.summary_text,
    csa.created_at,
    csa.messages_batch_start,
    csa.messages_batch_end,
    1 - (csa.summary_embedding <=> p_query_embedding) AS similarity
  FROM conversation_summaries_archive csa
  WHERE csa.whatsapp_instance_id = p_instance_id
    AND csa.phone_number = p_phone_number  
    AND csa.summary_embedding IS NOT NULL
  ORDER BY csa.summary_embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION search_conversation_summaries TO service_role;
GRANT EXECUTE ON FUNCTION search_conversation_summaries TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION search_conversation_summaries IS 'Vector search function for conversation summaries using cosine similarity. Returns most relevant historical summaries for RAG context.';