import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndSendAIResponse } from './ai-response-generator.ts';
import { storeMessageInConversation } from './conversation-storage.ts';
import { checkForDuplicateMessage } from './duplicate-message-detector.ts';
import { getRecentConversationHistory } from './conversation-history.ts';
import {
  isDataCollectionEnabled,
  processDataExtraction
} from './data-collection-integration.ts';
import { measureTime } from './parallel-queries.ts';
import { CustomerProfileManager } from './customer-profile-manager.ts';
import { extractMessageText } from './message-text-extractor.ts';

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
async function isConversationEscalated(instanceId: string, phoneNumber: string, supabaseAdmin: any): Promise<boolean> {
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
  supabaseAdmin: any,
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
  conversationHistory: any[],
  supabaseAdmin: any,
  supabaseUrl: string,
  supabaseServiceKey: string
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

    // Extract message text using centralized extractor (supports quoted messages/replies)
    const messageText = extractMessageText(messageData);

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

    // Get AI configuration (AI status already verified by webhook before direct processing fallback)
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceData.id)
      .maybeSingle();

    if (aiConfigError || !aiConfig) {
      logger.error('💥 AI config missing for direct processing fallback - this should not happen!', { 
        instanceId: instanceData.id, 
        error: aiConfigError,
        note: 'Webhook should have verified AI status before fallback to direct processing'
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

    // ===== CUSTOMER PROFILE MANAGEMENT =====
    const profileManager = new CustomerProfileManager(supabaseAdmin);
    
    // Get or create customer profile
    const customerProfile = await profileManager.getOrCreateProfile(instanceData.id, userPhone);
    
    // Extract and update customer information from message
    await profileManager.extractAndUpdateCustomerInfo(instanceData.id, userPhone, messageText);
    
    // Increment message counters
    await profileManager.incrementMessageCounters(instanceData.id, userPhone);
    
    logger.info('📋 Customer profile updated', {
      userPhone,
      customerName: customerProfile.name || 'Unknown',
      customerStage: customerProfile.customer_stage,
      totalMessages: customerProfile.total_messages + 1
    });

    // Get conversation history
    const conversationHistory = await getRecentConversationHistory(conversationId, 800, supabaseAdmin);

    // ===== ESCALATION SYSTEM INTEGRATION =====
    
    // Check if conversation is already escalated
    const isAlreadyEscalated = await isConversationEscalated(instanceData.id, userPhone, supabaseAdmin);
    
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
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData?.apikey;
        
        if (!evolutionApiKey) {
          logger.error('❌ EVOLUTION_API_KEY not available for escalated message');
          return true; // Consider it successful even if sending failed
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
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || '';
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
          return true;
        } else {
          logger.error('❌ Failed to send escalated message', {
            status: sendResponse.status,
            statusText: sendResponse.statusText
          });
        }
      } catch (sendError) {
        logger.error('❌ Error sending escalated message', { error: sendError.message });
      }
      
      return true; // Consider it successful even if sending failed
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
          message: messageText,
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
          selectedPersonalityName: intentAnalysis?.selectedPersonality?.name || 'none',
          intent: intentAnalysis?.intent || 'unknown',
          hasExternalAction: !!intentAnalysis?.externalAction
        });

        // 🎯 EXTERNAL ACTIONS EXECUTION - Check and execute external actions first
        if (intentAnalysis?.intent === 'external_action' && intentAnalysis?.externalAction) {
          logger.info('🚀 External action detected, executing webhook:', {
            actionId: intentAnalysis.externalAction.id,
            actionName: intentAnalysis.externalAction.name,
            displayName: intentAnalysis.externalAction.displayName,
            confidence: intentAnalysis.confidence,
            extractedVariables: intentAnalysis.externalAction.extractedVariables,
            webhookUrl: intentAnalysis.externalAction.webhookUrl?.substring(0, 50) + '...'
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
                externalActionId: intentAnalysis.externalAction.id,
                extractedVariables: intentAnalysis.externalAction.extractedVariables,
                whatsappConversationId: conversationId,
                whatsappMessageId: messageData.key?.id,
                intentConfidence: intentAnalysis.confidence
              })
            });

            if (executorResponse.ok) {
              const executorResult = await executorResponse.json();
              logger.info('✅ External action executed successfully:', {
                actionName: executorResult.actionName,
                success: executorResult.success,
                httpStatusCode: executorResult.httpStatusCode,
                executionTimeMs: executorResult.executionTimeMs,
                retryCount: executorResult.retryCount,
                executionLogId: executorResult.executionLogId
              });

              // 📨 Send confirmation message based on response_type
              if (intentAnalysis.externalAction.responseType === 'simple_confirmation' ||
                  intentAnalysis.externalAction.responseType === 'custom_message') {

                let confirmationMessage = intentAnalysis.externalAction.confirmationMessage ||
                                          'تم تنفيذ طلبك بنجاح ✅';

                // 🔄 Replace variables for custom_message
                if (intentAnalysis.externalAction.responseType === 'custom_message') {
                  const extractedVars = intentAnalysis.externalAction.extractedVariables || {};

                  // Replace {{variable}} with actual values
                  confirmationMessage = confirmationMessage.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
                    return extractedVars[varName] !== undefined ? extractedVars[varName] : match;
                  });

                  logger.info('🔄 Variables replaced in custom message:', {
                    originalMessage: intentAnalysis.externalAction.confirmationMessage,
                    finalMessage: confirmationMessage,
                    variablesUsed: Object.keys(extractedVars),
                    responseType: intentAnalysis.externalAction.responseType
                  });
                }

                logger.info('📨 Sending confirmation message to user:', {
                  userPhone,
                  responseType: intentAnalysis.externalAction.responseType,
                  messageLength: confirmationMessage.length
                });

                try {
                  // Store confirmation message in conversation
                  await storeMessageInConversation(
                    conversationId,
                    'assistant',
                    confirmationMessage,
                    `external_action_confirmation_${Date.now()}`,
                    supabaseAdmin
                  );

                  // Send confirmation message via WhatsApp API
                  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData?.apikey;

                  if (!evolutionApiKey) {
                    logger.error('❌ EVOLUTION_API_KEY not available for confirmation message');
                  } else {
                    const sendResponse = await fetch(`${instanceBaseUrl}/message/sendText/${instanceName}`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'apikey': evolutionApiKey
                      },
                      body: JSON.stringify({
                        number: userPhone,
                        text: confirmationMessage
                      })
                    });

                    if (sendResponse.ok) {
                      logger.info('✅ Confirmation message sent successfully via WhatsApp');
                    } else {
                      logger.error('❌ Failed to send confirmation message via WhatsApp:', {
                        status: sendResponse.status,
                        statusText: sendResponse.statusText
                      });
                    }
                  }
                } catch (confirmationError) {
                  logger.error('❌ Error sending confirmation message:', {
                    error: confirmationError.message,
                    stack: confirmationError.stack
                  });
                  // Don't fail the whole process because of confirmation message error
                }
              } else if (intentAnalysis.externalAction.responseType === 'wait_for_webhook') {
                // ⏳ Create pending response record for wait_for_webhook
                try {
                  const timeoutSeconds = intentAnalysis.externalAction.responseTimeoutSeconds || 30;
                  const expiresAt = new Date(Date.now() + (timeoutSeconds * 1000));

                  const { error: insertError } = await supabaseAdmin
                    .from('external_action_responses')
                    .insert({
                      execution_log_id: executorResult.executionLogId,
                      conversation_id: conversationId,
                      user_phone: userPhone,
                      instance_name: instanceName,
                      response_received: false,
                      expires_at: expiresAt.toISOString()
                    });

                  if (insertError) {
                    logger.error('❌ Failed to create pending response record:', {
                      error: insertError.message,
                      executionLogId: executorResult.executionLogId
                    });
                  } else {
                    logger.info('⏳ Pending response record created successfully (direct):', {
                      executionLogId: executorResult.executionLogId,
                      userPhone,
                      instanceName,
                      timeoutSeconds,
                      expiresAt: expiresAt.toISOString(),
                      note: 'Waiting for automation to send response via callback URL'
                    });
                  }
                } catch (pendingError) {
                  logger.error('❌ Exception creating pending response record:', {
                    error: pendingError.message,
                    stack: pendingError.stack
                  });
                }
              } else {
                // response_type === 'none' or unknown
                logger.info('ℹ️ Response type does not require immediate message send:', {
                  responseType: intentAnalysis.externalAction.responseType
                });
              }

              // External action executed successfully and confirmation sent
              return true;

            } else {
              const errorText = await executorResponse.text();
              logger.error('❌ External action executor returned error:', {
                status: executorResponse.status,
                statusText: executorResponse.statusText,
                errorText: errorText.substring(0, 200)
              });
              // Continue with normal processing as fallback
            }
          } catch (executorError) {
            logger.error('❌ Exception calling external-action-executor:', {
              error: executorError.message,
              stack: executorError.stack
            });
            // Continue with normal processing as fallback
          }
        }

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
      messageText,
      userPhone,
      instanceData.id,
      conversationId,
      supabaseAdmin,
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
        conversationHistory,
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey
      );

      // Store escalation message
      await storeMessageInConversation(conversationId, 'assistant', escalationMessage, `escalation_${Date.now()}`, supabaseAdmin);

      // Send escalation message via WhatsApp API
      try {
        // Get Evolution API key
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData?.apikey;
        
        if (!evolutionApiKey) {
          logger.error('❌ EVOLUTION_API_KEY not available for escalation message');
          return true; // Consider escalation successful
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
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || '';
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
          return true;
        } else {
          logger.error('❌ Failed to send escalation message', {
            status: sendResponse.status,
            statusText: sendResponse.statusText
          });
        }
      } catch (sendError) {
        logger.error('❌ Error sending escalation message', { error: sendError.message });
      }
      
      return true; // Consider escalation successful
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
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || '';
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

    // ===== ENHANCE CONTEXT WITH CUSTOMER PROFILE =====
    
    // Get customer profile context
    const customerProfileContext = await profileManager.getEnhancedContext(instanceData.id, userPhone, messageText);
    
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
      
      logger.debug('Enhanced context with customer profile', {
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

    // Extract processed image URL from message data if available
    const imageUrl = messageData.processedImageUrl || null;
    
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
          messageText,
          conversationHistory,
          conversationSummary, // Add conversation summary for context
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