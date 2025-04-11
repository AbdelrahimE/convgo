
-- Create a function to process message batches with a transaction
CREATE OR REPLACE FUNCTION process_message_batch(
  p_conversation_id UUID,
  p_timestamp_threshold TIMESTAMPTZ
) 
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  batch_messages jsonb;
  user_phone text;
BEGIN
  -- Start a transaction
  BEGIN
    -- Lock the messages to prevent race conditions
    -- Get the messages that need processing
    WITH messages_to_process AS (
      SELECT id, content, message_id, timestamp
      FROM whatsapp_conversation_messages
      WHERE conversation_id = p_conversation_id
        AND role = 'user'
        AND processed = false
        AND timestamp < p_timestamp_threshold
      ORDER BY timestamp ASC
      FOR UPDATE -- This locks the rows
    ),
    update_processed AS (
      -- Mark the messages as processed
      UPDATE whatsapp_conversation_messages
      SET processed = true
      FROM messages_to_process
      WHERE whatsapp_conversation_messages.id = messages_to_process.id
      RETURNING whatsapp_conversation_messages.id, whatsapp_conversation_messages.content, 
                whatsapp_conversation_messages.message_id, whatsapp_conversation_messages.timestamp
    )
    -- Collect the processed messages
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'content', content,
          'message_id', message_id,
          'timestamp', timestamp
        )
      ) INTO batch_messages
    FROM update_processed;
    
    -- Get the user phone from the conversation
    SELECT uc.user_phone INTO user_phone
    FROM whatsapp_conversations uc
    WHERE uc.id = p_conversation_id;
    
    -- Commit the transaction if we found messages
    IF batch_messages IS NOT NULL AND jsonb_array_length(batch_messages) > 0 THEN
      -- Return the results
      RETURN jsonb_build_object(
        'success', true,
        'messages', batch_messages,
        'user_phone', user_phone
      );
    ELSE
      -- Return empty result if no messages found
      RETURN jsonb_build_object(
        'success', false,
        'messages', '[]'::jsonb,
        'user_phone', user_phone
      );
    END IF;
  END;
END;
$$;
