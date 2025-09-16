import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addMessageToBuffer, scheduleDelayedProcessingViaHTTP } from './message-buffer.ts';

// Additional imports needed for integrated AI processing
import { hasAudioContent } from "./audio-processing.ts";

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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

// ❌ REMOVED: processMessageForAIIntegrated function completely deleted
// All messages now MUST go through buffering system - no immediate processing fallbacks

/**
 * Main function to handle message buffering with MANDATORY buffering - no fallbacks
 * This replaces all immediate processMessageForAI calls - buffering is now required
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

    logger.info('🔥 MANDATORY BUFFERING: Processing message', {
      instanceName,
      userPhone,
      hasMessageText: !!messageText,
      messageId,
      isFromMe,
      isGroup: remoteJid.includes('@g.us')
    });

    // Skip ONLY for fundamental invalid messages (groups, bot messages)
    if (remoteJid.includes('@g.us') || isFromMe || !userPhone) {
      logger.info('⏭️ Skipping buffering for invalid message type', {
        reason: remoteJid.includes('@g.us') ? 'group message' : 
                isFromMe ? 'message from bot' : 
                !userPhone ? 'no user phone' : 'unknown'
      });
      
      return { 
        success: false, 
        usedBuffering: false, 
        reason: 'Invalid message type - groups/bot messages not supported' 
      };
    }

    // Even messages without text (images, audio, etc.) MUST go through buffering
    if (!messageText) {
      logger.warn('⚠️ Message without text - still buffering (may be image/audio)', {
        instanceName,
        userPhone,
        hasImageMessage: !!messageData.message?.imageMessage,
        hasAudioMessage: hasAudioContent(messageData)
      });
    }

    // ✅ MANDATORY: Try to add message to buffer - NO fallbacks on failure
    logger.info('📦 Adding message to buffer (MANDATORY)', {
      instanceName,
      userPhone,
      messageId
    });

    const bufferResult = await addMessageToBuffer(
      instanceName,
      userPhone,
      messageText || '[Media/Audio Message]', // Handle non-text messages
      messageId,
      messageData
    );

    // ❌ NO FALLBACKS: If buffering failed, the message is REJECTED
    if (!bufferResult.success) {
      logger.error('🚨 CRITICAL: Buffer system failed - message REJECTED', {
        instanceName,
        userPhone,
        messageId,
        error: bufferResult.error || 'Unknown buffer error',
        bufferResult
      });
      
      return { 
        success: false, 
        usedBuffering: false, 
        reason: `CRITICAL: Buffer system failed - ${bufferResult.error || 'unknown error'}` 
      };
    }

    // ✅ Buffer succeeded - schedule processing if needed
    if (bufferResult.bufferCreated) {
      logger.info('📅 Scheduling delayed processing for new buffer', {
        instanceName,
        userPhone
      });

      const schedulingResult = await scheduleDelayedProcessingViaHTTP(
        instanceName,
        userPhone,
        supabaseUrl,
        supabaseServiceKey
      );

      if (!schedulingResult) {
        logger.error('🚨 CRITICAL: Failed to schedule delayed processing', {
          instanceName,
          userPhone,
          messageId
        });
        
        return { 
          success: false, 
          usedBuffering: false, 
          reason: 'CRITICAL: Failed to schedule delayed processing' 
        };
      }

      logger.info('✅ Message buffered and processing scheduled', {
        instanceName,
        userPhone,
        isFirstMessage: true
      });
    } else {
      logger.info('📝 Message added to existing buffer', {
        instanceName,
        userPhone,
        isAdditionalMessage: true
      });
    }

    return { 
      success: true, 
      usedBuffering: true, 
      reason: 'Message successfully buffered - processing will occur after delay' 
    };

  } catch (error) {
    logger.error('🚨 CRITICAL EXCEPTION in mandatory buffering system', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      instanceName,
      messageData: {
        userPhone: messageData?.key?.remoteJid?.replace('@s.whatsapp.net', ''),
        messageId: messageData?.key?.id,
        hasText: !!(messageData?.transcribedText || messageData?.message?.conversation)
      }
    });
    
    // ❌ NO FALLBACKS: Even exceptions result in message rejection
    return { 
      success: false, 
      usedBuffering: false, 
      reason: `CRITICAL SYSTEM ERROR: ${error instanceof Error ? error.message : 'Unknown exception'}` 
    };
  }
}