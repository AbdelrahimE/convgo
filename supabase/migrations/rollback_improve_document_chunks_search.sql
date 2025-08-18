-- Rollback the harmful migration - restore original function
CREATE OR REPLACE FUNCTION public.match_document_chunks_by_files(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  min_content_length integer DEFAULT 20,
  filter_language text DEFAULT NULL,
  file_ids uuid[] DEFAULT NULL   -- ✅ غيّرتها من text[] إلى uuid[]
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
    1 - (e.embedding <=> query_embedding) AS similarity,
    c.language
  FROM
    document_embeddings e
    JOIN text_chunks c ON e.chunk_id = c.id
  WHERE
    length(c.content) >= min_content_length
    AND (filter_language IS NULL OR c.language = filter_language)
    AND (file_ids IS NULL OR e.file_id = ANY(file_ids)) -- ✅ الآن متوافقة uuid = uuid
    AND e.status = 'complete'
  ORDER BY
    e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ✅ لازم توقيع الدالة بين أقواس وبنفس الأنواع
COMMENT ON FUNCTION public.match_document_chunks_by_files(
  vector,
  double precision,
  integer,
  integer,
  text,
  uuid[]
) IS
'Original document chunk matching function - restored from rollback of excessive filtering';