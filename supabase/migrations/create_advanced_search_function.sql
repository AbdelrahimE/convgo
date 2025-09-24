-- Advanced Customer Profiles Search Function
-- Optimized for high-performance filtering and search with full-text capabilities

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS search_customer_profiles(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);

-- Enable trigram extension for better text search if not enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create advanced search function with comprehensive filtering
CREATE OR REPLACE FUNCTION search_customer_profiles(
  p_instance_id UUID,
  p_search_term TEXT DEFAULT NULL,
  p_stage_filter TEXT DEFAULT 'all',
  p_intent_filter TEXT DEFAULT 'all', 
  p_mood_filter TEXT DEFAULT 'all',
  p_urgency_filter TEXT DEFAULT 'all',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS TABLE (
  profiles JSONB,
  total_count INTEGER,
  filtered_count INTEGER,
  page_info JSONB
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_offset INTEGER;
  v_search_condition TEXT;
  v_stage_condition TEXT;
  v_intent_condition TEXT;
  v_mood_condition TEXT;
  v_urgency_condition TEXT;
  v_where_clause TEXT;
  v_query TEXT;
  v_count_query TEXT;
  v_total_records INTEGER;
  v_filtered_records INTEGER;
  v_profiles JSONB;
BEGIN
  -- Calculate offset for pagination
  v_offset := (p_page - 1) * p_page_size;
  
  -- Build search condition with full-text search support
  IF p_search_term IS NOT NULL AND p_search_term != '' THEN
    v_search_condition := FORMAT('
      (name ILIKE %L 
       OR phone_number ILIKE %L 
       OR email ILIKE %L 
       OR company ILIKE %L
       OR conversation_summary ILIKE %L)',
      '%' || p_search_term || '%',
      '%' || p_search_term || '%', 
      '%' || p_search_term || '%',
      '%' || p_search_term || '%',
      '%' || p_search_term || '%'
    );
  ELSE
    v_search_condition := 'TRUE';
  END IF;
  
  -- Build stage filter condition
  IF p_stage_filter IS NOT NULL AND p_stage_filter != 'all' THEN
    v_stage_condition := FORMAT('customer_stage = %L', p_stage_filter);
  ELSE
    v_stage_condition := 'TRUE';
  END IF;
  
  -- Build intent filter condition
  IF p_intent_filter IS NOT NULL AND p_intent_filter != 'all' THEN
    v_intent_condition := FORMAT('customer_intent = %L', p_intent_filter);
  ELSE
    v_intent_condition := 'TRUE';
  END IF;
  
  -- Build mood filter condition
  IF p_mood_filter IS NOT NULL AND p_mood_filter != 'all' THEN
    v_mood_condition := FORMAT('customer_mood = %L', p_mood_filter);
  ELSE
    v_mood_condition := 'TRUE';
  END IF;
  
  -- Build urgency filter condition
  IF p_urgency_filter IS NOT NULL AND p_urgency_filter != 'all' THEN
    v_urgency_condition := FORMAT('urgency_level = %L', p_urgency_filter);
  ELSE
    v_urgency_condition := 'TRUE';
  END IF;
  
  -- Combine all conditions
  v_where_clause := FORMAT('
    whatsapp_instance_id = %L 
    AND %s 
    AND %s 
    AND %s 
    AND %s 
    AND %s',
    p_instance_id,
    v_search_condition,
    v_stage_condition,
    v_intent_condition,
    v_mood_condition,
    v_urgency_condition
  );
  
  -- Get total count of all records for this instance
  EXECUTE FORMAT('SELECT COUNT(*) FROM customer_profiles WHERE whatsapp_instance_id = %L', p_instance_id)
  INTO v_total_records;
  
  -- Get filtered count
  v_count_query := FORMAT('SELECT COUNT(*) FROM customer_profiles WHERE %s', v_where_clause);
  EXECUTE v_count_query INTO v_filtered_records;
  
  -- Get paginated profiles with all fields
  v_query := FORMAT('
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          ''id'', id,
          ''whatsapp_instance_id'', whatsapp_instance_id,
          ''phone_number'', phone_number,
          ''name'', name,
          ''email'', email,
          ''company'', company,
          ''customer_stage'', customer_stage,
          ''tags'', tags,
          ''conversation_summary'', conversation_summary,
          ''key_points'', key_points,
          ''preferences'', preferences,
          ''last_interaction'', last_interaction,
          ''first_interaction'', first_interaction,
          ''total_messages'', total_messages,
          ''ai_interactions'', ai_interactions,
          ''customer_intent'', customer_intent,
          ''customer_mood'', customer_mood,
          ''urgency_level'', urgency_level,
          ''communication_style'', communication_style,
          ''journey_stage'', journey_stage,
          ''created_at'', created_at,
          ''updated_at'', updated_at,
          ''last_summary_update'', last_summary_update,
          ''action_items'', action_items,
          ''messages_since_last_summary'', messages_since_last_summary
        ) ORDER BY last_interaction DESC NULLS LAST
      ), 
      ''[]''::jsonb
    )
    FROM (
      SELECT * FROM customer_profiles 
      WHERE %s
      ORDER BY last_interaction DESC NULLS LAST
      LIMIT %s OFFSET %s
    ) subquery',
    v_where_clause,
    p_page_size,
    v_offset
  );
  
  EXECUTE v_query INTO v_profiles;
  
  -- Return results
  RETURN QUERY SELECT 
    v_profiles,
    v_total_records,
    v_filtered_records,
    jsonb_build_object(
      'currentPage', p_page,
      'pageSize', p_page_size,
      'totalPages', CEIL(v_filtered_records::FLOAT / p_page_size::FLOAT)::INTEGER,
      'hasNextPage', (p_page * p_page_size) < v_filtered_records,
      'hasPrevPage', p_page > 1
    );
END;
$$;

-- Create optimized indexes for the search function if they don't exist
CREATE INDEX IF NOT EXISTS idx_customer_profiles_search_name 
ON customer_profiles USING gin(to_tsvector('english', COALESCE(name, '')));

CREATE INDEX IF NOT EXISTS idx_customer_profiles_search_company 
ON customer_profiles USING gin(to_tsvector('english', COALESCE(company, '')));

CREATE INDEX IF NOT EXISTS idx_customer_profiles_search_summary 
ON customer_profiles USING gin(to_tsvector('english', COALESCE(conversation_summary, '')));

-- Composite indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_customer_profiles_filters 
ON customer_profiles (whatsapp_instance_id, customer_stage, customer_intent, customer_mood, urgency_level, last_interaction DESC);

-- Phone and email search optimization
CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone_search 
ON customer_profiles USING gin(phone_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email_search 
ON customer_profiles USING gin(COALESCE(email, '') gin_trgm_ops);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_customer_profiles TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION search_customer_profiles IS 'Advanced search function for customer profiles with full-text search, filtering, and pagination capabilities. Optimized for high performance with comprehensive indexing.';