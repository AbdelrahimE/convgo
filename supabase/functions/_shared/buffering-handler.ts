import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { shouldUseBuffering } from './buffer-config.ts';
import { 
  addMessageToBuffer, 
  scheduleDelayedProcessingViaHTTP 
} from './message-buffer.ts';

// Additional imports needed for integrated AI processing
import { calculateSimilarity } from "./text-similarity.ts";
import { extractAudioDetails, hasAudioContent } from "./audio-processing.ts";
import { downloadAudioFile } from "./audio-download.ts";
import { storeMessageInConversation } from "./conversation-storage.ts";
import { processConnectionStatus } from "./connection-status.ts";
import { isConnectionStatusEvent } from "./connection-event-detector.ts";
import { checkForDuplicateMessage } from "./duplicate-message-detector.ts";
import { processAudioMessage } from "./audio-processor.ts";
import { generateAndSendAIResponse } from "./ai-response-generator.ts";
import { getRecentConversationHistory } from "./conversation-history.ts";

// Data Collection integration imports
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

// Default Evolution API URL fallback
const DEFAULT_EVOLUTION_API_URL = 'https://api.botifiy.com';

// Helper function to check if conversation is escalated
async function isConversationEscalated(instanceId: string, phoneNumber: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<boolean> {
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
  supabaseAdmin: ReturnType<typeof createClient>,
  aiResponseConfidence?: number,
  intentAnalysis?: any
): Promise<{ needsEscalation: boolean; reason: string }> {
  try {
    // Get instance escalation configuration including separate controls
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('escalation_enabled, escalation_keywords, smart_escalation_enabled, keyword_escalation_enabled')
      .eq('id', instanceId)
      .single();

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
          lowerMessage.includes(keyword.toLowerCase())
        );
        
        if (hasEscalationKeyword) {
          const matchedKeyword = keywords.find(k => lowerMessage.includes(k.toLowerCase()));
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

// Helper function to find or create a conversation
async function findOrCreateConversation(instanceId: string, phoneNumber: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<string> {
  try {
    // First, try to find existing conversation
    const { data: existingConversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_phone', phoneNumber)
      .maybeSingle();

    if (findError) {
      logger.error('Error finding conversation:', findError);
    }

    if (existingConversation) {
      return existingConversation.id;
    }

    // Create new conversation
    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        user_phone: phoneNumber,
        status: 'active'
      })
      .select('id')
      .single();

    if (createError) {
      logger.error('Error creating conversation:', createError);
      throw new Error(`Failed to create conversation: ${createError.message}`);
    }

    return newConversation.id;
  } catch (error) {
    logger.error('Exception in findOrCreateConversation:', error);
    throw error;
  }
}

/**
 * Integrated AI processing function that handles all message processing
 * This is the integrated version of processMessageForAI from webhook/index.ts
 */
async function processMessageForAIIntegrated(
  instanceName: string, 
  messageData: any,
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  try {
    logger.info('Starting integrated AI message processing', { instanceName });
    
    // Extract key information from the message
    const fromNumber = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    let messageText = messageData.transcribedText || 
                    messageData.message?.conversation || 
                    messageData.message?.extendedTextMessage?.text ||
                    messageData.message?.imageMessage?.caption ||
                    null;
    const remoteJid = messageData.key?.remoteJid || '';
    const isFromMe = messageData.key?.fromMe || false;
    
    // Check if this is an audio message and process it
    const isAudioMessage = hasAudioContent(messageData);
    if (isAudioMessage && !messageText) {
      logger.info('Audio message detected, processing transcription', { instanceName, fromNumber });
      
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      const audioDetails = extractAudioDetails(messageData);
      
      if (audioDetails) {
        const transcriptionResult = await processAudioMessage(audioDetails, instanceName, fromNumber, evolutionApiKey);
        
        if (transcriptionResult.success && transcriptionResult.transcription) {
          messageText = transcriptionResult.transcription;
          messageData.transcribedText = transcriptionResult.transcription;
          logger.info('Successfully transcribed audio message', {
            transcription: messageText?.substring(0, 100) + '...'
          });
        } else if (transcriptionResult.transcription) {
          // Fallback transcription
          messageText = transcriptionResult.transcription;
          messageData.transcribedText = transcriptionResult.transcription;
          logger.warn('Using fallback transcription', { transcription: messageText });
        } else {
          messageText = "This is a voice message that could not be processed.";
          logger.error('Audio processing failed completely', { error: transcriptionResult.error });
        }
      }
    }
    
    // Check for and process image content
    let imageUrl = null;
    if (messageData.message?.imageMessage) {
      logger.info('Image message detected, processing for AI analysis', { instanceName, fromNumber });
      
      const imageMessage = messageData.message.imageMessage;
      const rawImageUrl = imageMessage.url;
      const mediaKey = imageMessage.mediaKey;
      const mimeType = imageMessage.mimetype || 'image/jpeg';
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      if (rawImageUrl && mediaKey) {
        try {
          const imageProcessResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-image-process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              imageUrl: rawImageUrl,
              mediaKey,
              mimeType,
              instanceName,
              evolutionApiKey
            })
          });
          
          if (imageProcessResponse.ok) {
            const result = await imageProcessResponse.json();
            if (result.success && result.mediaUrl) {
              imageUrl = result.mediaUrl;
              
              // If this is an image-only message (no caption/text), set default text
              if (!messageText && imageUrl) {
                messageText = "Please analyze this image.";
                logger.info('Added default text for image-only message', { defaultText: messageText });
              }
              
              logger.info('Successfully processed image for AI analysis', {
                processedUrl: result.mediaUrl.substring(0, 50) + '...'
              });
            } else {
              logger.warn('Image processing returned failure', result);
            }
          } else {
            const errorText = await imageProcessResponse.text();
            logger.error('Error from image processing endpoint', {
              status: imageProcessResponse.status,
              error: errorText
            });
          }
        } catch (error) {
          logger.error('Exception during image processing', { error: error.message });
        }
      }
    }
    
    // Skip processing if not valid message (after audio/image processing)
    if (remoteJid.includes('@g.us') || isFromMe || !messageText || !fromNumber) {
      logger.info('Skipping AI processing: Invalid message conditions', {
        isGroup: remoteJid.includes('@g.us'),
        isFromMe,
        hasText: !!messageText,
        hasPhone: !!fromNumber
      });
      return false;
    }

    // Get instance data
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status, escalation_enabled, escalated_conversation_message')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.error('Instance not found in database', { instanceName, error: instanceError });
      return false;
    }

    // Check if AI is enabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceData.id)
      .eq('is_active', true)
      .maybeSingle();

    if (aiConfigError || !aiConfig) {
      logger.warn('AI is not enabled for this instance', { instanceId: instanceData.id, error: aiConfigError });
      return false;
    }

    // Check if conversation is escalated
    if (instanceData.escalation_enabled) {
      const isEscalated = await isConversationEscalated(instanceData.id, fromNumber, supabaseAdmin);
      if (isEscalated) {
        logger.info('Conversation is escalated, skipping AI processing', { fromNumber });
        return false;
      }
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber, supabaseAdmin);
    
    // Check for duplicate messages
    const isDuplicate = await checkForDuplicateMessage(conversationId, messageText, supabaseAdmin);
    if (isDuplicate) {
      logger.info('Skipping AI processing: Duplicate message detected', { conversationId });
      return false;
    }

    // Store user message in conversation
    await storeMessageInConversation(conversationId, 'user', messageText, messageData.key?.id, supabaseAdmin);
    
    // Get conversation history
    const conversationHistory = await getRecentConversationHistory(conversationId, 800, supabaseAdmin);
    
    // Get file mappings for RAG
    const { data: fileMappings } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceData.id);
    
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];

    // Smart Intent Classification (if enabled)
    let intentClassification = null;
    let selectedPersonality = null;
    
    const personalitySystemEnabled = aiConfig.use_personality_system;
    if (personalitySystemEnabled && messageText) {
      logger.info('Starting smart intent classification', { 
        userQuery: messageText.substring(0, 100) + '...',
        instanceId: instanceData.id
      });
      
      const contextualHistory = conversationHistory.map(msg => msg.content).slice(-10);
      
      try {
        // Use the smart intent analyzer
        const intentResponse = await fetch(`${supabaseUrl}/functions/v1/smart-intent-analyzer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            message: messageText,
            whatsappInstanceId: instanceData.id,
            userId: aiConfig.user_id,
            conversationHistory: contextualHistory,
            useCache: true
          })
        });

        if (intentResponse.ok) {
          intentClassification = await intentResponse.json();
          selectedPersonality = (intentClassification as any)?.selectedPersonality || (intentClassification as any)?.selected_personality;
          
          logger.info('Smart intent classification completed', {
            intent: (intentClassification as any)?.intent,
            confidence: (intentClassification as any)?.confidence,
            hasPersonality: !!selectedPersonality,
            selectedPersonalityName: (selectedPersonality as any)?.name || 'none'
          });
        } else {
          // Fallback to enhanced classifier
          try {
            const fallbackResponse = await fetch(`${supabaseUrl}/functions/v1/enhanced-intent-classifier`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                message: messageText,
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
              logger.info('Fallback intent classification successful');
            }
          } catch (fallbackError) {
            logger.warn('All intent classification methods failed', { error: fallbackError.message });
          }
        }
      } catch (error) {
        logger.warn('Exception during intent classification', { error: error.message });
      }
    }

    // 🧠 SMART ESCALATION CHECK: Check if message needs escalation after intent analysis
    if (instanceData.escalation_enabled) {
      logger.info('🔍 Checking if message needs escalation (integrated processing)', {
        messageText: messageText.substring(0, 100),
        fromNumber,
        instanceId: instanceData.id,
        hasIntentAnalysis: !!intentClassification,
        needsHumanSupport: (intentClassification as any)?.needsHumanSupport || false
      });

      const escalationCheck = await checkEscalationNeeded(
        messageText,
        fromNumber,
        instanceData.id,
        conversationId,
        undefined, // aiResponseConfidence - not needed here
        intentClassification // Pass intent analysis for smart detection
      );

      if (escalationCheck.needsEscalation) {
        logger.info('🚨 Message needs escalation - bypassing AI in integrated processing', {
          reason: escalationCheck.reason,
          fromNumber,
          detectionMethod: escalationCheck.reason === 'ai_detected_intent' ? 'Smart AI Detection' : 'Keyword Matching'
        });

        // Handle escalation
        const escalationMessage = instanceData.escalated_conversation_message || 
          'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly.';

        // Store escalation message
        await storeMessageInConversation(conversationId, 'assistant', escalationMessage, `escalation_${Date.now()}`, supabaseAdmin);

        // Send escalation notification
        try {
          const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-escalation-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              customerNumber: fromNumber,
              instanceId: instanceData.id,
              escalationReason: escalationCheck.reason,
              conversationContext: conversationHistory.slice(-10)
            })
          });

          if (!notificationResponse.ok) {
            logger.error('Failed to send escalation notification in integrated processing');
          } else {
            logger.info('✅ Escalation notification sent successfully');
          }
        } catch (error) {
          logger.error('Error sending escalation notification:', error);
        }

        logger.info('✅ Smart escalation handled in integrated processing', {
          instanceName,
          fromNumber,
          reason: escalationCheck.reason,
          detectionMethod: escalationCheck.reason === 'ai_detected_intent' ? 'Smart AI Detection' : 'Keyword Matching'
        });

        return true; // Escalation handled, skip AI processing
      }
    }

    // Generate instanceBaseUrl for WhatsApp API calls
    let instanceBaseUrl = '';
    if (messageData.server_url) {
      instanceBaseUrl = messageData.server_url;
    } else {
      // Try to get from webhook config
      const { data: webhookConfig } = await supabaseAdmin
        .from('whatsapp_webhook_config')
        .select('webhook_url')
        .eq('whatsapp_instance_id', instanceData.id)
        .maybeSingle();
        
      if (webhookConfig?.webhook_url) {
        const url = new URL(webhookConfig.webhook_url);
        instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
      } else {
        instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      }
    }

    // Generate AI response using existing function with correct parameter order
    const contextString = conversationHistory.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    }).join('\n');

    const aiResult = await generateAndSendAIResponse(
      messageText,           // 1. query: string
      contextString,         // 2. context: string
      instanceName,          // 3. instanceName: string
      fromNumber,            // 4. fromNumber: string
      instanceBaseUrl,       // 5. instanceBaseUrl: string
      aiConfig,              // 6. aiConfig: any
      messageData,           // 7. messageData: any
      conversationId,        // 8. conversationId: string
      supabaseUrl,           // 9. supabaseUrl: string
      supabaseServiceKey,    // 10. supabaseServiceKey: string
      imageUrl               // 11. imageUrl?: string | null
    );

    // ========== DATA COLLECTION INTEGRATION ==========
    logger.info('🔍 DATA COLLECTION: Starting integration check', {
      aiResult,
      instanceName,
      instanceId: instanceData.id,
      fromNumber,
      messageText: messageText?.substring(0, 100),
      isFromMe
    });

    if (aiResult) {
      logger.info('✅ DATA COLLECTION: AI result exists, checking if enabled');
      try {
        logger.info('🔍 DATA COLLECTION: Calling isDataCollectionEnabled', {
          instanceId: instanceData.id
        });
        
        const isEnabled = await isDataCollectionEnabled(instanceData.id, supabaseAdmin);
        
        logger.info('📊 DATA COLLECTION: Enable check result', {
          isEnabled,
          instanceId: instanceData.id,
          hasMessageText: !!messageText,
          isFromMe,
          allConditions: !!(isEnabled && messageText && !isFromMe)
        });
        
        if (isEnabled && messageText && !isFromMe) {
          logger.info('🚀 DATA COLLECTION: All conditions met, starting processing', {
            instanceName,
            instanceId: instanceData.id,
            fromNumber,
            conversationId,
            messageLength: messageText.length
          });
          
          // Get simple conversation history for context
          const simpleHistory = conversationHistory.slice(-5).map(msg => ({
            from: msg.role === 'user' ? 'customer' : 'assistant',
            message: msg.content
          }));

          logger.info('📝 DATA COLLECTION: Conversation history prepared', {
            historyLength: simpleHistory.length,
            historyPreview: simpleHistory.slice(0, 2)
          });

          // Process data extraction (non-blocking)
          logger.info('📞 DATA COLLECTION: Calling processDataExtraction');
          processDataExtraction(
            instanceData.id,
            conversationId,
            fromNumber,
            messageText,
            simpleHistory,
            supabaseUrl,
            supabaseServiceKey
          ).then(result => {
            logger.info('✅ DATA COLLECTION: processDataExtraction completed', { result });
          }).catch(error => {
            logger.error('❌ DATA COLLECTION: processDataExtraction failed', { 
              error: error.message,
              stack: error.stack,
              instanceId: instanceData.id,
              conversationId,
              fromNumber
            });
          });
          
          logger.info('🎯 DATA COLLECTION: Processing initiated successfully');
        } else {
          logger.warn('⚠️ DATA COLLECTION: Conditions not met', {
            isEnabled,
            hasMessageText: !!messageText,
            isFromMe,
            reason: !isEnabled ? 'not_enabled' : !messageText ? 'no_message' : isFromMe ? 'from_me' : 'unknown'
          });
        }
      } catch (error) {
        logger.error('💥 DATA COLLECTION: Exception during check', { 
          error: error.message,
          stack: error.stack,
          instanceId: instanceData.id
        });
      }
    } else {
      logger.warn('⚠️ DATA COLLECTION: No AI result, skipping data collection', {
        aiResult,
        instanceName
      });
    }
    // ========== END DATA COLLECTION ==========

    logger.info('Integrated AI processing completed', { 
      instanceName, 
      success: aiResult 
    });
    
    return aiResult;
  } catch (error) {
    logger.error('Exception in integrated AI processing', { error });
    return false;
  }
}

/**
 * Main function to handle message buffering with comprehensive fallbacks
 * This replaces the immediate processMessageForAI call in the webhook
 */
export async function handleMessageWithBuffering(
  instanceName: string,
  messageData: any,
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ success: boolean; usedBuffering: boolean; reason: string }> {
  try {
    // Extract essential message information
    const userPhone = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    const messageText = messageData.transcribedText || 
                       messageData.message?.conversation || 
                       messageData.message?.extendedTextMessage?.text ||
                       messageData.message?.imageMessage?.caption ||
                       null;
    const messageId = messageData.key?.id || `msg_${Date.now()}`;
    const isFromMe = messageData.key?.fromMe || false;
    const remoteJid = messageData.key?.remoteJid || '';

    logger.info('Processing message with buffering logic', {
      instanceName,
      userPhone,
      hasMessageText: !!messageText,
      messageId,
      isFromMe,
      isGroup: remoteJid.includes('@g.us')
    });

    // Skip buffering for:
    // 1. Group messages
    // 2. Messages from bot itself
    // 3. Messages without text content
    // 4. Messages with images (to ensure proper image processing)
    if (remoteJid.includes('@g.us') || isFromMe || !messageText || !userPhone || messageData.message?.imageMessage) {
      logger.info('Skipping buffering - fallback to integrated processing', {
        reason: remoteJid.includes('@g.us') ? 'group message' : 
                isFromMe ? 'message from bot' : 
                !messageText ? 'no text content' : 
                !userPhone ? 'no user phone' : 'image message'
      });
      
      // Use integrated function instead of original fallback
      const fallbackResult = await processMessageForAIIntegrated(instanceName, messageData, supabaseAdmin, supabaseUrl, supabaseServiceKey);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Fallback to integrated processing' 
      };
    }

    // Check if buffering is enabled for this instance
    const shouldBuffer = await shouldUseBuffering(instanceName, supabaseAdmin);
    
    if (!shouldBuffer) {
      logger.info('Buffering not enabled - fallback to integrated processing', {
        instanceName
      });
      
      // Use integrated function instead of original fallback
      const fallbackResult = await processMessageForAIIntegrated(instanceName, messageData, supabaseAdmin, supabaseUrl, supabaseServiceKey);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Buffering not enabled, used integrated processing' 
      };
    }

    // Try to add message to buffer
    const bufferResult = await addMessageToBuffer(
      instanceName,
      userPhone,
      messageText,
      messageId,
      messageData
    );

    // If buffering failed, fallback to immediate processing
    if (!bufferResult.success || bufferResult.fallbackToImmediate) {
      logger.warn('Buffer operation failed - fallback to integrated processing', {
        bufferResult
      });
      
      // TEST: Use integrated function instead of original fallback
      const fallbackResult = await processMessageForAIIntegrated(instanceName, messageData, supabaseAdmin, supabaseUrl, supabaseServiceKey);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Buffer operation failed, used integrated fallback' 
      };
    }

    // If this is a new buffer (first message), schedule delayed processing
    if (bufferResult.bufferCreated) {
      const schedulingResult = await scheduleDelayedProcessingViaHTTP(
        instanceName,
        userPhone,
        supabaseUrl,
        supabaseServiceKey
      );

      if (!schedulingResult) {
        logger.warn('Failed to schedule delayed processing - fallback to integrated processing');
        
        // TEST: Use integrated function instead of original fallback
        const fallbackResult = await processMessageForAIIntegrated(instanceName, messageData, supabaseAdmin, supabaseUrl, supabaseServiceKey);
        return { 
          success: fallbackResult, 
          usedBuffering: false, 
          reason: 'Failed to schedule delayed processing, used integrated fallback' 
        };
      }

      logger.info('Message buffered and delayed processing scheduled', {
        instanceName,
        userPhone,
        isFirstMessage: true
      });
    } else {
      logger.info('Message added to existing buffer', {
        instanceName,
        userPhone,
        isAdditionalMessage: true
      });
    }

    return { 
      success: true, 
      usedBuffering: true, 
      reason: 'Message successfully buffered' 
    };
  } catch (error) {
    logger.error('Exception in buffering handler - fallback to immediate processing', {
      error
    });
    
    // Critical fallback: if anything goes wrong, use integrated processing
    try {
      const fallbackResult = await processMessageForAIIntegrated(instanceName, messageData, supabaseAdmin, supabaseUrl, supabaseServiceKey);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Exception occurred, used integrated processing fallback' 
      };
    } catch (fallbackError) {
      logger.error('Even integrated processing failed', { fallbackError });
      return { 
        success: false, 
        usedBuffering: false, 
        reason: 'Both buffering and integrated processing failed' 
      };
    }
  }
}