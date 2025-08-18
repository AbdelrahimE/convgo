
CREATE OR REPLACE FUNCTION public.match_document_chunks_by_files(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  min_content_length integer DEFAULT 20,
  filter_language text DEFAULT NULL,
  file_ids text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  chunk_id uuid,
  file_id uuid,
  content text,
  metadata jsonb,
  similarity double precision,
  language text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.chunk_id,
    e.file_id,
    c.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity,
    c.language
  FROM
    document_embeddings e
    JOIN text_chunks c ON e.chunk_id = c.id
  WHERE
    -- Only include chunks with sufficient content
    length(c.content) >= min_content_length
    -- Filter by language if specified
    AND (filter_language IS NULL OR c.language = filter_language)
    -- Filter by file IDs if specified
    AND (file_ids IS NULL OR e.file_id = ANY(file_ids))
    -- Only include chunks where embedding is complete
    AND e.status = 'complete'
  ORDER BY
    -- Order by similarity score (closest match first)
    e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
