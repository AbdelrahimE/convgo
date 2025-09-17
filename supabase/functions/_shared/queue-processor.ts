import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  getActiveQueues, 
  getPendingMessages, 
  markMessagesAsProcessing, 
  markMessagesAsCompleted,
  acquireProcessingLock,
  releaseProcessingLock,
  QueueMessage 
} from './redis-queue.ts';

// Import existing processing functions to reuse logic
import { generateAndSendAIResponse } from './ai-response-generator.ts';
import { storeMessageInConversation } from './conversation-storage.ts';
import { checkForDuplicateMessage } from './duplicate-message-detector.ts';
import { getRecentConversationHistory } from './conversation-history.ts';

// Import parallel processing utilities
import { executeSafeParallel, measureTime } from './parallel-queries.ts';

// Import data collection integration
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

// Processing configuration
const PROCESSING_TIMEOUT_MS = 30000;    // 30 seconds max processing time
const MAX_MESSAGES_PER_BATCH = 10;      // Maximum messages to process together

// Processing report interface
export interface ProcessingReport {
  success: boolean;
  processedQueues: number;
  processedMessages: number;
  failedQueues: string[];
  errors: string[];
  processingTime: number;
}

// Initialize Supabase client (will be passed from edge function)
let supabaseAdmin: any = null;
let supabaseUrl: string = '';
let supabaseServiceKey: string = '';

/**
 * Initialize the processor with Supabase credentials
 */
export function initializeProcessor(url: string, serviceKey: string) {
  supabaseUrl = url;
  supabaseServiceKey = serviceKey;
  supabaseAdmin = createClient(url, serviceKey);
}

/**
 * Check if messages should be processed based on timing rules
 */
export function shouldProcessQueue(messages: QueueMessage[]): boolean {
  if (messages.length === 0) return false;
  
  const oldestMessage = messages[0];
  const timeSinceFirst = Date.now() - new Date(oldestMessage.addedAt).getTime();
  
  // الحل الثالث: أولوية مطلقة للـ 8 ثوان
  // أولوية 1: انتظار 8 ثوان دائماً (إلا إذا وصل 5 رسائل)
  if (timeSinceFirst < 8000 && messages.length < 5) {
    logger.debug('⏳ Queue not ready - enforcing 8-second wait', {
      messageCount: messages.length,
      timeSinceFirst,
      remainingTime: 8000 - timeSinceFirst,
      reason: 'waiting_for_8_seconds_or_5_messages'
    });
    return false; // لا تعالج نهائياً
  }

  // أولوية 2: معالجة فقط بعد 8 ثوان أو 5 رسائل
  const shouldProcess = timeSinceFirst >= 8000 || messages.length >= 5;

  if (shouldProcess) {
    logger.debug('✅ Queue ready for processing', {
      messageCount: messages.length,
      timeSinceFirst,
      trigger: timeSinceFirst >= 8000 ? '8_second_timeout' : 'message_count_limit',
      processingReason: messages.length >= 5 ? 'reached_5_messages' : 'completed_8_second_wait'
    });
  }

  return shouldProcess;
}

/**
 * Combine multiple queue messages into a single coherent message
 */
function combineQueueMessages(messages: QueueMessage[]): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0].message;

  // Sort messages by timestamp to ensure correct order
  const sortedMessages = messages
    .filter(msg => msg.message && msg.message.trim().length > 0)
    .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());

  if (sortedMessages.length === 0) return '';
  if (sortedMessages.length === 1) return sortedMessages[0].message;

  // Combine messages with clear separation
  const combinedText = sortedMessages
    .map(msg => msg.message.trim())
    .join(' ');

  logger.info('📝 Combined queue messages', {
    originalCount: messages.length,
    processedCount: sortedMessages.length,
    combinedLength: combinedText.length,
    preview: combinedText.substring(0, 100) + '...'
  });

  return combinedText;
}

/**
 * Find or create conversation for processing
 */
async function findOrCreateConversation(instanceId: string, userPhone: string): Promise<string> {
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
 * Process a single queue for a specific user
 */
async function processSingleQueue(instanceName: string, userPhone: string): Promise<boolean> {
  const processorId = `proc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    logger.info('🔄 Starting queue processing', {
      instanceName,
      userPhone,
      processorId
    });

    // Try to acquire processing lock
    const lockAcquired = await acquireProcessingLock(instanceName, userPhone, processorId);
    if (!lockAcquired) {
      logger.debug('🚫 Queue already being processed, skipping', {
        instanceName,
        userPhone
      });
      return true; // Not an error, just skip
    }

    try {
      // Get pending messages
      const messages = await getPendingMessages(instanceName, userPhone);
      
      if (messages.length === 0) {
        logger.debug('📭 No pending messages in queue', {
          instanceName,
          userPhone
        });
        return true;
      }

      // Check if messages are ready for processing
      if (!shouldProcessQueue(messages)) {
        logger.debug('⏳ Queue not ready for processing yet', {
          instanceName,
          userPhone,
          messageCount: messages.length
        });
        return true;
      }

      // Limit batch size
      const messagesToProcess = messages.slice(0, MAX_MESSAGES_PER_BATCH);
      
      logger.info('📦 Processing message batch', {
        instanceName,
        userPhone,
        messageCount: messagesToProcess.length,
        totalInQueue: messages.length
      });

      // Mark messages as processing
      await markMessagesAsProcessing(messagesToProcess);

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
      const conversationId = await findOrCreateConversation(instanceData.id, userPhone);

      // Combine messages
      const combinedMessage = combineQueueMessages(messagesToProcess);
      
      if (!combinedMessage || combinedMessage.trim().length === 0) {
        logger.warn('⚠️ No valid message content to process', {
          instanceName,
          userPhone,
          messageCount: messagesToProcess.length
        });
        
        // Mark as completed anyway
        await markMessagesAsCompleted(messagesToProcess);
        return true;
      }

      // Check for duplicates
      const isDuplicate = await checkForDuplicateMessage(conversationId, combinedMessage, supabaseAdmin);
      
      if (isDuplicate) {
        logger.info('🔄 Skipping duplicate message', {
          instanceName,
          userPhone,
          messagePreview: combinedMessage.substring(0, 50)
        });
        
        await markMessagesAsCompleted(messagesToProcess);
        return true;
      }

      // Store user message
      await storeMessageInConversation(conversationId, 'user', combinedMessage, `queue_${Date.now()}`, supabaseAdmin);

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
              query: combinedMessage,
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
        combinedMessage,
        context,
        instanceName,
        userPhone,
        instanceBaseUrl,
        aiConfig,
        messagesToProcess[messagesToProcess.length - 1].messageData, // Use latest message data
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
            combinedMessage,
            conversationHistory,
            supabaseUrl,
            supabaseServiceKey
          );
        } catch (extractionError) {
          logger.warn('⚠️ Data extraction failed', {
            error: extractionError.message,
            instanceName,
            userPhone
          });
        }
      }

      // Mark messages as completed
      await markMessagesAsCompleted(messagesToProcess);

      logger.info('✅ Queue processing completed successfully', {
        instanceName,
        userPhone,
        messageCount: messagesToProcess.length,
        aiResponseSuccess
      });

      return aiResponseSuccess;

    } finally {
      // Always release the lock
      await releaseProcessingLock(instanceName, userPhone, processorId);
    }

  } catch (error) {
    logger.error('💥 Exception in queue processing', {
      error: error.message || error,
      instanceName,
      userPhone,
      processorId
    });
    
    // Release lock on error
    await releaseProcessingLock(instanceName, userPhone, processorId);
    return false;
  }
}

/**
 * Process all active queues
 */
export async function processAllQueues(): Promise<ProcessingReport> {
  const startTime = Date.now();
  const report: ProcessingReport = {
    success: true,
    processedQueues: 0,
    processedMessages: 0,
    failedQueues: [],
    errors: [],
    processingTime: 0
  };

  try {
    logger.info('🚀 Starting queue processor');

    if (!supabaseAdmin) {
      throw new Error('Processor not initialized - call initializeProcessor() first');
    }

    // Get all active queues
    const activeQueues = await getActiveQueues();
    
    if (activeQueues.length === 0) {
      logger.debug('📭 No active queues to process');
      report.processingTime = Date.now() - startTime;
      return report;
    }

    logger.info('📋 Processing active queues', {
      queueCount: activeQueues.length,
      queues: activeQueues
    });

    // Process each queue
    for (const queueKey of activeQueues) {
      try {
        // Extract instanceName and userPhone from queue key
        const keyParts = queueKey.split(':');
        if (keyParts.length !== 3 || keyParts[0] !== 'msg_queue') {
          logger.warn('⚠️ Invalid queue key format', { queueKey });
          continue;
        }

        const instanceName = keyParts[1];
        const userPhone = keyParts[2];

        // Get messages to check count
        const messages = await getPendingMessages(instanceName, userPhone);
        if (messages.length === 0) {
          continue; // Skip empty queues
        }

        logger.debug('🔄 Processing queue', {
          queueKey,
          instanceName,
          userPhone,
          messageCount: messages.length
        });

        const success = await processSingleQueue(instanceName, userPhone);
        
        if (success) {
          report.processedQueues++;
          report.processedMessages += messages.length;
        } else {
          report.failedQueues.push(queueKey);
          report.errors.push(`Failed to process queue: ${queueKey}`);
        }

      } catch (queueError) {
        logger.error('💥 Error processing queue', {
          queueKey,
          error: queueError.message || queueError
        });
        
        report.failedQueues.push(queueKey);
        report.errors.push(`Queue processing error: ${queueError.message || queueError}`);
      }
    }

    // Update overall success status
    report.success = report.failedQueues.length === 0;
    report.processingTime = Date.now() - startTime;

    logger.info('🏁 Queue processing completed', {
      success: report.success,
      processedQueues: report.processedQueues,
      processedMessages: report.processedMessages,
      failedQueues: report.failedQueues.length,
      processingTime: report.processingTime
    });

    return report;

  } catch (error) {
    logger.error('💥 Fatal error in processAllQueues', {
      error: error.message || error,
      stack: error.stack
    });

    report.success = false;
    report.errors.push(`Fatal error: ${error.message || error}`);
    report.processingTime = Date.now() - startTime;
    
    return report;
  }
}