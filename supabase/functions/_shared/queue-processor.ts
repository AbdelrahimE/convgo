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

// Import customer profile management
import { CustomerProfileManager } from './customer-profile-manager.ts';
import { SmartCustomerProfileManager } from './smart-customer-profile-manager.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// ===== ESCALATION SYSTEM FUNCTIONS =====

/**
 * Helper function to check if conversation is currently escalated
 */
async function isConversationEscalated(instanceId: string, phoneNumber: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('escalated_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('whatsapp_number', phoneNumber)
      .is('resolved_at', null)
      .single();

    return !error && !!data;
  } catch (error) {
    logger.error('Error checking escalation status:', error);
    return false;
  }
}

/**
 * Helper function to check if message needs escalation (enhanced with AI intent detection)
 */
async function checkEscalationNeeded(
  message: string, 
  phoneNumber: string,
  instanceId: string,
  conversationId: string,
  aiResponseConfidence?: number,
  intentAnalysis?: any
): Promise<{ needsEscalation: boolean; reason: string }> {
  try {
    const escalationTimer = measureTime('Smart escalation check');
    
    // Get instance escalation configuration including separate controls
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('escalation_enabled, escalation_keywords, smart_escalation_enabled, keyword_escalation_enabled')
      .eq('id', instanceId)
      .single();
    
    escalationTimer.end();

    // If escalation is disabled or error, return false
    if (instanceError || !instance?.escalation_enabled) {
      return { needsEscalation: false, reason: '' };
    }

    // 🧠 SMART ESCALATION: Check AI intent analysis (if enabled and available)
    if (instance.smart_escalation_enabled && intentAnalysis?.needsHumanSupport) {
      logger.info('🚨 Smart escalation detected: AI identified human support need', { 
        phoneNumber,
        humanSupportReason: intentAnalysis.humanSupportReason,
        intent: intentAnalysis.intent,
        confidence: intentAnalysis.confidence,
        detectedReason: intentAnalysis.humanSupportReason
      });
      return { needsEscalation: true, reason: 'ai_detected_intent' };
    }

    // 🔑 KEYWORD ESCALATION: Check escalation keywords (if enabled)
    if (instance.keyword_escalation_enabled) {
      const keywords = instance.escalation_keywords || [];
      
      if (keywords && keywords.length > 0) {
        const lowerMessage = message.toLowerCase();
        const hasEscalationKeyword = keywords.some(keyword => 
          lowerMessage.includes(keyword.toLowerCase()) || message.includes(keyword)
        );
        
        if (hasEscalationKeyword) {
          const matchedKeyword = keywords.find(k => lowerMessage.includes(k.toLowerCase()) || message.includes(k));
          logger.info('Escalation needed: User requested human support via keyword', { 
            phoneNumber,
            matchedKeyword,
            configuredKeywords: keywords
          });
          return { needsEscalation: true, reason: 'user_request' };
        }
      }
    }

    // No escalation needed from either method
    logger.debug('No escalation needed', {
      phoneNumber,
      smartEscalationEnabled: instance.smart_escalation_enabled,
      keywordEscalationEnabled: instance.keyword_escalation_enabled,
      smartAnalysisResult: intentAnalysis?.needsHumanSupport || false,
      keywordMatches: false,
      configuredKeywords: instance.escalation_keywords?.length || 0
    });
    
    return { needsEscalation: false, reason: '' };
  } catch (error) {
    logger.error('Error checking escalation need:', error);
    return { needsEscalation: false, reason: '' };
  }
}

/**
 * Helper function to handle escalation (imported from webhook logic)
 */
async function handleEscalation(
  phoneNumber: string,
  instanceId: string,
  reason: string,
  conversationHistory: any[]
): Promise<string> {
  try {
    // Get instance configuration for escalation messages
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('escalation_message, instance_name')
      .eq('id', instanceId)
      .single();

    if (instanceError) {
      logger.error('Error getting instance config for escalation:', instanceError);
      return 'Your conversation has been transferred to our specialized support team.';
    }

    // Send escalation notification with detailed logging
    logger.info('🚨 ESCALATION DEBUG: Starting notification process', {
      phoneNumber,
      instanceId,
      reason,
      conversationHistoryLength: conversationHistory.length,
      timestamp: new Date().toISOString()
    });

    const notificationPayload = {
      customerNumber: phoneNumber,
      instanceId,
      escalationReason: reason,
      conversationContext: conversationHistory.slice(-10)
    };

    logger.info('🚨 ESCALATION DEBUG: Sending notification request', {
      url: `${supabaseUrl}/functions/v1/send-escalation-notification`,
      payload: {
        ...notificationPayload,
        conversationContext: `[${notificationPayload.conversationContext.length} messages]`
      }
    });

    const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-escalation-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(notificationPayload)
    });

    logger.info('🚨 ESCALATION DEBUG: Notification response received', {
      status: notificationResponse.status,
      statusText: notificationResponse.statusText,
      ok: notificationResponse.ok,
      headers: Object.fromEntries(notificationResponse.headers.entries())
    });

    if (!notificationResponse.ok) {
      try {
        const errorText = await notificationResponse.text();
        logger.error('❌ ESCALATION DEBUG: Notification failed with details', {
          status: notificationResponse.status,
          statusText: notificationResponse.statusText,
          errorText,
          requestPayload: notificationPayload
        });
      } catch (textError) {
        logger.error('❌ ESCALATION DEBUG: Notification failed, could not read error text', {
          status: notificationResponse.status,
          statusText: notificationResponse.statusText,
          textError: textError.message
        });
      }
    } else {
      try {
        const responseData = await notificationResponse.json();
        logger.info('✅ ESCALATION DEBUG: Notification successful', {
          responseData,
          escalationId: responseData.escalationId,
          notificationsSent: responseData.message
        });
      } catch (jsonError) {
        logger.warn('⚠️ ESCALATION DEBUG: Notification OK but could not parse response', {
          jsonError: jsonError.message
        });
      }
    }

    return instance.escalation_message || 'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly.';
  } catch (error) {
    logger.error('Error handling escalation:', error);
    return 'Your conversation has been transferred to our specialized support team.';
  }
}

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

      // Enhanced logging for race condition tracking
      const oldestMessage = messages[0];
      const newestMessage = messages[messages.length - 1];
      const timeSinceOldest = Date.now() - new Date(oldestMessage.addedAt).getTime();
      
      logger.info('📋 Queue analysis before processing decision', {
        instanceName,
        userPhone,
        messageCount: messages.length,
        oldestMessageAge: `${Math.round(timeSinceOldest/1000)}s`,
        timeWindow: `${timeSinceOldest}ms since first message`,
        messageTimeRange: `${new Date(oldestMessage.addedAt).toISOString()} to ${new Date(newestMessage.addedAt).toISOString()}`,
        messageIds: messages.map(m => m.id),
        messagePreview: messages.map(m => m.message.substring(0, 30) + '...')
      });

      // Check if messages are ready for processing
      if (!shouldProcessQueue(messages)) {
        const remainingWait = 8000 - timeSinceOldest;
        logger.debug('⏳ Queue not ready for processing yet', {
          instanceName,
          userPhone,
          messageCount: messages.length,
          remainingWaitTime: `${Math.max(0, Math.round(remainingWait/1000))}s`,
          reason: messages.length >= 5 ? 'waiting for more messages' : 'waiting for 8-second window'
        });
        return true;
      }

      // Limit batch size
      const messagesToProcess = messages.slice(0, MAX_MESSAGES_PER_BATCH);
      
      logger.info('📦 Processing message batch - RACE CONDITION CHECKPOINT', {
        instanceName,
        userPhone,
        messageCount: messagesToProcess.length,
        totalInQueue: messages.length,
        processingTrigger: timeSinceOldest >= 8000 ? '8_second_timeout' : 'message_count_limit',
        timeFromFirstMessage: `${Math.round(timeSinceOldest/1000)}s`,
        note: 'About to call markMessagesAsProcessing - any new messages arriving now should be preserved'
      });

      // Mark messages as processing (with enhanced race condition protection)
      await markMessagesAsProcessing(messagesToProcess);
      
      logger.info('✅ Messages successfully marked as processing', {
        instanceName,
        userPhone,
        messageCount: messagesToProcess.length,
        note: 'markMessagesAsProcessing() now preserves any new messages that arrive during processing'
      });

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

      // Get AI configuration (AI status already verified by webhook before queuing)
      const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
        .from('whatsapp_ai_config')
        .select('*')
        .eq('whatsapp_instance_id', instanceData.id)
        .maybeSingle();

      if (aiConfigError || !aiConfig) {
        logger.error('💥 AI config missing for queued message - this should not happen!', { 
          instanceId: instanceData.id, 
          error: aiConfigError,
          note: 'Webhook should have prevented this message from being queued'
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

      // ===== SMART CUSTOMER PROFILE MANAGEMENT =====
      const smartProfileManager = new SmartCustomerProfileManager(supabaseAdmin);
      
      // Get or create customer profile
      const customerProfile = await smartProfileManager.getOrCreateProfile(instanceData.id, userPhone);
      
      // 🚀 SMART BATCHING: Process message with intelligent batching (every 5 messages)
      // This replaces the old extractAndUpdateCustomerInfo + incrementMessageCounters
      await smartProfileManager.processMessage(instanceData.id, userPhone, combinedMessage);
      
      logger.info('📋 Customer profile updated (queue)', {
        userPhone,
        customerName: customerProfile.name || 'Unknown',
        customerStage: customerProfile.customer_stage,
        totalMessages: customerProfile.total_messages + 1,
        messageCount: messagesToProcess.length
      });

      // Get conversation history
      const conversationHistory = await getRecentConversationHistory(conversationId, 800, supabaseAdmin);

      // ===== ESCALATION SYSTEM INTEGRATION =====
      
      // Check if conversation is already escalated
      const isAlreadyEscalated = await isConversationEscalated(instanceData.id, userPhone);
      
      if (isAlreadyEscalated) {
        // Send escalated conversation message
        logger.info('📞 Conversation is already escalated, sending escalated message', {
          userPhone,
          instanceName
        });
        
        const escalatedMessage = instanceData.escalated_conversation_message || 
          'Your conversation has been escalated to our support team. One of our representatives will assist you shortly.';
        
        // Store escalated message
        await storeMessageInConversation(conversationId, 'assistant', escalatedMessage, `escalated_${Date.now()}`, supabaseAdmin);
        
        // Send escalated message via WhatsApp API
        try {
          // Get Evolution API key
          const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messagesToProcess[messagesToProcess.length - 1]?.messageData?.apikey;
          
          if (!evolutionApiKey) {
            logger.error('❌ EVOLUTION_API_KEY not available for escalated message');
            return;
          }

          const webhookConfig = await supabaseAdmin
            .from('whatsapp_webhook_config')
            .select('webhook_url')
            .eq('whatsapp_instance_id', instanceData.id)
            .maybeSingle();

          let instanceBaseUrl = '';
          if (webhookConfig?.data?.webhook_url) {
            const url = new URL(webhookConfig.data.webhook_url);
            instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          } else {
            instanceBaseUrl = 'https://api.convgo.com';
          }

          const sendResponse = await fetch(`${instanceBaseUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey
            },
            body: JSON.stringify({
              number: userPhone,
              text: escalatedMessage
            })
          });

          if (sendResponse.ok) {
            logger.info('✅ Escalated message sent successfully');
          } else {
            logger.error('❌ Failed to send escalated message', {
              status: sendResponse.status,
              statusText: sendResponse.statusText
            });
          }
        } catch (sendError) {
          logger.error('❌ Error sending escalated message', { error: sendError.message });
        }
        
        // Mark messages as completed and return
        await markMessagesAsCompleted(messagesToProcess);
        return;
      }

      // Check if message needs escalation (Smart AI + Keyword detection)
      let intentAnalysis: any = null;
      
      // Perform intent analysis for smart escalation
      try {
        const intentResponse = await fetch(`${supabaseUrl}/functions/v1/smart-intent-analyzer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            message: combinedMessage,
            whatsappInstanceId: instanceData.id,
            conversationHistory: conversationHistory
          })
        });

        if (intentResponse.ok) {
          intentAnalysis = await intentResponse.json();
          logger.info('🧠 Intent analysis completed', {
            userPhone,
            hasIntentAnalysis: !!intentAnalysis,
            needsHumanSupport: intentAnalysis?.needsHumanSupport || false,
            hasSelectedPersonality: !!intentAnalysis?.selectedPersonality,
            selectedPersonalityName: intentAnalysis?.selectedPersonality?.name || 'none'
          });
          
          // ✅ UPDATE aiConfig with smart intent analysis results
          if (intentAnalysis?.selectedPersonality) {
            logger.info('🎯 Using smart personality from intent analysis', {
              personalityId: intentAnalysis.selectedPersonality.id,
              personalityName: intentAnalysis.selectedPersonality.name,
              detectedIntent: intentAnalysis.intent,
              confidence: intentAnalysis.confidence
            });
            
            // Update aiConfig with personality information
            aiConfig.selectedPersonalityId = intentAnalysis.selectedPersonality.id;
            aiConfig.selectedPersonalityName = intentAnalysis.selectedPersonality.name;
            aiConfig.detectedIntent = intentAnalysis.intent;
            aiConfig.intentConfidence = intentAnalysis.confidence;
            
            // Update system prompt with personality system prompt if available
            if (intentAnalysis.selectedPersonality.system_prompt) {
              aiConfig.system_prompt = intentAnalysis.selectedPersonality.system_prompt;
              logger.info('📝 Updated system prompt with personality prompt', {
                personalityId: intentAnalysis.selectedPersonality.id,
                promptLength: intentAnalysis.selectedPersonality.system_prompt.length
              });
            }
            
            // Add emotion analysis, customer journey, and product interest
            aiConfig.emotionAnalysis = intentAnalysis.emotionAnalysis;
            aiConfig.customerJourney = intentAnalysis.customerJourney;
            aiConfig.productInterest = intentAnalysis.productInterest;
          }
        }
      } catch (intentError) {
        logger.warn('⚠️ Intent analysis failed, continuing without smart escalation', {
          error: intentError.message
        });
      }

      // Check for escalation needs
      const escalationCheck = await checkEscalationNeeded(
        combinedMessage,
        userPhone,
        instanceData.id,
        conversationId,
        undefined, // aiResponseConfidence - not needed here
        intentAnalysis
      );

      if (escalationCheck.needsEscalation) {
        logger.info('🚨 ESCALATION TRIGGERED', {
          phoneNumber: userPhone,
          detectionMethod: escalationCheck.reason === 'ai_detected_intent' ? 'Smart AI Detection' : 'Keyword Matching'
        });

        // Handle escalation and get escalation message
        const escalationMessage = await handleEscalation(
          userPhone,
          instanceData.id,
          escalationCheck.reason,
          conversationHistory
        );

        // Store escalation message
        await storeMessageInConversation(conversationId, 'assistant', escalationMessage, `escalation_${Date.now()}`, supabaseAdmin);

        // Send escalation message via WhatsApp API
        try {
          // Get Evolution API key
          const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messagesToProcess[messagesToProcess.length - 1]?.messageData?.apikey;
          
          if (!evolutionApiKey) {
            logger.error('❌ EVOLUTION_API_KEY not available for escalation message');
            // Mark messages as completed and return
            await markMessagesAsCompleted(messagesToProcess);
            return;
          }

          const webhookConfig = await supabaseAdmin
            .from('whatsapp_webhook_config')
            .select('webhook_url')
            .eq('whatsapp_instance_id', instanceData.id)
            .maybeSingle();

          let instanceBaseUrl = '';
          if (webhookConfig?.data?.webhook_url) {
            const url = new URL(webhookConfig.data.webhook_url);
            instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          } else {
            instanceBaseUrl = 'https://api.convgo.com';
          }

          const sendResponse = await fetch(`${instanceBaseUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey
            },
            body: JSON.stringify({
              number: userPhone,
              text: escalationMessage
            })
          });

          if (sendResponse.ok) {
            logger.info('✅ Escalation message sent successfully');
          } else {
            logger.error('❌ Failed to send escalation message', {
              status: sendResponse.status,
              statusText: sendResponse.statusText
            });
          }
        } catch (sendError) {
          logger.error('❌ Error sending escalation message', { error: sendError.message });
        }
        
        // Mark messages as completed and return
        await markMessagesAsCompleted(messagesToProcess);
        return;
      }

      // No escalation needed, continue with normal AI processing
      logger.info('✅ No escalation needed, proceeding with AI response', {
        userPhone,
        smartAnalysisResult: intentAnalysis?.needsHumanSupport || false,
        keywordMatch: false
      });

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
        instanceBaseUrl = 'https://api.convgo.com'; // Default
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

      // ===== ENHANCE CONTEXT WITH SMART CUSTOMER PROFILE =====
      
      // Get enhanced customer profile context with improved conversation_summary
      const customerProfileContext = await smartProfileManager.getEnhancedContext(instanceData.id, userPhone, combinedMessage);
      
      // Combine all context sources
      if (customerProfileContext) {
        if (context) {
          context = `CUSTOMER PROFILE:\n${customerProfileContext}\n\n${context}`;
        } else {
          // If no RAG context, use conversation history + customer profile
          const conversationContext = conversationHistory
            .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n');
          
          context = conversationContext ? 
            `CUSTOMER PROFILE:\n${customerProfileContext}\n\nCONVERSATION HISTORY:\n${conversationContext}` : 
            `CUSTOMER PROFILE:\n${customerProfileContext}`;
        }
        
        logger.debug('Enhanced context with customer profile (queue)', {
          userPhone,
          customerName: customerProfile.name || 'Unknown',
          contextLength: context.length
        });
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

      // Extract processed image URL from latest message data if available
      const latestMessageData = messagesToProcess[messagesToProcess.length - 1].messageData;
      const imageUrl = latestMessageData?.processedImageUrl || null;
      
      // Generate and send AI response
      const aiResponseSuccess = await generateAndSendAIResponse(
        combinedMessage,
        context,
        instanceName,
        userPhone,
        instanceBaseUrl,
        aiConfig,
        latestMessageData, // Use latest message data
        conversationId,
        supabaseUrl,
        supabaseServiceKey,
        imageUrl, // Pass processed image URL
        dataCollectionFields
      );

      // Process data extraction if enabled
      if (dataCollectionEnabled && dataCollectionFields.length > 0) {
        try {
          // Get conversation summary from customer profile for enhanced data extraction
          const conversationSummary = customerProfile.conversation_summary || '';
          
          await processDataExtraction(
            instanceData.id,
            conversationId,
            userPhone,
            combinedMessage,
            conversationHistory,
            conversationSummary, // Add conversation summary for context
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
    
    // ⚠️ CRITICAL FIX: Clean up any messages that might be stuck in processing state
    try {
      const stuckMessages = await getPendingMessages(instanceName, userPhone);
      const processingMessages = stuckMessages.filter(msg => msg.status === 'processing');
      
      if (processingMessages.length > 0) {
        logger.warn('🔄 Cleaning up stuck messages after error', {
          instanceName,
          userPhone,
          stuckMessageCount: processingMessages.length,
          messageIds: processingMessages.map(m => m.id)
        });
        
        // Mark stuck messages as completed to clean them up
        await markMessagesAsCompleted(processingMessages);
      }
    } catch (cleanupError) {
      logger.error('💥 Failed to cleanup stuck messages after error', {
        error: cleanupError.message || cleanupError,
        instanceName,
        userPhone
      });
    }
    
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