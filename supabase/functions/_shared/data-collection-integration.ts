import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logger } from './logger.ts';

/**
 * Process data extraction for WhatsApp messages
 * This function is called after a message is received to extract structured data
 */
export async function processDataExtraction(
  instanceName: string,
  conversationId: string,
  phoneNumber: string,
  messageText: string,
  conversationHistory: any[],
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{
  extracted: boolean;
  responseMessage?: string;
  isComplete?: boolean;
}> {
  try {
    // Skip if no message text
    if (!messageText || messageText.trim().length === 0) {
      return { extracted: false };
    }

    logger.info('Processing data extraction', {
      instanceName,
      conversationId,
      phoneNumber,
      messagePreview: messageText.substring(0, 50)
    });

    // Call the data-extractor function
    const response = await fetch(`${supabaseUrl}/functions/v1/data-extractor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsapp_instance_id: instanceName,
        conversation_id: conversationId,
        phone_number: phoneNumber,
        message_text: messageText,
        conversation_history: conversationHistory
      }),
    });

    if (!response.ok) {
      logger.error('Data extractor function failed', {
        status: response.status,
        statusText: response.statusText
      });
      return { extracted: false };
    }

    const result = await response.json();
    
    logger.info('Data extraction result', {
      extracted: result.extracted,
      isComplete: result.is_complete,
      missingFields: result.missing_fields?.length || 0
    });

    return {
      extracted: result.extracted,
      responseMessage: result.response_message,
      isComplete: result.is_complete
    };
  } catch (error) {
    logger.error('Error in data extraction processing', { error });
    return { extracted: false };
  }
}

/**
 * Check if data collection is enabled for a WhatsApp instance
 */
export async function isDataCollectionEnabled(
  instanceName: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('enable_data_collection')
      .eq('whatsapp_instance_id', instanceName)
      .single();

    if (error) {
      logger.error('Error checking data collection status', { error });
      return false;
    }

    return data?.enable_data_collection || false;
  } catch (error) {
    logger.error('Exception checking data collection status', { error });
    return false;
  }
}

/**
 * Merge data collection response with AI response
 */
export function mergeDataCollectionResponse(
  aiResponse: string,
  dataCollectionMessage?: string
): string {
  if (!dataCollectionMessage) {
    return aiResponse;
  }

  // If we have a data collection message, append it to the AI response
  // with a natural separator
  return `${aiResponse}\n\n${dataCollectionMessage}`;
}

/**
 * Get conversation history for data extraction
 */
export async function getConversationHistoryForExtraction(
  conversationId: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  limit: number = 10
): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('sender_phone, message_body, is_from_user')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching conversation history', { error });
      return [];
    }

    // Format for data extraction
    return (data || []).reverse().map(msg => ({
      from: msg.is_from_user ? 'customer' : 'assistant',
      message: msg.message_body
    }));
  } catch (error) {
    logger.error('Exception fetching conversation history', { error });
    return [];
  }
}