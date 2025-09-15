import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  getBufferedMessages, 
  markBufferAsProcessed, 
  combineBufferedMessages 
} from '../_shared/message-buffer.ts';

// Import existing processing functions to reuse logic
import { generateAndSendAIResponse } from '../_shared/ai-response-generator.ts';
import { storeMessageInConversation } from '../_shared/conversation-storage.ts';
import { checkForDuplicateMessage } from '../_shared/duplicate-message-detector.ts';
import { getRecentConversationHistory } from '../_shared/conversation-history.ts';

// Import parallel processing utilities
import { executeParallel, executeSafeParallel, measureTime } from '../_shared/parallel-queries.ts';

// Import data collection integration
import { 
  isDataCollectionEnabled, 
  processDataExtraction, 
  getConversationHistoryForExtraction,
  mergeDataCollectionResponse 
} from '../_shared/data-collection-integration.ts';

// Helper function to check if conversation is currently escalated
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

// Helper function to check if message needs escalation (enhanced with AI intent detection)
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

// Helper function to handle escalation (imported from webhook logic)
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

/**
 * Simple template engine for External Actions V2
 * Processes template strings with variable replacements
 */
function processTemplate(template: string, variables: Record<string, any>): string {
  let processed = template;
  
  // Replace {variable_name} with actual values
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    processed = processed.replace(regex, variables[key] || '');
  });
  
  // Clean up any remaining unmatched variables
  processed = processed.replace(/\{[^}]+\}/g, '');
  
  return processed;
}

/**
 * Create pending response record for wait_for_webhook actions
 */
async function createPendingResponse(data: {
  execution_log_id: string;
  conversation_id: string;
  user_phone: string;
  instance_name: string;
  expires_at: Date;
}) {
  try {
    const { error } = await supabaseAdmin
      .from('external_action_responses')
      .insert({
        execution_log_id: data.execution_log_id,
        conversation_id: data.conversation_id,
        user_phone: data.user_phone,
        instance_name: data.instance_name,
        expires_at: data.expires_at.toISOString()
      });

    if (error) {
      logger.error('Failed to create pending response record:', error);
      throw error;
    }

    logger.info('✅ Created pending response record:', {
      execution_log_id: data.execution_log_id,
      user_phone: data.user_phone,
      expires_at: data.expires_at.toISOString()
    });
  } catch (error) {
    logger.error('Exception creating pending response:', error);
    throw error;
  }
}

/**
 * Send confirmation message helper function for External Actions V2
 */
async function sendConfirmationMessage(
  message: string, 
  userPhone: string, 
  instanceName: string, 
  instanceBaseUrl: string, 
  conversationId: string,
  messageType: string
) {
  const sendMessageUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
  const sendMessagePayload = {
    number: userPhone,
    text: message
  };
  
  logger.info(`📤 Sending ${messageType} External Action message:`, {
    sendMessageUrl,
    userPhone,
    messageType,
    messagePreview: message.substring(0, 100)
  });
  
  try {
    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('EVOLUTION_API_KEY') || ''
      },
      body: JSON.stringify(sendMessagePayload)
    });
    
    if (response.ok) {
      logger.info(`✅ ${messageType} External Action message sent successfully`);
      // Store the confirmation message in conversation
      await storeMessageInConversation(conversationId, 'assistant', message, `external_action_${messageType}_${Date.now()}`, supabaseAdmin);
    } else {
      const errorText = await response.text();
      logger.error(`❌ Failed to send ${messageType} External Action message:`, {
        status: response.status,
        error: errorText,
        sendMessageUrl,
        userPhone
      });
    }
  } catch (sendError) {
    logger.error(`Exception sending ${messageType} External Action message:`, {
      error: sendError.message || sendError,
      sendMessageUrl,
      userPhone
    });
  }
}

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Default API URL for WhatsApp API
const DEFAULT_EVOLUTION_API_URL = 'https://api.botifiy.com';

/**
 * Find or create conversation (reused from existing logic)
 */
async function findOrCreateConversation(instanceId: string, userPhone: string) {
  try {
    // First try to find existing conversation
    const { data: existingConversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, status, last_activity')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .eq('status', 'active')
      .single();

    if (!findError && existingConversation) {
      // Check if the conversation has been inactive for more than 6 hours
      const lastActivity = new Date(existingConversation.last_activity);
      const currentTime = new Date();
      const hoursDifference = (currentTime.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursDifference <= 6) {
        return existingConversation.id;
      }
    }

    // Try to find any conversation with this instance and phone
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
    logger.error('Error in findOrCreateConversation:', error);
    throw error;
  }
}

/**
 * Process buffered messages for a specific user
 */
async function processBufferedMessagesForUser(instanceName: string, userPhone: string): Promise<boolean> {
  try {
    logger.info('Starting buffered message processing', {
      instanceName,
      userPhone
    });

    // Get buffered messages
    const { buffer, success: bufferRetrievalSuccess } = await getBufferedMessages(instanceName, userPhone);
    
    if (!bufferRetrievalSuccess) {
      logger.error('Failed to retrieve buffered messages');
      return false;
    }

    if (!buffer || buffer.messages.length === 0) {
      logger.info('No messages to process in buffer');
      return true;
    }

    // Get instance data (including escalation configuration)
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status, escalation_enabled, escalated_conversation_message')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.error('Instance not found', { instanceName, error: instanceError });
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
      logger.warn('AI not enabled for this instance', { 
        instanceId: instanceData.id, 
        error: aiConfigError 
      });
      return false;
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, userPhone);

    // Combine all buffered messages into a single message
    const combinedMessage = combineBufferedMessages(buffer.messages);
    
    // Extract message IDs for external action logging
    const messageIds = buffer.messages.map(msg => msg.messageId);
    
    if (!combinedMessage || combinedMessage.trim().length === 0) {
      logger.warn('No valid message content to process');
      await markBufferAsProcessed(instanceName, userPhone);
      return true;
    }

    logger.info('Processing combined message', {
      originalMessageCount: buffer.messages.length,
      combinedLength: combinedMessage.length,
      preview: combinedMessage.substring(0, 100) + '...'
    });

    // Phase 1: Execute initial checks and data fetching in parallel
    const parallelTimer = measureTime('Initial parallel queries');
    
    // Prepare parallel queries
    const duplicateCheckPromise = checkForDuplicateMessage(conversationId, combinedMessage, supabaseAdmin);
    const conversationHistoryPromise = getRecentConversationHistory(conversationId, 800, supabaseAdmin);
    
    // Webhook config query (only if needed)
    const latestMessageData = buffer.messages[buffer.messages.length - 1]?.messageData;
    const webhookConfigPromise = !latestMessageData?.server_url
      ? supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('webhook_url')
          .eq('whatsapp_instance_id', instanceData.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    
    // Escalation check (only if enabled)
    const escalationCheckPromise = instanceData.escalation_enabled
      ? isConversationEscalated(instanceData.id, userPhone)
      : Promise.resolve(false);
    
    // Execute all queries in parallel with safe defaults
    const [isDuplicate, conversationHistory, webhookConfigResult, isEscalated] = await executeSafeParallel(
      [duplicateCheckPromise, conversationHistoryPromise, webhookConfigPromise, escalationCheckPromise],
      [false, [], { data: null, error: null }, false],
      ['Duplicate Check', 'Conversation History', 'Webhook Config', 'Escalation Check']
    );
    
    parallelTimer.end();
    
    // Process duplicate check result
    if (isDuplicate) {
      logger.info('Skipping: Combined message is duplicate');
      await markBufferAsProcessed(instanceName, userPhone);
      return true;
    }

    // Store the combined user message
    await storeMessageInConversation(conversationId, 'user', combinedMessage, `buffered_${Date.now()}`, supabaseAdmin);

    // Log conversation history info
    logger.info('Retrieved conversation history', { 
      messageCount: conversationHistory.length,
      estimatedTokens: conversationHistory.reduce((sum, msg) => sum + Math.ceil(msg.content.length * 0.25), 0)
    });

    // Determine instance base URL early (needed for escalation message sending)
    let instanceBaseUrl = '';
    
    if (latestMessageData?.server_url) {
      instanceBaseUrl = latestMessageData.server_url;
    } else {
      const { data: webhookConfig } = webhookConfigResult;
        
      if (webhookConfig?.webhook_url) {
        const url = new URL(webhookConfig.webhook_url);
        instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
      } else {
        instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      }
    }

    // Check if conversation is already escalated (before checking for new escalation)
    if (instanceData.escalation_enabled) {
      if (isEscalated) {
        logger.info('Conversation is already escalated, sending escalated conversation message', { 
          userPhone,
          instanceId: instanceData.id
        });
        
        // Send escalated conversation message
        const escalatedMessage = instanceData.escalated_conversation_message || 
          'Your conversation is under review by our support team. We will contact you soon.';
        
        // Check if we already sent this message recently (within last 5 minutes)
        // Note: This query is kept sequential as it depends on escalatedMessage value
        const { data: recentMessages } = await supabaseAdmin
          .from('whatsapp_messages')
          .select('content, created_at')
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'assistant')
          .eq('content', escalatedMessage)
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(1);

        if (!recentMessages || recentMessages.length === 0) {
          // Send the escalated message only if not sent recently
          if (instanceBaseUrl) {
            const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
            
            logger.info('Sending escalated conversation message', {
              sendUrl,
              userPhone,
              escalatedMessage: escalatedMessage.substring(0, 100) + '...'
            });
            
            try {
              const response = await fetch(sendUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': Deno.env.get('EVOLUTION_API_KEY') || latestMessageData?.apikey
                },
                body: JSON.stringify({
                  number: userPhone,
                  text: escalatedMessage
                })
              });

              if (!response.ok) {
                const errorText = await response.text();
                logger.error('Failed to send escalated conversation message', {
                  status: response.status,
                  statusText: response.statusText,
                  error: errorText,
                  sendUrl
                });
              } else {
                const responseData = await response.json();
                logger.info('Successfully sent escalated conversation message', {
                  userPhone,
                  responseData
                });
              }
            } catch (error) {
              logger.error('Exception sending escalated conversation message', {
                error: error.message || error,
                sendUrl,
                userPhone
              });
            }
          } else {
            logger.error('Cannot send escalated message: instanceBaseUrl is empty', {
              instanceName,
              userPhone,
              escalatedMessage: escalatedMessage.substring(0, 50) + '...'
            });
          }
          
          // Store the message regardless of send success
          await storeMessageInConversation(conversationId, 'assistant', escalatedMessage, null, supabaseAdmin);
        }
        
        // Mark buffer as processed and skip AI processing
        await markBufferAsProcessed(instanceName, userPhone);
        return true;
      }
    }

    // Note: Smart escalation check moved after intent analysis to avoid reference error

    // Get files for RAG
    const { data: fileMappings } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceData.id);

    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];

    // SMART: Smart Intent Classification with 99% Accuracy
    let intentClassification = null;
    let selectedPersonality = null;
    
    // Check if personality system is enabled for this instance
    // Note: Intent Recognition is permanently enabled, so we only check use_personality_system
    const personalitySystemEnabled = aiConfig.use_personality_system;
    
    if (personalitySystemEnabled && combinedMessage) {
      logger.info('Starting smart intent classification', { 
        userQuery: combinedMessage,
        instanceId: instanceData.id,
        systemVersion: 'smart-v1.0'
      });
      
      // Get conversation history for context-aware analysis
      const contextualHistory = conversationHistory.map(msg => msg.content).slice(-10);
      
      try {
        // Use the new smart intent analyzer
        const intentResponse = await fetch(`${supabaseUrl}/functions/v1/smart-intent-analyzer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            message: combinedMessage,
            whatsappInstanceId: instanceData.id,
            userId: aiConfig.user_id,
            conversationHistory: contextualHistory,
            useCache: true // تفعيل الكاش لتوفير الوقت والتكلفة
          })
        });

        if (intentResponse.ok) {
          intentClassification = await intentResponse.json();
          // FIX: دعم الحقلين لضمان التوافق
          selectedPersonality = (intentClassification as any)?.selectedPersonality || (intentClassification as any)?.selected_personality;
          
          logger.info('Smart intent classification completed', {
            intent: (intentClassification as any)?.intent,
            confidence: (intentClassification as any)?.confidence,
            businessType: (intentClassification as any)?.businessContext?.industry,
            communicationStyle: (intentClassification as any)?.businessContext?.communicationStyle,
            hasPersonality: !!selectedPersonality,
            selectedPersonalityName: (selectedPersonality as any)?.name || 'none',
            selectedPersonalityId: (selectedPersonality as any)?.id || 'none',
            processingTime: (intentClassification as any)?.processingTimeMs,
            reasoning: (intentClassification as any)?.reasoning
          });
        } else {
          const errorText = await intentResponse.text();
          logger.warn('Smart intent classification failed, falling back to enhanced classifier', {
            status: intentResponse.status,
            error: errorText
          });
        
          // Fallback to enhanced classifier
          try {
            const fallbackResponse = await fetch(`${supabaseUrl}/functions/v1/enhanced-intent-classifier`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                message: combinedMessage,
                whatsappInstanceId: instanceData.id,
                userId: aiConfig.user_id,
                useCache: true,
                contextualHistory: contextualHistory.slice(-5),
                useAdvancedAnalysis: true
              })
            });
            
            if (fallbackResponse.ok) {
              intentClassification = await fallbackResponse.json();
              selectedPersonality = (intentClassification as any)?.selected_personality;
              logger.info('Fallback to enhanced classifier successful', {
                selectedPersonalityName: (selectedPersonality as any)?.name || 'none',
                selectedPersonalityId: (selectedPersonality as any)?.id || 'none'
              });
            }
          } catch (fallbackError) {
            logger.error('All intent classification methods failed', {
              error: fallbackError.message
            });
          }
        }
      } catch (error) {
        logger.error('Exception during smart intent classification', {
          error: error.message
        });
      }
    }

    // 🚀 EXTERNAL ACTION HANDLING: Check if an external action was triggered
    if (intentClassification && (intentClassification as any)?.intent === 'external_action') {
      const externalActionData = (intentClassification as any)?.externalAction;
      
      if (externalActionData) {
        logger.info('🎯 External Action Triggered - Executing webhook:', {
          actionId: externalActionData.id,
          actionName: externalActionData.name,
          displayName: externalActionData.displayName,
          extractedVariables: externalActionData.extractedVariables,
          conversationId,
          messageId: messageIds[0]
        });
        
        try {
          // Call external-action-executor
          const executorResponse = await fetch(`${supabaseUrl}/functions/v1/external-action-executor`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              externalActionId: externalActionData.id,
              extractedVariables: externalActionData.extractedVariables,
              whatsappConversationId: conversationId,
              whatsappMessageId: messageIds[0],
              intentConfidence: (intentClassification as any)?.confidence || 0
            })
          });
          
          if (executorResponse.ok) {
            const executionResult = await executorResponse.json();
            logger.info('✅ External Action executed successfully:', {
              actionName: executionResult.actionName,
              success: executionResult.success,
              httpStatusCode: executionResult.httpStatusCode,
              executionTime: executionResult.executionTimeMs,
              retryCount: executionResult.retryCount
            });
            
            // 🚀 EXTERNAL ACTIONS V2: Handle flexible response types
            try {
              // Get action configuration to determine response type
              const { data: actionConfig, error: configError } = await supabaseAdmin
                .from('external_actions')
                .select('response_type, confirmation_message, response_timeout_seconds')
                .eq('id', externalActionData.id)
                .single();

              let responseType: string;
              let confirmationMessage: string;
              let timeoutSeconds: number;

              if (configError) {
                logger.error('Failed to get action config for response handling:', configError);
                // Fallback to simple confirmation
                responseType = 'simple_confirmation';
                confirmationMessage = '✅ Data received and sent successfully!\nThank you.';
                timeoutSeconds = 30;
              } else {
                responseType = actionConfig.response_type || 'simple_confirmation';
                confirmationMessage = actionConfig.confirmation_message || '✅ Data received and sent successfully!\nThank you.';
                timeoutSeconds = actionConfig.response_timeout_seconds || 30;
              }

              logger.info('📋 Processing External Action response based on type:', {
                responseType,
                actionId: externalActionData.id,
                actionName: externalActionData.displayName,
                hasCustomMessage: !!actionConfig?.confirmation_message,
                timeoutSeconds
              });

              // Handle different response types
              switch (responseType) {
                case 'none':
                  logger.info('🔇 No response configured - External Action completed silently');
                  break;
                  
                case 'simple_confirmation':
                  await sendConfirmationMessage(confirmationMessage, userPhone, instanceName, instanceBaseUrl, conversationId, 'simple');
                  break;
                  
                case 'custom_message':
                  const processedMessage = processTemplate(confirmationMessage, externalActionData.extractedVariables);
                  logger.info('🔄 Template processed:', {
                    originalTemplate: confirmationMessage.substring(0, 100),
                    processedMessage: processedMessage.substring(0, 100),
                    variables: Object.keys(externalActionData.extractedVariables)
                  });
                  await sendConfirmationMessage(processedMessage, userPhone, instanceName, instanceBaseUrl, conversationId, 'custom');
                  break;
                  
                case 'wait_for_webhook':
                  // Create pending response record
                  const executionLogId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
                  
                  await createPendingResponse({
                    execution_log_id: executionLogId,
                    conversation_id: conversationId,
                    user_phone: userPhone,
                    instance_name: instanceName,
                    expires_at: expiresAt
                  });
                  
                  logger.info('⏳ Waiting for webhook response - no immediate message sent:', {
                    executionLogId,
                    timeoutSeconds,
                    expiresAt: expiresAt.toISOString()
                  });
                  break;
                  
                default:
                  logger.warn('Unknown response type, falling back to simple confirmation:', { responseType });
                  await sendConfirmationMessage(confirmationMessage, userPhone, instanceName, instanceBaseUrl, conversationId, 'fallback');
              }
              
            } catch (responseError) {
              logger.error('Exception handling External Action response:', {
                error: responseError.message || responseError,
                actionId: externalActionData.id
              });
              
              // Fallback to simple confirmation on error
              const fallbackMessage = '✅ Data received and sent successfully!\nThank you.';
              await sendConfirmationMessage(fallbackMessage, userPhone, instanceName, instanceBaseUrl, conversationId, 'error_fallback');
            }
            
            // Mark buffer as processed and return
            await markBufferAsProcessed(instanceName, userPhone);
            logger.info('✅ External Action processing completed for instance:', instanceName);
            
            return {
              success: true,
              action: 'external_action_executed',
              actionName: externalActionData.displayName,
              executionResult
            };
          } else {
            const errorText = await executorResponse.text();
            logger.error('❌ External Action execution failed:', {
              actionName: externalActionData.name,
              status: executorResponse.status,
              error: errorText
            });
            
            // Continue with normal AI flow as fallback
            logger.info('⏭️ Falling back to normal AI response due to external action failure');
          }
        } catch (executionError) {
          logger.error('❌ Exception during external action execution:', {
            error: executionError.message,
            actionName: externalActionData.name
          });
          
          // Continue with normal AI flow as fallback
          logger.info('⏭️ Falling back to normal AI response due to execution exception');
        }
      } else {
        logger.warn('⚠️ External action intent detected but no action data found');
      }
    } else if (intentClassification && (intentClassification as any)?.intent) {
      logger.info('📋 Core intent detected, proceeding with normal AI response:', {
        intent: (intentClassification as any)?.intent
      });
    }

    // 🧠 SMART ESCALATION CHECK: Check after intent analysis for intelligent detection
    if (instanceData.escalation_enabled) {
      logger.info('🔍 Checking if message needs escalation (with smart analysis)', {
        message: combinedMessage.substring(0, 100),
        phoneNumber: userPhone,
        instanceId: instanceData.id,
        hasIntentAnalysis: !!intentClassification,
        needsHumanSupport: (intentClassification as any)?.needsHumanSupport || false
      });

      const escalationCheck = await checkEscalationNeeded(
        combinedMessage,
        userPhone,
        instanceData.id,
        conversationId,
        undefined, // aiResponseConfidence - not needed here
        intentClassification // Pass intent analysis for smart detection
      );

      if (escalationCheck.needsEscalation) {
        logger.info('🚨 Message needs escalation - bypassing AI and handling escalation', {
          reason: escalationCheck.reason,
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

        // Store the escalation response
        await storeMessageInConversation(conversationId, 'assistant', escalationMessage, `escalation_${Date.now()}`, supabaseAdmin);

        // Send escalation message to user via WhatsApp
        const sendMessageUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
        const sendMessagePayload = {
          number: userPhone,
          text: escalationMessage
        };
        
        logger.info('📤 Sending escalation message to customer', {
          sendMessageUrl,
          userPhone,
          messagePreview: escalationMessage.substring(0, 50) + '...',
          escalationReason: escalationCheck.reason
        });

        try {
          const response = await fetch(sendMessageUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('EVOLUTION_API_KEY') || ''
            },
            body: JSON.stringify(sendMessagePayload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            logger.error('❌ Failed to send escalation message to customer', {
              status: response.status,
              statusText: response.statusText,
              errorText,
              sendUrl: sendMessageUrl,
              requestPayload: sendMessagePayload
            });
          } else {
            const responseData = await response.json();
            logger.info('✅ Escalation message sent successfully to customer', {
              userPhone,
              responseData,
              messagePreview: escalationMessage.substring(0, 50) + '...'
            });
          }
        } catch (error) {
          logger.error('❌ Error sending escalation message:', error);
        }

        // Mark buffer as processed and return
        await markBufferAsProcessed(instanceName, userPhone);

        logger.info('✅ Smart escalation handled successfully', {
          instanceName,
          userPhone,
          reason: escalationCheck.reason,
          detectionMethod: escalationCheck.reason === 'ai_detected_intent' ? 'Smart AI Detection' : 'Keyword Matching'
        });

        return true; // Escalation handled successfully
      }
    } else {
      logger.info('Escalation disabled, skipping smart escalation check for buffered messages');
    }

    // Simple greeting detection for better context handling
    const hasGreeting = combinedMessage.includes('السلام عليكم') || 
                       combinedMessage.includes('أهلا') || 
                       combinedMessage.includes('مرحبا') ||
                       combinedMessage.includes('صباح الخير') ||
                       combinedMessage.includes('مساء الخير');
    
    logger.info('Starting semantic search for context', { 
      userQuery: combinedMessage,
      hasGreeting,
      fileIds,
      detectedIntent: (intentClassification as any)?.intent || 'none',
      usingPersonality: !!selectedPersonality,
      selectedPersonalityName: (selectedPersonality as any)?.name || 'none'
    });

    // Perform semantic search - enhanced approach like original webhook
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: combinedMessage,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        limit: 5,
        threshold: 0.1
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error('Semantic search failed', { 
        status: searchResponse.status,
        error: errorText
      });
      
      // Continue with empty context instead of failing
      logger.info('Continuing with empty context due to search failure');
    }

    const searchResults = searchResponse.ok ? await searchResponse.json() : { success: false };
    logger.info('Semantic search completed', { 
      resultCount: searchResults.results?.length || 0,
      similarity: searchResults.results?.[0]?.similarity || 0
    });

    // IMPROVED CONTEXT ASSEMBLY: Enhanced filtering and quality assessment
    let context = '';
    let ragContext = '';
    
    // 1. Format conversation history in a clean, token-efficient format
    const conversationContext = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
    
    // 2. Enhanced RAG results processing - like original approach
    if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
      // Take the best results (max 3 for token efficiency) 
      const topResults = searchResults.results.slice(0, 3);
      
      // Enhanced formatting with better context information for AI
      ragContext = topResults
        .map((result, index) => {
          const qualityIndicator = result.similarity >= 0.5 ? 'GOOD MATCH' : 
                                  result.similarity >= 0.3 ? 'MODERATE MATCH' : 'WEAK MATCH';
          return `DOCUMENT ${index + 1} (${qualityIndicator} - similarity: ${result.similarity.toFixed(3)}):\n${result.content.trim()}`;
        })
        .join('\n\n---\n\n');
      
      // Enhanced context combination with greeting handling
      if (hasGreeting) {
        const greetingNote = "\nNOTE: User message contains greeting - respond appropriately and then address their main question.\n";
        context = conversationContext ? 
          `${conversationContext}${greetingNote}\nRELEVANT INFORMATION:\n${ragContext}` : 
          `${greetingNote}\nRELEVANT INFORMATION:\n${ragContext}`;
      } else {
        context = conversationContext ? 
          `${conversationContext}\n\nRELEVANT INFORMATION:\n${ragContext}` : 
          `RELEVANT INFORMATION:\n${ragContext}`;
      }
      
      logger.info('Context assembled with search results', { 
        conversationChars: conversationContext.length,
        ragChars: ragContext.length,
        totalChars: context.length,
        estimatedTokens: Math.ceil(context.length * 0.25),
        resultCount: topResults.length,
        similarities: topResults.map(r => r.similarity)
      });
    } else {
      // Only conversation history is available
      context = conversationContext;
      logger.info('Context assembled with only conversation history', { 
        conversationChars: conversationContext.length,
        estimatedTokens: Math.ceil(conversationContext.length * 0.25)
      });
    }

    // instanceBaseUrl is now defined earlier for escalation use

    // ===== NEW: Adaptive Response Quality Assessment =====
    let shouldEscalateByQuality = false;
    let qualityReasoning = '';
    let responseQuality = 1.0; // default high quality

    // Quality assessment feature disabled - using default high quality values
    logger.info('Using default quality settings (quality assessment disabled)', {
      hasSearchResults: !!searchResults?.success,
      hasBusinessContext: !!(intentClassification as any)?.businessContext,
      detectedIndustry: (intentClassification as any)?.businessContext?.industry,
      searchSimilarity: searchResults?.results?.[0]?.similarity || 0
    });

    // Quality-based escalation disabled (assess-response-quality function not available)
    // Escalation will only be triggered by keyword/smart detection in checkEscalationNeeded

    // ENHANCED: Pass comprehensive analysis data to response generator
    const smartAiConfig = {
      ...aiConfig,
      // Override with personality-specific settings if available
      ...((selectedPersonality as any) && {
        system_prompt: (selectedPersonality as any)?.system_prompt || aiConfig.system_prompt,
        temperature: (selectedPersonality as any)?.temperature || aiConfig.temperature,
        selectedPersonalityId: (selectedPersonality as any)?.id || null,
        selectedPersonalityName: (selectedPersonality as any)?.name || 'none',
        detectedIntent: (intentClassification as any)?.intent || null,
        intentConfidence: (intentClassification as any)?.confidence || null
      }),
      // Add business context for smarter responses
      ...((intentClassification as any)?.businessContext && {
        businessContext: (intentClassification as any).businessContext,
        detectedIndustry: (intentClassification as any).businessContext.industry,
        communicationStyle: (intentClassification as any).businessContext.communicationStyle,
        culturalContext: (intentClassification as any).businessContext.detectedTerms
      }),
      // البيانات المتقدمة الجديدة
      ...((intentClassification as any)?.emotionAnalysis && {
        emotionAnalysis: (intentClassification as any).emotionAnalysis
      }),
      ...((intentClassification as any)?.customerJourney && {
        customerJourney: (intentClassification as any).customerJourney
      }),
      ...((intentClassification as any)?.productInterest && {
        productInterest: (intentClassification as any).productInterest
      }),
      // Add quality assessment data
      responseQuality,
      qualityReasoning
    };

    // إضافة logging للتأكد من البيانات
    logger.info('Smart AI Config created', {
      hasPersonality: !!selectedPersonality,
      selectedPersonalityName: (selectedPersonality as any)?.name || 'none',
      selectedPersonalityId: (selectedPersonality as any)?.id || 'none',
      systemPrompt: smartAiConfig.system_prompt ? smartAiConfig.system_prompt.substring(0, 100) + '...' : 'undefined',
      originalSystemPrompt: aiConfig.system_prompt ? aiConfig.system_prompt.substring(0, 100) + '...' : 'undefined'
    });

    // Get Data Collection fields configuration for unified AI processing
    let dataCollectionFields: any[] = [];
    const dataCollectionEnabled = await isDataCollectionEnabled(instanceData.id, supabaseAdmin);
    
    if (dataCollectionEnabled) {
      logger.info('🔍 DATA COLLECTION: Fetching fields configuration', {
        instanceId: instanceData.id,
        configId: aiConfig.data_collection_config_id
      });
      
      const { data: fields, error: fieldsError } = await supabaseAdmin
        .from('data_collection_fields')
        .select('field_name, field_display_name, field_type, is_required')
        .eq('config_id', aiConfig.data_collection_config_id)
        .eq('is_active', true)
        .order('field_order');
      
      if (fieldsError) {
        logger.error('❌ DATA COLLECTION: Error fetching fields', { 
          error: fieldsError,
          configId: aiConfig.data_collection_config_id
        });
      } else {
        dataCollectionFields = fields || [];
        logger.info('✅ DATA COLLECTION: Fields fetched successfully', {
          fieldsCount: dataCollectionFields.length,
          fields: dataCollectionFields.map(f => f.field_name)
        });
      }
    } else {
      logger.info('⚠️ DATA COLLECTION: Disabled for this instance', {
        instanceId: instanceData.id
      });
    }

    // Generate and send AI response with smart context and personality management
    const aiResponseSuccess = await generateAndSendAIResponse(
      combinedMessage,
      context,
      instanceName,
      userPhone,
      instanceBaseUrl,
      smartAiConfig, // Use the enhanced smart AI config instead of basic config
      latestMessageData || {}, // Use latest message data for metadata
      conversationId,
      supabaseUrl,
      supabaseServiceKey,
      null, // No image URL for now (can be enhanced later)
      dataCollectionFields // Data Collection fields for unified processing
    );

    // 🔄 CRITICAL FIX: Extract data from user message if data collection is enabled
    if (dataCollectionEnabled && dataCollectionFields.length > 0) {
      try {
        logger.info('🔍 EXTRACT: Processing data extraction from user message', {
          instanceId: instanceData.id,
          conversationId,
          userPhone,
          messagePreview: combinedMessage.substring(0, 100),
          fieldsCount: dataCollectionFields.length,
          fields: dataCollectionFields.map(f => f.field_name)
        });

        // Extract data from user's message
        const extractionResult = await processDataExtraction(
          instanceData.id,
          conversationId,
          userPhone,
          combinedMessage,
          conversationHistory,
          supabaseUrl,
          supabaseServiceKey
        );

        logger.info('✅ EXTRACT: Data extraction completed', {
          extracted: extractionResult.extracted,
          isComplete: extractionResult.isComplete,
          hasResponseMessage: !!extractionResult.responseMessage,
          instanceId: instanceData.id,
          userPhone,
          silentDataCollection: true // البيانات تُستخرج في الخلفية بدون رسائل إضافية
        });

        // 🔕 REMOVED: Follow-up message sending to prevent duplicate messages
        // Data extraction continues to work silently in the background
        // AI already includes data collection requests in its main response

      } catch (extractionError) {
        logger.error('💥 EXTRACT: Exception during data extraction', {
          error: extractionError.message,
          stack: extractionError.stack,
          instanceId: instanceData.id,
          userPhone,
          messagePreview: combinedMessage.substring(0, 100)
        });
        // Continue processing even if data extraction fails
      }
    }

    // Mark buffer as processed
    await markBufferAsProcessed(instanceName, userPhone);

    logger.info('Buffered message processing completed', {
      instanceName,
      userPhone,
      messageCount: buffer.messages.length,
      success: aiResponseSuccess
    });

    return aiResponseSuccess;
  } catch (error) {
    logger.error('Error processing buffered messages:', error);
    
    // Ensure buffer is marked as processed even on error to prevent loops
    try {
      await markBufferAsProcessed(instanceName, userPhone);
    } catch (cleanupError) {
      logger.error('Failed to mark buffer as processed after error:', cleanupError);
    }
    
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceName, userPhone } = await req.json();

    if (!instanceName || !userPhone) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'instanceName and userPhone are required' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    logger.info('Processing buffered messages request', {
      instanceName,
      userPhone
    });

    const processingResult = await processBufferedMessagesForUser(instanceName, userPhone);

    return new Response(
      JSON.stringify({ 
        success: processingResult,
        message: processingResult ? 'Buffered messages processed successfully' : 'Failed to process buffered messages'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in process-buffered-messages function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});