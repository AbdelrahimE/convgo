import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleSupportEscalation } from "../_shared/escalation-utils.ts";
import logDebug from "../_shared/webhook-logger.ts";
import { calculateSimilarity } from "../_shared/text-similarity.ts";
import { extractAudioDetails, hasAudioContent } from "../_shared/audio-processing.ts";
import { downloadAudioFile } from "../_shared/audio-download.ts";
import { storeMessageInConversation } from "../_shared/conversation-storage.ts";
import { processConnectionStatus } from "../_shared/connection-status.ts";
import { isConnectionStatusEvent } from "../_shared/connection-event-detector.ts";
import { checkForDuplicateMessage } from "../_shared/duplicate-message-detector.ts";
import { processAudioMessage } from "../_shared/audio-processor.ts";
import { generateAndSendAIResponse } from "../_shared/ai-response-generator.ts";
import messageBufferManager, { BufferedMessage } from "../_shared/message-buffer.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Define standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role for admin operations
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// NEW FUNCTION: Check if a phone number is registered as a support phone number
async function isSupportPhoneNumber(instanceName: string): Promise<boolean> {
  try {
    // Query the support config table for matching support phone numbers
    const { data, error } = await supabaseAdmin
      .from('whatsapp_support_config')
      .select('support_phone_number')
      .eq('support_phone_number', instanceName)
      .maybeSingle();
    
    // If there's an error in the query, log it but continue (default to false)
    if (error) {
      logger.error('Error checking support phone number:', error);
      return false;
    }
    
    // Return true if the instance name matches a support phone number
    return !!data;
  } catch (error) {
    // Handle any unexpected errors
    logger.error('Exception checking support phone number:', error);
    return false;
  }
}

// Helper function to find or create a conversation with improved timeout management and handling of unique constraint
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

    // If found an active conversation that's not expired
    if (!findError && existingConversation) {
      // Check if the conversation has been inactive for more than 6 hours (considered expired)
      const lastActivity = new Date(existingConversation.last_activity);
      const currentTime = new Date();
      const hoursDifference = (currentTime.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursDifference > 6) {
        // Mark the old conversation as expired
        await supabaseAdmin
          .from('whatsapp_conversations')
          .update({ 
            status: 'expired',
            conversation_data: {
              ...existingConversation.conversation_data,
              expiration_details: {
                expired_at: currentTime.toISOString(),
                inactive_hours: hoursDifference.toFixed(2)
              }
            }
          })
          .eq('id', existingConversation.id);
          
        // Log the expiration
        await logDebug('CONVERSATION_EXPIRED', `Conversation ${existingConversation.id} expired after ${hoursDifference.toFixed(2)} hours of inactivity`);
        
        // Instead of creating a new conversation right away, check if there's another conversation
        // for this instance and phone in any status
        const { data: anyConversation, error: anyError } = await supabaseAdmin
          .from('whatsapp_conversations')
          .select('id, status')
          .eq('instance_id', instanceId)
          .eq('user_phone', userPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (!anyError && anyConversation) {
          // Update the existing conversation back to active
          const { data: updatedConversation, error: updateError } = await supabaseAdmin
            .from('whatsapp_conversations')
            .update({
              status: 'active',
              last_activity: currentTime.toISOString(),
              conversation_data: { 
                context: {
                  last_update: currentTime.toISOString(),
                  reactivated: true,
                  previously_expired: true,
                  activity_timeout_hours: 6
                }
              }
            })
            .eq('id', anyConversation.id)
            .select('id')
            .single();
            
          if (updateError) throw updateError;
          
          await logDebug('CONVERSATION_REACTIVATED', `Reactivated conversation ${anyConversation.id} for instance ${instanceId} and phone ${userPhone}`);
          
          return updatedConversation.id;
        }
      } else {
        // Existing active conversation that hasn't expired
        return existingConversation.id;
      }
    }

    // Try to find any conversation with this instance and phone, regardless of status
    const { data: inactiveConversation, error: inactiveError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .limit(1)
      .single();
      
    if (!inactiveError && inactiveConversation) {
      // If found any conversation (even if expired), update it to active
      const { data: updatedConversation, error: updateError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          status: 'active',
          last_activity: new Date().toISOString(),
          conversation_data: { 
            context: {
              last_update: new Date().toISOString(),
              message_count: 0,
              created_at: new Date().toISOString(),
              activity_timeout_hours: 6,
              reactivated: true
            }
          }
        })
        .eq('id', inactiveConversation.id)
        .select('id')
        .single();
        
      if (updateError) throw updateError;
      
      await logDebug('CONVERSATION_UPDATED', `Updated existing conversation ${inactiveConversation.id} to active status`);
      
      return updatedConversation.id;
    }

    // If no conversation exists at all, create a new one
    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        user_phone: userPhone,
        status: 'active',
        conversation_data: { 
          context: {
            last_update: new Date().toISOString(),
            message_count: 0,
            created_at: new Date().toISOString(),
            activity_timeout_hours: 6
          }
        }
      })
      .select('id')
      .single();

    if (createError) throw createError;
    
    // Log the creation of a new conversation
    await logDebug('CONVERSATION_CREATED', `New conversation created for instance ${instanceId} and phone ${userPhone}`);
    
    return newConversation.id;
  } catch (error) {
    logger.error('Error in findOrCreateConversation:', error);
    await logDebug('CONVERSATION_ERROR', `Error in findOrCreateConversation`, { error });
    throw error;
  }
}

// Helper function to get recent conversation history with improved token consideration
async function getRecentConversationHistory(conversationId: string, maxTokens = 1000) {
  try {
    // Get message count first to determine how many to fetch
    const { data: countData, error: countError } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('id', { count: 'exact' })
      .eq('conversation_id', conversationId);
    
    if (countError) throw countError;
    
    // Calculate how many messages to fetch (estimate 50 tokens per message on average)
    // This is a simple heuristic - adjust based on your actual message sizes
    const messageCount = countData || 0;
    const estimatedMessagesToFetch = Math.min(Math.floor(maxTokens / 50), messageCount, 10);
    
    // Always include at least 3 messages if available
    const messagesToFetch = Math.max(estimatedMessagesToFetch, Math.min(3, messageCount));
    
    // Fetch the messages
    const { data, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(messagesToFetch);

    if (error) throw error;
    
    // Log the conversation history retrieval
    await logDebug('CONVERSATION_HISTORY', `Retrieved ${data.length} messages from conversation ${conversationId}`, {
      messageCount: data.length,
      maxTokensAllowed: maxTokens,
      estimatedTokensUsed: data.reduce((sum, msg) => sum + Math.ceil(msg.content.length * 0.25), 0)
    });
    
    return data.reverse();
  } catch (error) {
    logger.error('Error in getRecentConversationHistory:', error);
    return [];
  }
}

// Default API URL - Set to the correct Evolution API URL
const DEFAULT_EVOLUTION_API_URL = 'https://api.convgo.com';

// Helper function to save webhook message
async function saveWebhookMessage(instance: string, event: string, data: any) {
  try {
    await logDebug('WEBHOOK_SAVE', `Saving webhook message for instance ${instance}, event ${event}`);
    
    const { error } = await supabaseAdmin.from('webhook_messages').insert({
      instance,
      event,
      data
    });
    
    if (error) {
      await logDebug('WEBHOOK_SAVE_ERROR', 'Error saving webhook message', { error, instance, event });
      logger.error('Error saving webhook message:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    await logDebug('WEBHOOK_SAVE_EXCEPTION', 'Exception when saving webhook message', { error, instance, event });
    logger.error('Exception when saving webhook message:', error);
    return false;
  }
}

/**
 * Process buffered messages batch for AI
 * This function is called when a buffer is flushed with one or more messages
 * @param messages Array of buffered messages to process together
 */
async function processBufferedMessages(messages: BufferedMessage[]): Promise<void> {
  try {
    if (!messages.length) return;
    
    // Sort messages by timestamp to ensure correct processing order
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
    // Extract key information from the first message for context
    const firstMessage = messages[0];
    const instanceName = firstMessage.instanceName;
    const fromNumber = firstMessage.fromNumber;
    
    await logDebug('BUFFER_BATCH_PROCESSING', 'Processing buffered message batch', {
      instanceName,
      fromNumber,
      messageCount: messages.length,
      timeSpan: messages[messages.length - 1].timestamp - messages[0].timestamp
    });
    
    // Combine all message texts with proper formatting
    let combinedText = "";
    let latestMessageId = "";
    let latestMessageData = null;
    let hasImage = false;
    let imageUrl = null;
    
    // Process and combine all messages
    for (const message of messages) {
      // Track the latest message ID and data for processing
      latestMessageId = message.messageId;
      latestMessageData = message.messageData;
      
      // Check for image content
      if (message.imageUrl) {
        hasImage = true;
        imageUrl = message.imageUrl;
      }
      
      // Add text content with proper spacing
      if (message.messageText) {
        if (combinedText) combinedText += "\n";
        combinedText += message.messageText;
      }
    }
    
    // Ensure we have at least some text content
    if (!combinedText && hasImage) {
      combinedText = "Please analyze this image.";
    } else if (!combinedText && !hasImage) {
      await logDebug('BUFFER_EMPTY_BATCH', 'Buffer batch has no text or image content', {
        instanceName,
        fromNumber,
        messageCount: messages.length
      });
      return;
    }
    
    // Now proceed with existing processing logic but with the combined message
    // Get instance ID from instance name
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      await logDebug('AI_CONFIG_ERROR', 'Instance not found in database', { 
        instanceName, 
        error: instanceError 
      });
      console.error('Error getting instance data:', instanceError);
      return;
    }
    
    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber);
    await logDebug('CONVERSATION_MANAGED', 'Conversation found or created for buffered messages', { 
      conversationId,
      messageCount: messages.length
    });

    // Store the combined message in conversation
    await storeMessageInConversation(
      conversationId, 
      'user', 
      combinedText, 
      latestMessageId, 
      supabaseAdmin
    );
    
    // Get conversation history
    const conversationHistory = await getRecentConversationHistory(conversationId, 800);
    
    // Check if this instance has AI enabled
    await logDebug('AI_CONFIG_CHECK', 'Checking if AI is enabled for buffered messages', { instanceName });
    
    const instanceId = instanceData.id;
    
    // Check if AI is enabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .maybeSingle();

    if (aiConfigError || !aiConfig) {
      await logDebug('AI_DISABLED', 'AI is not enabled for this instance', { 
        instanceId, 
        error: aiConfigError 
      });
      console.error('AI not enabled for this instance:', aiConfigError || 'No active config found');
      return;
    }

    // Get files for RAG
    const { data: fileMappings, error: fileMappingsError } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);

    if (fileMappingsError) {
      await logDebug('AI_FILE_MAPPING_ERROR', 'Error getting file mappings for buffered messages', { 
        instanceId, 
        error: fileMappingsError 
      });
      console.error('Error getting file mappings:', fileMappingsError);
      return;
    }

    // Extract file IDs
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    
    // Initialize instance base URL from last message data
    let instanceBaseUrl = '';
    
    // Try to determine the base URL for this instance
    try {
      await logDebug('AI_EVOLUTION_URL_CHECK', 'Determining EVOLUTION API URL for buffered messages', { instanceId });
      
      // First check if server_url is in the latest message
      if (latestMessageData && latestMessageData.server_url) {
        instanceBaseUrl = latestMessageData.server_url;
      } else {
        // If not in the message, try to get from webhook config
        const { data: webhookConfig, error: webhookError } = await supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('webhook_url')
          .eq('whatsapp_instance_id', instanceId)
          .maybeSingle();
          
        if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
          // Extract base URL from webhook URL
          const url = new URL(webhookConfig.webhook_url);
          instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
        } else {
          // Default fallback
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
        }
      }
    } catch (error) {
      // Fallback to default URL on error
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      await logDebug('AI_EVOLUTION_URL_ERROR', 'Error determining URL, using default', { 
        instanceBaseUrl,
        error
      });
    }

    // Perform semantic search for context
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: combinedText,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        limit: 5,
        threshold: 0.3
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      await logDebug('AI_SEARCH_ERROR', 'Semantic search failed for buffered messages', { 
        status: searchResponse.status,
        error: errorText
      });
      console.error('Semantic search failed:', errorText);
      
      // Continue with empty context
      await logDebug('AI_SEARCH_FALLBACK', 'Continuing with empty context for buffered messages');
      return await generateAndSendAIResponse(
        combinedText, 
        "", 
        instanceName, 
        fromNumber, 
        instanceBaseUrl, 
        aiConfig, 
        latestMessageData, 
        conversationId,
        supabaseUrl,
        supabaseServiceKey,
        imageUrl
      );
    }

    const searchResults = await searchResponse.json();
    
    // Assemble context with both conversation history and RAG
    let context = '';
    let ragContext = '';
    
    // Format conversation history
    const conversationContext = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
    
    // Format RAG results if available
    if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
      const topResults = searchResults.results.slice(0, 3);
      
      ragContext = topResults
        .map((result, index) => `DOCUMENT ${index + 1} (similarity: ${result.similarity.toFixed(2)}):\n${result.content.trim()}`)
        .join('\n\n---\n\n');
      
      context = `${conversationContext}\n\n${ragContext}`;
    } else {
      // Only conversation history is available
      context = conversationContext;
    }

    // Generate and send the AI response for the combined message
    await generateAndSendAIResponse(
      combinedText,
      context,
      instanceName,
      fromNumber,
      instanceBaseUrl,
      aiConfig,
      latestMessageData,
      conversationId,
      supabaseUrl,
      supabaseServiceKey,
      imageUrl
    );
  } catch (error) {
    await logDebug('BUFFER_PROCESSING_ERROR', 'Error processing buffered messages', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('Error processing buffered messages:', error);
  }
}

// Helper function to process message for AI - Modified to use buffer
async function processMessageForAI(instance: string, messageData: any) {
  try {
    await logDebug('AI_PROCESS_START', 'Starting AI message processing', { instance });
    
    // Extract key information from the message
    const instanceName = instance;
    const fromNumber = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    let messageText = messageData.transcribedText || // Use already transcribed text if available
                    messageData.message?.conversation || 
                    messageData.message?.extendedTextMessage?.text ||
                    messageData.message?.imageMessage?.caption ||
                    null;
    const remoteJid = messageData.key?.remoteJid || '';
    const isFromMe = messageData.key?.fromMe || false;
    const messageId = messageData.key?.id || `msg_${Date.now()}`;
    
    await logDebug('AI_MESSAGE_DETAILS', 'Extracted message details', { 
      instanceName, 
      fromNumber, 
      messageText, 
      remoteJid, 
      isFromMe,
      messageId
    });

    // Skip processing if:
    // 1. Message is from a group chat (contains @g.us)
    // 2. Message is from the bot itself (fromMe is true)
    if (remoteJid.includes('@g.us') || isFromMe) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: Group message or sent by bot', {
        isGroup: remoteJid.includes('@g.us'),
        isFromMe
      });
      return false;
    }

    // Process image content if present
    let imageUrl = null;
    if (messageData.message?.imageMessage) {
      await logDebug('IMAGE_MESSAGE_DETECTED', 'Detected image message', {
        hasCaption: !!messageData.message.imageMessage.caption,
        mimeType: messageData.message.imageMessage.mimetype || 'Unknown'
      });
      
      // Extract image details
      const imageMessage = messageData.message.imageMessage;
      const rawImageUrl = imageMessage.url;
      const mediaKey = imageMessage.mediaKey;
      const mimeType = imageMessage.mimetype || 'image/jpeg';
      
      // Determine Evolution API key for image processing
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      // Process the image to get a viewable URL
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
              imageUrl = result.mediaUrl; // Set the processed URL
              
              // If this is an image-only message (no caption/text), set a default message text
              if (!messageText && imageUrl) {
                messageText = "Please analyze this image.";
              }
            }
          }
        } catch (error) {
          await logDebug('IMAGE_PROCESS_EXCEPTION', 'Exception during image processing', {
            error: error.message,
            stack: error.stack
          });
          // Continue with just the text if image processing fails
        }
      }
    }

    // Process audio message if needed
    if (hasAudioContent(messageData)) {
      await logDebug('AUDIO_MESSAGE_DETECTED', 'Audio message detected', { 
        messageType: messageData.messageType,
        hasAudioMessage: !!messageData.message?.audioMessage,
        hasPttMessage: !!messageData.message?.pttMessage
      });
      
      // Extract audio details
      const audioDetails = extractAudioDetails(messageData);
      
      // Get API keys for transcription
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      // Process the audio for transcription
      const transcriptionResult = await processAudioMessage(audioDetails, instanceName, fromNumber, evolutionApiKey);
      
      // If direct response was provided, skip the buffer and respond immediately
      if (transcriptionResult.bypassAiProcessing && transcriptionResult.directResponse) {
        await logDebug('AUDIO_DIRECT_RESPONSE', 'Using direct response for disabled voice processing', {
          directResponse: transcriptionResult.directResponse
        });
        
        // Try to send direct response without AI processing
        try {
          // Determine the base URL
          let instanceBaseUrl = messageData.server_url || Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
          
          // Send direct response through WhatsApp
          if (instanceBaseUrl && fromNumber) {
            const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
            
            const sendResponse = await fetch(sendUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionApiKey
              },
              body: JSON.stringify({
                number: fromNumber,
                text: transcriptionResult.directResponse
              })
            });

            if (sendResponse.ok) {
              const sendResult = await sendResponse.json();
              await logDebug('DIRECT_RESPONSE_SENT', 'Direct response sent successfully', { sendResult });
              return true;
            }
          }
        } catch (error) {
          await logDebug('DIRECT_RESPONSE_EXCEPTION', 'Exception sending direct response', { error });
          // Continue with normal processing as fallback
        }
      }
      
      // Use transcription if successful
      if (transcriptionResult.success) {
        messageText = transcriptionResult.transcription;
      } else if (transcriptionResult.transcription) {
        // Fallback transcription if available
        messageText = transcriptionResult.transcription;
      } else {
        // Complete failure - set generic placeholder
        messageText = "This is a voice message that could not be processed.";
      }
    }

    // If no message content (text or processed audio), skip
    if (!messageText && !imageUrl) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: No text or image content');
      return false;
    }
    
    // Create a buffered message object
    const bufferedMessage: BufferedMessage = {
      messageData: messageData,
      timestamp: Date.now(),
      instanceName,
      fromNumber,
      messageText,
      messageId,
      imageUrl
    };
    
    // Add the message to the buffer for the conversation
    await logDebug('MESSAGE_BUFFER_ADD_ATTEMPT', 'Adding message to buffer', {
      instanceName,
      fromNumber,
      messageId
    });
    
    const added = messageBufferManager.addMessage(bufferedMessage, async (messages) => {
      // This callback is executed when the buffer is flushed (timeout or max size)
      await processBufferedMessages(messages);
    });
    
    if (added) {
      await logDebug('MESSAGE_BUFFER_ADD_SUCCESS', 'Message successfully added to buffer', {
        instanceName,
        fromNumber,
        bufferStats: messageBufferManager.getStats()
      });
      return true;
    } else {
      await logDebug('MESSAGE_BUFFER_ADD_FAILED', 'Failed to add message to buffer');
      return false;
    }
  } catch (error) {
    await logDebug('AI_PROCESS_EXCEPTION', 'Unhandled exception in AI processing', { error });
    console.error('Error in processMessageForAI:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  // Log the incoming request
  await logDebug('WEBHOOK_REQUEST', 'WEBHOOK REQUEST RECEIVED', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Log full path analysis for debugging
    await logDebug('PATH_ANALYSIS', 'Full request path analysis', { 
      fullPath: url.pathname,
      pathParts 
    });
    
    // Get the request body for further processing
    let data;
    try {
      data = await req.json();
      await logDebug('WEBHOOK_PAYLOAD', 'Webhook payload received', { data });
      
      // Check if message contains audio
      if (data && hasAudioContent(data)) {
        await logDebug('AUDIO_CONTENT_DETECTED', 'Audio content detected in webhook payload', {
          messageType: data.messageType,
          hasAudioMessage: !!data.message?.audioMessage
        });
      }
    } catch (error) {
      await logDebug('WEBHOOK_PAYLOAD_ERROR', 'Failed to parse webhook payload', { error });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
        { 
          status: 400, 
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    // Try to extract the instance name from the path first (for backward compatibility)
    let instanceName = null;
    
    // Pattern 1: Direct path format
    if (pathParts.length >= 3 && pathParts[0] === 'api') {
      instanceName = pathParts[1];
      await logDebug('WEBHOOK_PATH_DIRECT', `Direct webhook path detected for instance: ${instanceName}`);
    }
    // Pattern 2: Supabase prefixed path format
    else if (pathParts.length >= 6 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook' && 
             pathParts[3] === 'api') {
      instanceName = pathParts[4];
      await logDebug('WEBHOOK_PATH_SUPABASE', `Supabase prefixed webhook path detected for instance: ${instanceName}`);
    }
    // Pattern 3: Another possible edge function URL format with just the instance in the path
    else if (pathParts.length >= 4 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook') {
      // Try to extract instance from the next path part
      instanceName = pathParts[3];
      await logDebug('WEBHOOK_PATH_ALTERNATIVE', `Alternative webhook path detected, using: ${instanceName}`);
    }
    
    // If instance name is not found in the path, try to extract it from the payload
    // This handles the simple path format that EVOLUTION API is using
    if (!instanceName && data) {
      if (data.instance) {
        instanceName = data.instance;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instance from payload: ${instanceName}`);
      } else if (data.instanceId) {
        instanceName = data.instanceId;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instanceId from payload: ${instanceName}`);
      } else if (data.data && data.data.instance) {
        // Handle nested instance name in data object
        instanceName = data.data.instance;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instance from nested data: ${instanceName}`);
      }
    }
    
    // If we have identified an instance name, process the webhook
    if (instanceName) {
      await logDebug('WEBHOOK_INSTANCE', `Processing webhook for instance: ${instanceName}`);
      
      // NEW CODE: Check if the instance is a support phone number
      const isSupportNumber = await isSupportPhoneNumber(instanceName);
      if (isSupportNumber) {
        await logDebug('SUPPORT_NUMBER_DETECTED', `Ignoring webhook from support phone number: ${instanceName}`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Ignored webhook from support phone number' 
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Different webhook events have different structures
      // We need to normalize based on the structure
      let event = 'unknown';
      let normalizedData = data;
      
      // NEW: First check if this is a connection status event
      if (isConnectionStatusEvent(data)) {
        event = 'connection.update';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_CONNECTION_STATE', `Connection state event detected: ${data.data?.state || data.state}`);
        
        // Save the webhook message to the database first
        const saved = await saveWebhookMessage(instanceName, event, normalizedData);
        if (saved) {
          await logDebug('WEBHOOK_CONNECTION_SAVED', 'Connection state event saved successfully');
        }
        
        // Process the connection status update
        await processConnectionStatus(instanceName, normalizedData);
        
        // Return success response for connection events
        return new Response(JSON.stringify({ 
          success: true,
          message: `Connection state processed for instance ${instanceName}`
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Continuing with existing event detection logic
      else if (data.event) {
        // This is the standard format
        event = data.event;
        normalizedData = data.data || data;
        await logDebug('WEBHOOK_EVENT_STANDARD', `Standard event format detected: ${event}`);
      } else if (data.key && data.key.remoteJid) {
        // This is a message format
        event = 'messages.upsert';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_MESSAGE', 'Message event detected');
      } else if (data.status) {
        // This is a connection status event
        event = 'connection.update';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_CONNECTION', `Connection event detected: ${data.status}`);
      } else if (data.qrcode) {
        // This is a QR code event
        event = 'qrcode.updated';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_QRCODE', 'QR code event detected');
      }
      
      // Save the webhook message to the database
      const saved = await saveWebhookMessage(instanceName, event, normalizedData);
      
      if (saved) {
        await logDebug('WEBHOOK_SAVED', 'Webhook message saved successfully');
      }
      
      // Process for support escalation if this is a message event
      let skipAiProcessing = false;
      let foundInstanceId = null;
      let transcribedText = null; // Add variable to store transcribed text for voice messages
      
      // Look up the instance ID if this is a message event
      if (event === 'messages.upsert') {
        try {
          // Get instance ID from instance name before checking for escalation
          const { data: instanceData, error: instanceError } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('id')
            .eq('instance_name', instanceName)
            .maybeSingle();
            
          if (instanceData) {
            foundInstanceId = instanceData.id;
            await logDebug('INSTANCE_LOOKUP_SUCCESS', 'Found instance ID for escalation check', { 
              instanceName, 
              instanceId: foundInstanceId 
            });
          } else {
            // Handle case where instance isn't found without throwing errors
            await logDebug('INSTANCE_LOOKUP_WARNING', 'Instance not found but continuing processing', { 
              instanceName, 
              error: instanceError 
            });
            // Allow processing to continue without the instance ID
          }

          // Modified flow: First check if this is a voice message that needs transcription
          let needsTranscription = false;
          
          if (hasAudioContent(normalizedData)) {
            await logDebug('VOICE_MESSAGE_ESCALATION', 'Detected voice message, will transcribe before escalation check');
            
            // Extract audio details
            const audioDetails = extractAudioDetails(normalizedData);
            
            // Get API keys for transcription
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || normalizedData.apikey;
            
            // Process the audio for transcription first
            const transcriptionResult = await processAudioMessage(audioDetails, instanceName, 
              normalizedData.key?.remoteJid?.split('@')[0] || '', evolutionApiKey);
            
            if (transcriptionResult.success && transcriptionResult.transcription) {
              transcribedText = transcriptionResult.transcription;
              await logDebug('VOICE_TRANSCRIPTION_FOR_ESCALATION', 'Successfully transcribed voice message for escalation check', {
                transcription: transcribedText
              });
            } else {
              await logDebug('VOICE_TRANSCRIPTION_FAILED_FOR_ESCALATION', 'Failed to transcribe voice message for escalation check', {
                error: transcriptionResult.error
              });
            }
          }
          
          // Prepare webhook data for escalation check
          const webhookData = {
            instance: instanceName,
            event: event,
            data: normalizedData
          };
          
          await logDebug('SUPPORT_ESCALATION_CHECK', 'Checking message for support escalation', { 
            instance: instanceName,
            hasTranscribedText: !!transcribedText
          });
          
          // Get Supabase URL and API keys from environment
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
          const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
          const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
          
          // Check for support escalation - passing the found instance ID and transcribed text
          const escalationResult = await handleSupportEscalation(
            webhookData,
            supabaseUrl,
            supabaseAnonKey,
            evolutionApiUrl,
            evolutionApiKey,
            supabaseServiceKey,
            foundInstanceId,  // Pass the already-found instance ID
            transcribedText   // Pass the transcribed text if available
          );
          
          await logDebug('SUPPORT_ESCALATION_RESULT', 'Support escalation check result', { 
            success: escalationResult.success,
            action: escalationResult.action,
            escalated: escalationResult.action === 'escalated',
            skipAi: !!escalationResult.skip_ai_processing,
            usedTranscribedText: !!transcribedText
          });
          
          // Set flag to skip AI processing if needed
          if (escalationResult.skip_ai_processing) {
            skipAiProcessing = true;
            await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing due to support escalation', {
              action: escalationResult.action,
              matchedKeyword: escalationResult.matched_keyword,
              category: escalationResult.category
            });
          }
        } catch (error) {
          // Log error but continue with AI processing
          await logDebug('SUPPORT_ESCALATION_ERROR', 'Error checking for support escalation', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          logger.error('Error checking for support escalation:', error);
          // Continue with AI processing despite escalation error
        }
      }
      
      // Process for AI if this is a message event and not escalated
      if (event === 'messages.upsert' && !skipAiProcessing) {
        await logDebug('AI_PROCESS_ATTEMPT', 'Attempting to process message for AI response');
        if (transcribedText) {
          // If we already transcribed the message for escalation, pass it to AI processing
          normalizedData.transcribedText = transcribedText;
          await logDebug('AI_USING_TRANSCRIPTION', 'Using already transcribed text for AI processing', {
            transcription: transcribedText
          });
        }
        await processMessageForAI(instanceName, normalizedData);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // If no valid instance name could be extracted, log this and return an error
    await logDebug('WEBHOOK_PATH_ERROR', 'No valid instance name could be extracted from path or payload', { 
      fullPath: url.pathname,
      pathParts,
      hasPayload: !!data,
      payloadKeys: data ? Object.keys(data) : []
    });
    
    return new Response(JSON.stringify({ success: false, error: 'Invalid webhook path or missing instance name in payload' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    await logDebug('WEBHOOK_ERROR', 'Error processing webhook', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    logger.error('Error processing webhook:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
