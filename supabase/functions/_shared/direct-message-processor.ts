import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndSendAIResponse } from './ai-response-generator.ts';
import { storeMessageInConversation } from './conversation-storage.ts';
import { checkForDuplicateMessage } from './duplicate-message-detector.ts';
import { getRecentConversationHistory } from './conversation-history.ts';
import { 
  isDataCollectionEnabled, 
  processDataExtraction
} from './data-collection-integration.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Find or create conversation for direct processing
 */
async function findOrCreateConversation(
  instanceId: string, 
  userPhone: string, 
  supabaseAdmin: any
): Promise<string> {
  try {
    // First try to find existing active conversation
    const { data: existingConversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, status, last_activity')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .eq('status', 'active')
      .single();

    if (!findError && existingConversation) {
      // Check if conversation is still active (within 6 hours)
      const lastActivity = new Date(existingConversation.last_activity);
      const currentTime = new Date();
      const hoursDifference = (currentTime.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursDifference <= 6) {
        return existingConversation.id;
      }
    }

    // Try to find any conversation and reactivate it
    const { data: inactiveConversation, error: inactiveError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .limit(1)
      .single();
      
    if (!inactiveError && inactiveConversation) {
      // Update to active
      const { data: updatedConversation, error: updateError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          status: 'active',
          last_activity: new Date().toISOString()
        })
        .eq('id', inactiveConversation.id)
        .select('id')
        .single();
        
      if (!updateError) {
        return updatedConversation.id;
      }
    }

    // Create new conversation
    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        user_phone: userPhone,
        status: 'active'
      })
      .select('id')
      .single();

    if (createError) throw createError;
    
    return newConversation.id;
  } catch (error) {
    logger.error('💥 Error in findOrCreateConversation:', error);
    throw error;
  }
}

/**
 * Process message directly without buffering (fallback mechanism)
 * This function replicates the core logic from the buffering system
 * but processes messages immediately
 */
export async function processMessageDirectly(
  instanceName: string,
  messageData: any,
  supabaseAdmin: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  try {
    const userPhone = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    
    if (!userPhone) {
      logger.error('❌ Cannot process message: missing user phone');
      return false;
    }

    logger.info('🚀 Starting direct message processing (fallback)', {
      instanceName,
      userPhone,
      messageId: messageData.key?.id
    });

    // Extract message text
    const messageText = messageData.message?.conversation || 
                       messageData.message?.extendedTextMessage?.text ||
                       '[Media Message]';

    if (!messageText || messageText.trim().length === 0) {
      logger.warn('⚠️ Message has no text content, skipping processing');
      return true; // Not an error, just skip
    }

    // Get instance data
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status, escalation_enabled, escalated_conversation_message')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.error('❌ Instance not found', { instanceName, error: instanceError });
      return false;
    }

    // Get AI configuration
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceData.id)
      .eq('is_active', true)
      .maybeSingle();

    if (aiConfigError || !aiConfig) {
      logger.warn('⚠️ AI not enabled for this instance', { 
        instanceId: instanceData.id, 
        error: aiConfigError 
      });
      return false;
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, userPhone, supabaseAdmin);

    // Check for duplicates
    const isDuplicate = await checkForDuplicateMessage(conversationId, messageText, supabaseAdmin);
    
    if (isDuplicate) {
      logger.info('🔄 Skipping duplicate message', {
        instanceName,
        userPhone,
        messagePreview: messageText.substring(0, 50)
      });
      return true;
    }

    // Store user message
    await storeMessageInConversation(conversationId, 'user', messageText, `direct_${Date.now()}`, supabaseAdmin);

    // Get conversation history
    const conversationHistory = await getRecentConversationHistory(conversationId, 800, supabaseAdmin);

    // Get webhook config for instance base URL
    const { data: webhookConfig } = await supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('webhook_url')
      .eq('whatsapp_instance_id', instanceData.id)
      .maybeSingle();

    let instanceBaseUrl = '';
    if (webhookConfig?.webhook_url) {
      const url = new URL(webhookConfig.webhook_url);
      instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    } else {
      instanceBaseUrl = 'https://api.botifiy.com'; // Default
    }

    // Get files for RAG
    const { data: fileMappings } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceData.id);

    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];

    // Perform semantic search if files exist
    let context = '';
    if (fileIds.length > 0) {
      try {
        const searchResponse = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            query: messageText,
            fileIds,
            limit: 5,
            threshold: 0.1
          })
        });

        if (searchResponse.ok) {
          const searchResults = await searchResponse.json();
          if (searchResults.success && searchResults.results?.length > 0) {
            const ragContext = searchResults.results
              .slice(0, 3)
              .map((result: any, index: number) => {
                const qualityIndicator = result.similarity >= 0.5 ? 'GOOD MATCH' : 
                                        result.similarity >= 0.3 ? 'MODERATE MATCH' : 'WEAK MATCH';
                return `DOCUMENT ${index + 1} (${qualityIndicator} - similarity: ${result.similarity.toFixed(3)}):\n${result.content.trim()}`;
              })
              .join('\n\n---\n\n');

            const conversationContext = conversationHistory
              .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
              .join('\n\n');

            context = conversationContext ? 
              `${conversationContext}\n\nRELEVANT INFORMATION:\n${ragContext}` : 
              `RELEVANT INFORMATION:\n${ragContext}`;
          }
        }
      } catch (searchError) {
        logger.warn('⚠️ Semantic search failed, continuing without context', {
          error: searchError.message
        });
      }
    }

    // Get data collection fields if enabled
    let dataCollectionFields: any[] = [];
    const dataCollectionEnabled = await isDataCollectionEnabled(instanceData.id, supabaseAdmin);
    
    if (dataCollectionEnabled) {
      const { data: fields } = await supabaseAdmin
        .from('data_collection_fields')
        .select('field_name, field_display_name, field_type, is_required')
        .eq('config_id', aiConfig.data_collection_config_id)
        .eq('is_active', true)
        .order('field_order');
      
      dataCollectionFields = fields || [];
    }

    // Generate and send AI response
    const aiResponseSuccess = await generateAndSendAIResponse(
      messageText,
      context,
      instanceName,
      userPhone,
      instanceBaseUrl,
      aiConfig,
      messageData,
      conversationId,
      supabaseUrl,
      supabaseServiceKey,
      null, // No image URL
      dataCollectionFields
    );

    // Process data extraction if enabled
    if (dataCollectionEnabled && dataCollectionFields.length > 0) {
      try {
        await processDataExtraction(
          instanceData.id,
          conversationId,
          userPhone,
          messageText,
          conversationHistory,
          supabaseUrl,
          supabaseServiceKey
        );
      } catch (extractionError) {
        logger.warn('⚠️ Data extraction failed in direct processing', {
          error: extractionError.message,
          instanceName,
          userPhone
        });
      }
    }

    logger.info('✅ Direct message processing completed', {
      instanceName,
      userPhone,
      aiResponseSuccess,
      messagePreview: messageText.substring(0, 50)
    });

    return aiResponseSuccess;

  } catch (error) {
    logger.error('💥 Exception in direct message processing', {
      error: error.message || error,
      instanceName,
      userPhone: messageData.key?.remoteJid?.replace('@s.whatsapp.net', ''),
      stack: error.stack
    });
    return false;
  }
}