-- =====================================================================
-- Optimized Stored Procedures Migration - SAFE VERSION
-- =====================================================================
-- IMPORTANT: These procedures maintain EXACT compatibility with existing code
-- They replicate the current logic precisely to avoid any breaking changes
-- =====================================================================

-- =====================================================================
-- PROCEDURE 1: Store Message with Update (replaces 3 separate queries)
-- =====================================================================
-- This procedure combines the 3 operations in conversation-storage.ts:
-- 1. Insert message into whatsapp_conversation_messages
-- 2. Count total messages in conversation
-- 3. Update whatsapp_conversations with new metadata

CREATE OR REPLACE FUNCTION store_message_with_update(
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_message_id TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_message_count BIGINT;
  v_current_timestamp TIMESTAMP WITH TIME ZONE;
  v_inserted_message_id UUID;
  v_error_detail TEXT;
BEGIN
  -- Get current timestamp to ensure consistency
  v_current_timestamp := NOW();
  
  -- Start transaction block with error handling
  BEGIN
    -- Step 1: Insert the message (exact replica of current logic)
    INSERT INTO whatsapp_conversation_messages (
      conversation_id, 
      role, 
      content, 
      message_id, 
      metadata
    ) VALUES (
      p_conversation_id, 
      p_role, 
      p_content, 
      p_message_id,
      jsonb_build_object(
        'estimated_tokens', CEIL(LENGTH(p_content) * 0.25),
        'timestamp', v_current_timestamp::TEXT
      )
    )
    RETURNING id INTO v_inserted_message_id;
    
    -- Step 2: Count messages (matching exact current select query)
    SELECT COUNT(*)::BIGINT INTO v_message_count
    FROM whatsapp_conversation_messages
    WHERE conversation_id = p_conversation_id;
    
    -- Step 3: Update conversation (exact replica of current update)
    UPDATE whatsapp_conversations
    SET 
      last_activity = v_current_timestamp,
      conversation_data = jsonb_build_object(
        'context', jsonb_build_object(
          'last_update', v_current_timestamp::TEXT,
          'message_count', v_message_count,
          'last_message_role', p_role
        )
      )
    WHERE id = p_conversation_id;
    
    -- Return success with same data structure
    SELECT json_build_object(
      'success', true,
      'message_id', v_inserted_message_id,
      'conversation_id', p_conversation_id,
      'message_count', v_message_count,
      'timestamp', v_current_timestamp::TEXT
    ) INTO v_result;
    
    RETURN v_result;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture error details for debugging
      v_error_detail := SQLERRM;
      
      -- Return error in same format as TypeScript error handling
      SELECT json_build_object(
        'success', false,
        'error', 'Error in storeMessageInConversation: ' || v_error_detail,
        'conversation_id', p_conversation_id,
        'role', p_role
      ) INTO v_result;
      
      -- Log error (similar to console.error)
      RAISE WARNING 'Error in store_message_with_update: %', v_error_detail;
      
      RETURN v_result;
  END;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION store_message_with_update IS 'Optimized function that combines message insertion, counting, and conversation update into a single atomic operation. Replaces 3 separate queries from conversation-storage.ts';

-- =====================================================================
-- PROCEDURE 2: Check and Update AI Usage (replaces 2-3 queries)
-- =====================================================================
-- This procedure replicates the exact logic from checkAndUpdateUserLimit
-- in generate-response/index.ts

CREATE OR REPLACE FUNCTION check_and_update_ai_usage(
  p_user_id UUID,
  p_increment BOOLEAN DEFAULT FALSE
) RETURNS JSON AS $$
DECLARE
  v_profile RECORD;
  v_allowed BOOLEAN;
  v_next_reset TIMESTAMP WITH TIME ZONE;
  v_result JSON;
  v_error_detail TEXT;
BEGIN
  -- Handle null user_id (same as current TypeScript logic)
  IF p_user_id IS NULL THEN
    RETURN json_build_object(
      'allowed', true,
      'limit', 0,
      'used', 0,
      'resetsOn', NULL,
      'errorMessage', 'No user ID provided for limit check'
    );
  END IF;
  
  BEGIN
    -- Get profile with lock (if incrementing) to prevent race conditions
    IF p_increment THEN
      SELECT * INTO v_profile
      FROM profiles
      WHERE id = p_user_id
      FOR UPDATE;
    ELSE
      SELECT * INTO v_profile
      FROM profiles
      WHERE id = p_user_id;
    END IF;
    
    -- Handle profile not found (same as current error handling)
    IF NOT FOUND THEN
      RETURN json_build_object(
        'allowed', true,
        'limit', 0,
        'used', 0,
        'resetsOn', NULL,
        'errorMessage', 'Error fetching user profile'
      );
    END IF;
    
    -- Check if allowed (exact same logic)
    v_allowed := v_profile.monthly_ai_responses_used < v_profile.monthly_ai_response_limit;
    
    -- Calculate next reset date (matching current logic)
    IF v_profile.last_responses_reset_date IS NOT NULL THEN
      v_next_reset := date_trunc('month', v_profile.last_responses_reset_date) + INTERVAL '1 month';
    ELSE
      v_next_reset := date_trunc('month', NOW()) + INTERVAL '1 month';
    END IF;
    
    -- Increment if requested and allowed (exact same condition)
    IF p_increment AND v_allowed THEN
      UPDATE profiles
      SET monthly_ai_responses_used = monthly_ai_responses_used + 1
      WHERE id = p_user_id;
      
      -- Update local variable for return value
      v_profile.monthly_ai_responses_used := v_profile.monthly_ai_responses_used + 1;
    END IF;
    
    -- Return exact same structure as TypeScript
    RETURN json_build_object(
      'allowed', v_allowed,
      'limit', v_profile.monthly_ai_response_limit,
      'used', v_profile.monthly_ai_responses_used,
      'resetsOn', v_next_reset::TEXT
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      v_error_detail := SQLERRM;
      
      -- Return safe defaults on error (matching TypeScript error handling)
      RETURN json_build_object(
        'allowed', true,
        'limit', 0,
        'used', 0,
        'resetsOn', NULL,
        'errorMessage', 'Error checking AI usage: ' || v_error_detail
      );
  END;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION check_and_update_ai_usage IS 'Atomic function for checking and updating AI usage limits. Replaces separate select and update queries from generate-response/index.ts';

-- =====================================================================
-- PROCEDURE 3: Get Conversation Context (for future optimization)
-- =====================================================================
-- This is for future use to optimize findOrCreateConversation
-- Currently NOT USED to avoid breaking changes

CREATE OR REPLACE FUNCTION get_conversation_with_context(
  p_instance_id UUID,
  p_user_phone TEXT,
  p_message_limit INTEGER DEFAULT 10
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_conversation RECORD;
  v_is_escalated BOOLEAN;
  v_recent_messages JSON;
  v_recent_interactions JSON;
  v_instance_config JSON;
BEGIN
  -- Find active conversation
  SELECT * INTO v_conversation
  FROM whatsapp_conversations
  WHERE instance_id = p_instance_id
  AND user_phone = p_user_phone
  AND status = 'active'
  LIMIT 1;
  
  -- If no conversation found, return null (caller will handle creation)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Check if escalated
  SELECT EXISTS(
    SELECT 1 FROM escalated_conversations
    WHERE instance_id = p_instance_id
    AND whatsapp_number = p_user_phone
    AND resolved_at IS NULL
  ) INTO v_is_escalated;
  
  -- Get recent messages
  SELECT json_agg(row_to_json(m.*))
  INTO v_recent_messages
  FROM (
    SELECT role, content, timestamp
    FROM whatsapp_conversation_messages
    WHERE conversation_id = v_conversation.id
    ORDER BY timestamp DESC
    LIMIT p_message_limit
  ) m;
  
  -- Get recent interactions
  SELECT json_agg(row_to_json(i.*))
  INTO v_recent_interactions
  FROM (
    SELECT metadata, created_at, user_message
    FROM whatsapp_ai_interactions
    WHERE whatsapp_instance_id = p_instance_id
    AND user_phone = p_user_phone
    ORDER BY created_at DESC
    LIMIT 5
  ) i;
  
  -- Get instance config
  SELECT row_to_json(wi.*)
  INTO v_instance_config
  FROM whatsapp_instances wi
  WHERE wi.id = p_instance_id;
  
  -- Build and return result
  RETURN json_build_object(
    'conversation', row_to_json(v_conversation),
    'is_escalated', v_is_escalated,
    'recent_messages', COALESCE(v_recent_messages, '[]'::JSON),
    'recent_interactions', COALESCE(v_recent_interactions, '[]'::JSON),
    'instance_config', v_instance_config
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return null on error, let calling code handle it
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION get_conversation_with_context IS 'Optional optimization function for getting conversation with all related data in one query. For future use.';

-- =====================================================================
-- ROLLBACK PROCEDURES (in case of issues)
-- =====================================================================
-- To rollback these procedures, run:
/*
DROP FUNCTION IF EXISTS store_message_with_update(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS check_and_update_ai_usage(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_conversation_with_context(UUID, TEXT, INTEGER);
*/

-- =====================================================================
-- TEST QUERIES (to verify procedures work correctly)
-- =====================================================================
/*
-- Test store_message_with_update
SELECT store_message_with_update(
  'YOUR_CONVERSATION_ID'::UUID,
  'user',
  'Test message content',
  'msg_123'
);

-- Test check_and_update_ai_usage (check only)
SELECT check_and_update_ai_usage(
  'YOUR_USER_ID'::UUID,
  false
);

-- Test check_and_update_ai_usage (with increment)
SELECT check_and_update_ai_usage(
  'YOUR_USER_ID'::UUID,
  true
);

-- Test get_conversation_with_context
SELECT get_conversation_with_context(
  'YOUR_INSTANCE_ID'::UUID,
  '+1234567890',
  10
);
*/