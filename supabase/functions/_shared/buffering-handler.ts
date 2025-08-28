import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { shouldUseBuffering } from './buffer-config.ts';
import { 
  addMessageToBuffer, 
  scheduleDelayedProcessingViaHTTP 
} from './message-buffer.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Main function to handle message buffering with comprehensive fallbacks
 * This replaces the immediate processMessageForAI call in the webhook
 */
export async function handleMessageWithBuffering(
  instanceName: string,
  messageData: any,
  processMessageForAIFallback: (instanceName: string, messageData: any) => Promise<boolean>,
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
    if (remoteJid.includes('@g.us') || isFromMe || !messageText || !userPhone) {
      logger.info('Skipping buffering - fallback to immediate processing', {
        reason: remoteJid.includes('@g.us') ? 'group message' : 
                isFromMe ? 'message from bot' : 
                !messageText ? 'no text content' : 'no user phone'
      });
      
      const fallbackResult = await processMessageForAIFallback(instanceName, messageData);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Fallback to immediate processing' 
      };
    }

    // Check if buffering is enabled for this instance
    const shouldBuffer = await shouldUseBuffering(instanceName, supabaseAdmin);
    
    if (!shouldBuffer) {
      logger.info('Buffering not enabled - fallback to immediate processing', {
        instanceName
      });
      
      const fallbackResult = await processMessageForAIFallback(instanceName, messageData);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Buffering not enabled for instance' 
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
      logger.warn('Buffer operation failed - fallback to immediate processing', {
        bufferResult
      });
      
      const fallbackResult = await processMessageForAIFallback(instanceName, messageData);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Buffer operation failed, used fallback' 
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
        logger.warn('Failed to schedule delayed processing - fallback to immediate');
        
        const fallbackResult = await processMessageForAIFallback(instanceName, messageData);
        return { 
          success: fallbackResult, 
          usedBuffering: false, 
          reason: 'Failed to schedule delayed processing' 
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
    
    // Critical fallback: if anything goes wrong, use immediate processing
    try {
      const fallbackResult = await processMessageForAIFallback(instanceName, messageData);
      return { 
        success: fallbackResult, 
        usedBuffering: false, 
        reason: 'Exception occurred, used immediate processing fallback' 
      };
    } catch (fallbackError) {
      logger.error('Even fallback processing failed', { fallbackError });
      return { 
        success: false, 
        usedBuffering: false, 
        reason: 'Both buffering and fallback failed' 
      };
    }
  }
}