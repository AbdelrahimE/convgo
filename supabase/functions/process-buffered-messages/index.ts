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

// Helper function to check if message needs escalation (imported from webhook logic)
async function checkEscalationNeeded(
  message: string, 
  phoneNumber: string,
  instanceId: string,
  conversationId: string,
  aiResponseConfidence?: number
): Promise<{ needsEscalation: boolean; reason: string }> {
  try {
    const escalationTimer = measureTime('Escalation check with parallel queries');
    
    // Execute instance config and AI interactions queries in parallel
    const [instanceResult, interactionsResult] = await executeParallel([
      supabaseAdmin
        .from('whatsapp_instances')
        .select('escalation_enabled, escalation_threshold, escalation_keywords')
        .eq('id', instanceId)
        .single(),
      supabaseAdmin
        .from('whatsapp_ai_interactions')
        .select('metadata, created_at, user_message')
        .eq('whatsapp_instance_id', instanceId)
        .eq('user_phone', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(5)
    ], ['Instance Config', 'AI Interactions']);
    
    escalationTimer.end();
    
    const { data: instance, error: instanceError } = instanceResult;
    const { data: interactions, error: interactionError } = interactionsResult;

    if (instanceError || !instance?.escalation_enabled) {
      return { needsEscalation: false, reason: '' };
    }

    // 1. Check for direct escalation keywords (English and Arabic)
    const keywords = instance.escalation_keywords || [
      'human support', 'speak to someone', 'agent', 'representative',
      'talk to person', 'customer service', 'help me', 'support team',
      // Arabic keywords
      'عاوز اكلم حد', 'عايز اتكلم مع حد', 'محتاج مساعدة', 'كلموني',
      'خدمة العملاء', 'مسؤول', 'موظف', 'شخص حقيقي', 'انسان'
    ];
    
    const lowerMessage = message.toLowerCase();
    const hasEscalationKeyword = keywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase()) || message.includes(keyword)
    );
    
    if (hasEscalationKeyword) {
      logger.info('Escalation needed: User requested human support', { phoneNumber });
      return { needsEscalation: true, reason: 'user_request' };
    }

    // 2. Check AI confidence patterns using interaction history
    // Process the AI interactions we fetched in parallel

    if (!interactionError && interactions && interactions.length > 0) {
      // Check for repeated questions (from user messages)
      const userMessages = interactions.map(i => i.user_message);
      const uniqueMessages = new Set(userMessages.map(m => m.toLowerCase()));
      
      if (userMessages.length >= 3 && uniqueMessages.size === 1) {
        logger.info('Escalation needed: Repeated question detected', { phoneNumber });
        return { needsEscalation: true, reason: 'repeated_question' };
      }

      // Check for low response quality on multiple AI responses
      const lowQualityCount = interactions.filter(i => {
        const responseQuality = i.metadata?.response_quality;
        return responseQuality && parseFloat(responseQuality) < 0.4;
      }).length;
      
      if (lowQualityCount >= instance.escalation_threshold) {
        logger.info('Escalation needed: Low response quality threshold exceeded', { 
          phoneNumber, 
          lowQualityCount, 
          threshold: instance.escalation_threshold 
        });
        return { needsEscalation: true, reason: 'low_confidence' };
      }
    }

    // 3. Check for sensitive topics (English and Arabic)
    const sensitiveKeywords = [
      'complaint', 'legal', 'lawyer', 'refund', 'compensation',
      'issue', 'problem', 'dispute', 'billing', 'charge',
      // Arabic sensitive keywords
      'شكوى', 'مشكلة', 'قانوني', 'محامي', 'استرداد', 'تعويض',
      'نزاع', 'فاتورة', 'رسوم'
    ];
    
    const hasSensitiveTopic = sensitiveKeywords.some(keyword => 
      lowerMessage.includes(keyword) || message.includes(keyword)
    );
    
    if (hasSensitiveTopic) {
      logger.info('Escalation needed: Sensitive topic detected', { phoneNumber });
      return { needsEscalation: true, reason: 'sensitive_topic' };
    }

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

    // ESCALATION CHECK: Check if the message needs escalation to human support
    if (instanceData.escalation_enabled) {
      logger.info('Checking if message needs escalation', {
        message: combinedMessage.substring(0, 100),
        phoneNumber: userPhone,
        instanceId: instanceData.id
      });

      const escalationCheck = await checkEscalationNeeded(
        combinedMessage,
        userPhone,
        instanceData.id,
        conversationId
      );

      if (escalationCheck.needsEscalation) {
        logger.info('Message needs escalation - bypassing AI and handling escalation', {
          reason: escalationCheck.reason,
          phoneNumber: userPhone
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
          text: escalationMessage  // Use same format as AI responses for consistency
        };
        
        logger.info('Sending escalation message to customer', {
          sendMessageUrl,
          userPhone,
          messagePreview: escalationMessage.substring(0, 50) + '...'
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
            logger.error('Failed to send escalation message to customer', {
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
          logger.error('Error sending escalation message:', error);
        }

        // Mark buffer as processed and return
        await markBufferAsProcessed(instanceName, userPhone);

        logger.info('Escalation handled successfully', {
          instanceName,
          userPhone,
          reason: escalationCheck.reason
        });

        return true; // Escalation handled successfully
      }
    } else {
      logger.info('Escalation disabled, skipping escalation check for buffered messages');
    }

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

    // Only perform quality assessment if escalation is enabled
    if (instanceData.escalation_enabled) {
      logger.info('Starting adaptive response quality assessment', {
        hasSearchResults: !!searchResults?.success,
        hasBusinessContext: !!(intentClassification as any)?.businessContext,
        detectedIndustry: (intentClassification as any)?.businessContext?.industry,
        searchSimilarity: searchResults?.results?.[0]?.similarity || 0
      });

      try {
        const qualityResponse = await fetch(`${supabaseUrl}/functions/v1/assess-response-quality`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            message: combinedMessage,
            intentData: {
              intent: (intentClassification as any)?.intent,
              confidence: (intentClassification as any)?.confidence,
              reasoning: (intentClassification as any)?.reasoning
            },
            businessContext: (intentClassification as any)?.businessContext,
            searchResults: searchResults,
            languageDetection: {
              primaryLanguage: 'ar' // Default to Arabic for this system
            },
            fileIds: fileIds,
            instanceId: instanceData.id
          })
        });

        if (qualityResponse.ok) {
          const qualityData = await qualityResponse.json();
          shouldEscalateByQuality = qualityData.shouldEscalate;
          responseQuality = qualityData.responseQuality;
          qualityReasoning = qualityData.reasoning;
          
          logger.info('✅ Adaptive quality assessment completed', {
            responseQuality: qualityData.responseQuality,
            shouldEscalate: qualityData.shouldEscalate,
            reasoning: qualityData.reasoning,
            assessmentType: qualityData.assessmentType,
            adaptiveFactors: qualityData.adaptiveFactors
          });
        } else {
          const errorText = await qualityResponse.text();
          logger.warn('⚠️ Quality assessment failed, using conservative approach', {
            status: qualityResponse.status,
            error: errorText
          });
          // Conservative: if assessment fails, don't escalate by quality
        }
      } catch (error) {
        logger.error('❌ Exception in quality assessment, using conservative approach', {
          error: error.message || error
        });
      }

      // Check if immediate escalation is needed based on quality assessment
      if (shouldEscalateByQuality) {
        logger.info('🚨 Immediate escalation triggered by quality assessment', { 
          responseQuality,
          reasoning: qualityReasoning,
          phoneNumber: userPhone 
        });
        
        // Handle escalation with detailed logging
        logger.info('🚨 STARTING ESCALATION PROCESS', {
          trigger: 'quality_assessment',
          userPhone,
          instanceId: instanceData.id,
          responseQuality,
          qualityReasoning,
          conversationLength: conversationHistory.length
        });

        const escalationMessage = await handleEscalation(
          userPhone,
          instanceData.id,
          'low_confidence',
          conversationHistory
        );

        logger.info('🚨 ESCALATION PROCESS COMPLETED', {
          escalationMessage: escalationMessage.substring(0, 100) + '...',
          escalationMessageLength: escalationMessage.length
        });

        // Send escalation message to user with detailed logging
        const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
        
        logger.info('📤 SENDING ESCALATION MESSAGE TO CUSTOMER', {
          sendUrl,
          userPhone,
          escalationMessagePreview: escalationMessage.substring(0, 100) + '...',
          instanceName,
          instanceBaseUrl
        });

        try {
          const customerResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('EVOLUTION_API_KEY') || ''
            },
            body: JSON.stringify({
              number: userPhone,
              text: escalationMessage
            })
          });

          if (customerResponse.ok) {
            const customerResponseData = await customerResponse.json();
            logger.info('✅ ESCALATION MESSAGE SENT TO CUSTOMER SUCCESSFULLY', {
              userPhone,
              responseData: customerResponseData,
              escalationMessageLength: escalationMessage.length
            });
          } else {
            const customerErrorText = await customerResponse.text();
            logger.error('❌ FAILED TO SEND ESCALATION MESSAGE TO CUSTOMER', {
              status: customerResponse.status,
              statusText: customerResponse.statusText,
              error: customerErrorText,
              sendUrl,
              userPhone
            });
          }
        } catch (customerError) {
          logger.error('🚨 EXCEPTION SENDING ESCALATION MESSAGE TO CUSTOMER', {
            error: customerError.message || customerError,
            sendUrl,
            userPhone
          });
        }

        // Store the escalation message with logging
        logger.info('💾 STORING ESCALATION MESSAGE IN CONVERSATION', {
          conversationId,
          messageLength: escalationMessage.length,
          messagePreview: escalationMessage.substring(0, 50) + '...'
        });

        try {
          await storeMessageInConversation(conversationId, 'assistant', escalationMessage, null, supabaseAdmin);
          logger.info('✅ ESCALATION MESSAGE STORED IN CONVERSATION SUCCESSFULLY', {
            conversationId
          });
        } catch (storeError) {
          logger.error('❌ FAILED TO STORE ESCALATION MESSAGE IN CONVERSATION', {
            error: storeError.message || storeError,
            conversationId
          });
        }
        
        // Mark buffer as processed
        await markBufferAsProcessed(instanceName, userPhone);
        
        return true;
      }
    } else {
      logger.info('Escalation disabled, skipping quality assessment for buffered messages');
    }

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
      null // No image URL for now (can be enhanced later)
    );

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