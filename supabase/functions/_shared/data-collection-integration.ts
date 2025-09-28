import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Process data extraction for WhatsApp messages
 * This function is called after a message is received to extract structured data
 * Now enhanced with conversation summary for better context understanding
 */
export async function processDataExtraction(
  instanceId: string,
  conversationId: string,
  phoneNumber: string,
  messageText: string,
  conversationHistory: any[],
  conversationSummary: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{
  extracted: boolean;
  responseMessage?: string;
  isComplete?: boolean;
}> {
  try {
    logger.info('🚀 EXTRACT: Starting processDataExtraction', {
      instanceId,
      conversationId,
      phoneNumber,
      messageLength: messageText?.length,
      historyLength: conversationHistory?.length,
      conversationSummaryLength: conversationSummary?.length
    });

    // Skip if no message text
    if (!messageText || messageText.trim().length === 0) {
      logger.warn('⚠️ EXTRACT: No message text, skipping extraction', { messageText });
      return { extracted: false };
    }

    logger.info('📝 EXTRACT: Processing data extraction', {
      instanceId,
      conversationId,
      phoneNumber,
      messagePreview: messageText.substring(0, 100),
      supabaseUrl: supabaseUrl?.substring(0, 30) + '...'
    });

    // Format conversation history for data-extractor (CUSTOMER MESSAGES ONLY for better token efficiency)
    // We only send customer messages since AI responses don't contain extractable customer data
    const formattedConversationHistory = conversationHistory
      ?.filter(msg => msg.role === 'user') // Filter only customer messages
      ?.map(msg => ({
        from: 'customer',
        message: msg.content || msg.message || msg.text || ''
      })) || [];

    const requestBody = {
      whatsapp_instance_id: instanceId,
      conversation_id: conversationId,
      phone_number: phoneNumber,
      message_text: messageText,
      conversation_history: formattedConversationHistory,
      conversation_summary: conversationSummary
    };

    logger.info('📞 EXTRACT: Calling data-extractor function', {
      url: `${supabaseUrl}/functions/v1/data-extractor`,
      requestBody: {
        ...requestBody,
        message_text: requestBody.message_text.substring(0, 100),
        conversation_history: `${formattedConversationHistory?.length} customer messages (filtered)`,
        conversation_summary: requestBody.conversation_summary?.substring(0, 100) + '...'
      },
      debugInfo: {
        fullMessageText: messageText,
        messageLength: messageText?.length,
        originalConversationHistoryCount: conversationHistory?.length,
        filteredCustomerMessagesCount: formattedConversationHistory?.length,
        originalConversationSample: conversationHistory?.slice(-2),
        formattedConversationSample: formattedConversationHistory?.slice(-2),
        hasValidData: !!messageText && messageText.trim().length > 0,
        tokenSavings: `Filtered out ${conversationHistory?.length - formattedConversationHistory?.length} AI messages`
      }
    });

    // Call the data-extractor function
    const response = await fetch(`${supabaseUrl}/functions/v1/data-extractor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    logger.info('📊 EXTRACT: Data-extractor response received', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ EXTRACT: Data extractor function failed', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        instanceId,
        conversationId,
        phoneNumber
      });
      return { extracted: false };
    }

    logger.info('📥 EXTRACT: Parsing response JSON');
    const result = await response.json();
    
    logger.info('✅ EXTRACT: Data extraction result received', {
      extracted: result.extracted,
      isComplete: result.is_complete,
      missingFields: result.missing_fields?.length || 0,
      responseMessage: result.response_message?.substring(0, 100),
      collectedData: result.collected_data || {},
      validationErrors: result.validation_errors || {},
      sessionId: result.session_id,
      fullResult: result,
      rawResponseText: JSON.stringify(result)
    });

    return {
      extracted: result.extracted,
      responseMessage: result.response_message,
      isComplete: result.is_complete
    };
  } catch (error) {
    logger.error('💥 EXTRACT: Exception in data extraction processing', { 
      error: error.message,
      stack: error.stack,
      instanceId,
      conversationId,
      phoneNumber
    });
    return { extracted: false };
  }
}

/**
 * Check if data collection is enabled for a WhatsApp instance
 */
export async function isDataCollectionEnabled(
  instanceId: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    logger.info('🔍 ENABLED CHECK: Starting data collection enabled check', {
      instanceId,
      queryTable: 'whatsapp_ai_config',
      queryColumn: 'whatsapp_instance_id'
    });

    const { data, error } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('enable_data_collection, data_collection_config_id, whatsapp_instance_id')
      .eq('whatsapp_instance_id', instanceId)
      .single();

    logger.info('📊 ENABLED CHECK: Database query result', {
      instanceId,
      hasData: !!data,
      error: error?.message,
      errorCode: error?.code,
      dataResult: data
    });

    if (error) {
      logger.error('❌ ENABLED CHECK: Error checking data collection status', { 
        error: error.message,
        code: error.code,
        details: error.details,
        instanceId 
      });
      return false;
    }

    const isEnabled = data?.enable_data_collection || false;
    logger.info('✅ ENABLED CHECK: Final result', {
      instanceId,
      isEnabled,
      rawValue: data?.enable_data_collection,
      hasConfigId: !!data?.data_collection_config_id
    });

    return isEnabled;
  } catch (error) {
    logger.error('💥 ENABLED CHECK: Exception checking data collection status', { 
      error: error.message,
      stack: error.stack,
      instanceId 
    });
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
    // Only fetch customer messages (role='user') for data extraction efficiency
    // AI responses don't contain extractable customer data and waste tokens
    const { data, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .eq('role', 'user') // Only customer messages for data extraction
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching conversation history for extraction', { error });
      return [];
    }

    // Format customer messages only for data extraction
    return (data || []).reverse().map(msg => ({
      from: 'customer',
      message: msg.content
    }));
  } catch (error) {
    logger.error('Exception fetching conversation history for extraction', { error });
    return [];
  }
}