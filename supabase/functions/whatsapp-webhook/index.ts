
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

// Helper function to handle audio transcription
async function processAudioMessage(audioDetails: any, instanceName: string, fromNumber: string, evolutionApiKey: string): Promise<{ success: boolean; transcription?: string; error?: string; bypassAiProcessing?: boolean; directResponse?: string }> {
  try {
    await logDebug('AUDIO_PROCESSING_START', 'Starting audio processing', { instanceName, fromNumber });
    
    // Check if this instance has disabled voice message processing
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError) {
      await logDebug('AUDIO_PROCESSING_INSTANCE_ERROR', 'Failed to get instance data', { error: instanceError });
      return { 
        success: false, 
        error: 'Instance not found',
        transcription: "This is a voice message that could not be processed because the instance was not found."
      };
    }

    // Check if voice processing is disabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('process_voice_messages, voice_message_default_response, default_voice_language')
      .eq('whatsapp_instance_id', instanceData.id)
      .maybeSingle();

    // Get the preferred language from AI config if available
    const preferredLanguage = aiConfig?.default_voice_language || 'auto';
    await logDebug('AUDIO_LANGUAGE_PREFERENCE', 'Using voice language preference from AI config', { 
     preferredLanguage, 
     instanceId: instanceData.id 
    });

    if (!aiConfigError && aiConfig && aiConfig.process_voice_messages === false) {
      await logDebug('AUDIO_PROCESSING_DISABLED', 'Voice message processing is disabled for this instance', { 
        instanceId: instanceData.id,
        instanceName,
        customResponseExists: !!aiConfig.voice_message_default_response 
      });
      
      // If voice processing is disabled, return the custom message and flag to bypass AI processing
      return {
        success: false,
        error: 'Voice message processing is disabled',
        transcription: aiConfig.voice_message_default_response || "Voice message processing is disabled.",
        bypassAiProcessing: true, // Flag to indicate we should bypass AI processing
        directResponse: aiConfig.voice_message_default_response || "Voice message processing is disabled."
      };
    }
    
    if (!audioDetails.url) {
      return { 
        success: false, 
        error: 'No audio URL available in message',
        transcription: "This is a voice message that could not be processed because no audio URL was found."
      };
    }
    
    // Get the audio URL that we can access with the Evolution API key
    const downloadResult = await downloadAudioFile(audioDetails.url, instanceName, evolutionApiKey);
    
    if (!downloadResult.success || !downloadResult.audioUrl) {
      await logDebug('AUDIO_DOWNLOAD_FAILED', 'Failed to get audio URL', { error: downloadResult.error });
      return {
        success: false,
        error: downloadResult.error,
        transcription: "This is a voice message that could not be transcribed. Voice transcription error: " + downloadResult.error
      };
    }
    
    await logDebug('AUDIO_URL_RETRIEVED', 'Successfully retrieved audio URL for transcription');
    
    // Call the transcription function with the preferred language parameter
    const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-voice-transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        audioUrl: downloadResult.audioUrl,
        mimeType: audioDetails.mimeType || 'audio/ogg; codecs=opus',
        instanceName: instanceName,
        evolutionApiKey: evolutionApiKey,
        mediaKey: audioDetails.mediaKey,
        preferredLanguage: preferredLanguage  // Pass the language preference
      })
    });
    
    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      await logDebug('AUDIO_TRANSCRIPTION_API_ERROR', 'Error from transcription API', { status: transcriptionResponse.status, error: errorText });
      
      return {
        success: false,
        error: `Transcription API error: ${transcriptionResponse.status}`,
        transcription: "This is a voice message that could not be transcribed due to a service error."
      };
    }
    
    const transcriptionResult = await transcriptionResponse.json();
    
    if (!transcriptionResult.success) {
      await logDebug('AUDIO_TRANSCRIPTION_FAILED', 'Transcription process failed', { error: transcriptionResult.error });
      
      return {
        success: false,
        error: transcriptionResult.error,
        transcription: "This is a voice message that could not be transcribed."
      };
    }
    
    await logDebug('AUDIO_TRANSCRIPTION_SUCCESS', 'Successfully transcribed audio', { 
      language: transcriptionResult.language,
      preferredLanguage: preferredLanguage,
      transcription: transcriptionResult.transcription?.substring(0, 100) + '...'
    });
    
    return {
      success: true,
      transcription: transcriptionResult.transcription
    };
  } catch (error) {
    await logDebug('AUDIO_PROCESSING_ERROR', 'Error processing audio', { error });
    return { 
      success: false, 
      error: error.message,
      transcription: "This is a voice message that could not be processed due to a technical error."
    };
  }
}

// Helper function to process message for AI
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
    
    await logDebug('AI_MESSAGE_DETAILS', 'Extracted message details', { 
      instanceName, 
      fromNumber, 
      messageText, 
      remoteJid, 
      isFromMe 
    });

    // NEW: Check for and process image content
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
          await logDebug('IMAGE_PROCESSING', 'Processing image for AI analysis', {
            urlFragment: rawImageUrl.substring(0, 30) + '...',
            hasMediaKey: !!mediaKey
          });
          
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
              
              // FIX: If this is an image-only message (no caption/text), set a default message text
              // This ensures image-only messages will be processed
              if (!messageText && imageUrl) {
                messageText = "Please analyze this image.";
                await logDebug('IMAGE_ONLY_MESSAGE', 'Added default text for image-only message', {
                  defaultText: messageText
                });
              }
              
              await logDebug('IMAGE_PROCESSED', 'Successfully processed image for AI analysis', {
                originalUrlFragment: rawImageUrl.substring(0, 30) + '...',
                processedUrlFragment: result.mediaUrl.substring(0, 30) + '...',
                mediaType: result.mediaType
              });
            } else {
              await logDebug('IMAGE_PROCESS_FAILED', 'Image processing returned failure', result);
            }
          } else {
            const errorText = await imageProcessResponse.text();
            await logDebug('IMAGE_PROCESS_ERROR', 'Error response from image processing endpoint', {
              status: imageProcessResponse.status,
              error: errorText
            });
          }
        } catch (error) {
          await logDebug('IMAGE_PROCESS_EXCEPTION', 'Exception during image processing', {
            error: error.message,
            stack: error.stack
          });
          // Continue with just the text if image processing fails
        }
      } else {
        await logDebug('IMAGE_MISSING_DATA', 'Image message missing required data', {
          hasUrl: !!rawImageUrl,
          hasMediaKey: !!mediaKey
        });
      }
    }

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

    // Determine Evolution API key
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
    
    if (!evolutionApiKey) {
      await logDebug('AI_MISSING_API_KEY', 'EVOLUTION_API_KEY environment variable not set and no apikey in payload');
    }

    // Check if this is an audio message
    const isAudioMessage = hasAudioContent(messageData);
    
    // Variable to track if we should bypass AI and send direct response
    let bypassAiProcessing = false;
    let directResponse = null;
    
    if (isAudioMessage) {
      await logDebug('AUDIO_MESSAGE_DETECTED', 'Audio message detected', { 
        messageType: messageData.messageType,
        hasAudioMessage: !!messageData.message?.audioMessage,
        hasPttMessage: !!messageData.message?.pttMessage
      });
      
      // Extract audio details
      const audioDetails = extractAudioDetails(messageData);
      await logDebug('AUDIO_DETAILS', 'Extracted audio details', { audioDetails });
      
      // Process the audio for transcription
      const transcriptionResult = await processAudioMessage(audioDetails, instanceName, fromNumber, evolutionApiKey);
      
      // Check if we should bypass AI and send direct response
      if (transcriptionResult.bypassAiProcessing && transcriptionResult.directResponse) {
        await logDebug('AUDIO_DIRECT_RESPONSE', 'Using direct response for disabled voice processing', {
          directResponse: transcriptionResult.directResponse
        });
        
        // Initialize instance base URL for sending responses
        let instanceBaseUrl = '';

        // Try to determine the base URL for this instance (reusing existing code logic)
        try {
          await logDebug('AI_EVOLUTION_URL_CHECK', 'Determining EVOLUTION API URL for direct response', { instanceName });
          
          // IMPORTANT: First check if the server_url is available in the current message payload
          if (messageData.server_url) {
            instanceBaseUrl = messageData.server_url;
          } else {
            // Get instance ID to look up webhook config
            const { data: instanceData, error: instanceError } = await supabaseAdmin
              .from('whatsapp_instances')
              .select('id')
              .eq('instance_name', instanceName)
              .maybeSingle();

            if (instanceError) {
              await logDebug('DIRECT_RESPONSE_ERROR', 'Failed to get instance data', { error: instanceError });
              return false;
            }

            // If not available in the payload, try to get it from webhook config
            const { data: webhookConfig, error: webhookError } = await supabaseAdmin
              .from('whatsapp_webhook_config')
              .select('webhook_url')
              .eq('whatsapp_instance_id', instanceData.id)
              .maybeSingle();
              
            if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
              // Extract base URL from webhook URL
              const url = new URL(webhookConfig.webhook_url);
              instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
            } else {
              // If webhook URL doesn't exist, use the default Evolution API URL
              instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
            }
          }
        
          // Send direct response through WhatsApp without AI processing
          if (instanceBaseUrl && fromNumber) {
            await logDebug('DIRECT_RESPONSE_SENDING', 'Sending direct response to WhatsApp', {
              instanceName,
              toNumber: fromNumber,
              baseUrl: instanceBaseUrl,
              response: transcriptionResult.directResponse
            });
            
            // Construct the send message URL according to EVOLUTION API format
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

            if (!sendResponse.ok) {
              const errorText = await sendResponse.text();
              await logDebug('DIRECT_RESPONSE_ERROR', 'Error sending direct response', {
                status: sendResponse.status,
                error: errorText
              });
              return false;
            }

            const sendResult = await sendResponse.json();
            await logDebug('DIRECT_RESPONSE_SENT', 'Direct response sent successfully', { sendResult });
            return true;
          }
        } catch (error) {
          await logDebug('DIRECT_RESPONSE_EXCEPTION', 'Exception sending direct response', { error });
          return false;
        }
        
        // If we couldn't send the direct response, continue with normal processing as fallback
      }
      
      if (!transcriptionResult.success) {
        // If transcription failed but we have a fallback transcription, use it
        if (transcriptionResult.transcription) {
          messageText = transcriptionResult.transcription;
          
          await logDebug('AUDIO_FALLBACK_TRANSCRIPTION', 'Using fallback transcription for failed audio processing', {
            transcription: messageText
          });
        } else {
          // Complete failure - set generic placeholder
          messageText = "This is a voice message that could not be processed.";
          
          await logDebug('AUDIO_PROCESSING_FAILED', 'Failed to process audio with no fallback', {
            error: transcriptionResult.error
          });
        }
      } else {
        // Successful transcription
        messageText = transcriptionResult.transcription;
        
        await logDebug('AUDIO_TRANSCRIPTION_USED', 'Successfully transcribed audio message', {
          transcription: messageText?.substring(0, 100) + '...'
        });
      }
    }

    // If no message content (text or processed audio), skip
    if (!messageText && !imageUrl) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: No text or image content', { messageData });
      return false;
    }

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
      logger.error('Error getting instance data:', instanceError);
      return false;
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber);
    await logDebug('CONVERSATION_MANAGED', 'Conversation found or created', { conversationId });

    // NEW: Check for duplicate messages before processing
    const isDuplicate = await checkForDuplicateMessage(conversationId, messageText, supabaseAdmin);
    if (isDuplicate) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: Duplicate or similar message detected', {
        conversationId,
        fromNumber,
        messagePreview: messageText?.substring(0, 50) + '...'
      });
      return false;
    }

    // Store user message in conversation
    await storeMessageInConversation(conversationId, 'user', messageText, messageData.key?.id, supabaseAdmin);
    
    // Get recent conversation history with improved token management
    const conversationHistory = await getRecentConversationHistory(conversationId, 800);
    await logDebug('CONVERSATION_HISTORY', 'Retrieved conversation history', { 
      messageCount: conversationHistory.length,
      estimatedTokens: conversationHistory.reduce((sum, msg) => sum + Math.ceil(msg.content.length * 0.25), 0)
    });

    // Check if this instance has AI enabled
    await logDebug('AI_CONFIG_CHECK', 'Checking if AI is enabled for instance', { instanceName });
    
    const instanceId = instanceData.id;
    await logDebug('AI_INSTANCE_FOUND', 'Found instance in database', { instanceId, status: instanceData.status });

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
      logger.error('AI not enabled for this instance:', aiConfigError || 'No active config found');
      return false;
    }

    await logDebug('AI_ENABLED', 'AI is enabled for this instance', { 
      aiConfigId: aiConfig.id,
      temperature: aiConfig.temperature,
      systemPromptPreview: aiConfig.system_prompt.substring(0, 50) + '...'
    });

    // Get files associated with this instance for RAG
    const { data: fileMappings, error: fileMappingsError } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);

    if (fileMappingsError) {
      await logDebug('AI_FILE_MAPPING_ERROR', 'Error getting file mappings', { 
        instanceId, 
        error: fileMappingsError 
      });
      logger.error('Error getting file mappings:', fileMappingsError);
      return false;
    }

    // Extract file IDs
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    await logDebug('AI_FILE_MAPPINGS', 'Retrieved file mappings for instance', { 
      instanceId, 
      fileCount: fileIds.length,
      fileIds
    });

    if (fileIds.length === 0) {
      await logDebug('AI_NO_FILES', 'No files mapped to this instance, using empty context', { instanceId });
    }

    // Initialize instance base URL for sending responses
    let instanceBaseUrl = '';

    // Try to determine the base URL for this instance
    try {
      await logDebug('AI_EVOLUTION_URL_CHECK', 'Attempting to determine EVOLUTION API URL', { instanceId });
      
      // IMPORTANT: First check if the server_url is available in the current message payload
      if (messageData.server_url) {
        instanceBaseUrl = messageData.server_url;
        await logDebug('AI_EVOLUTION_URL_FROM_PAYLOAD', 'Using server_url from payload', { 
          instanceBaseUrl
        });
      } else {
        // If not available in the payload, try to get it from webhook config
        const { data: webhookConfig, error: webhookError } = await supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('webhook_url')
          .eq('whatsapp_instance_id', instanceId)
          .maybeSingle();
          
        if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
          // Extract base URL from webhook URL
          const url = new URL(webhookConfig.webhook_url);
          instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          await logDebug('AI_EVOLUTION_URL_FOUND', 'Extracted base URL from webhook config', { 
            instanceBaseUrl,
            webhookUrl: webhookConfig.webhook_url
          });
        } else {
          // If webhook URL doesn't exist, use the default Evolution API URL
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
          await logDebug('AI_EVOLUTION_URL_DEFAULT', 'Using default EVOLUTION API URL', { 
            instanceBaseUrl,
            webhookError
          });
        }
      }
    } catch (error) {
      // In case of any error, use the default Evolution API URL
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      await logDebug('AI_EVOLUTION_URL_ERROR', 'Error determining EVOLUTION API URL, using default', { 
        instanceBaseUrl,
        error
      });
    }

    await logDebug('AI_CONTEXT_SEARCH', 'Starting semantic search for context', { 
      userQuery: messageText,
      fileIds 
    });

    // Perform semantic search to find relevant contexts
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: messageText,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        limit: 5,
        threshold: 0.3
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      await logDebug('AI_SEARCH_ERROR', 'Semantic search failed', { 
        status: searchResponse.status,
        error: errorText
      });
      logger.error('Semantic search failed:', errorText);
      
      // Continue with empty context instead of failing
      await logDebug('AI_SEARCH_FALLBACK', 'Continuing with empty context due to search failure');
      return await generateAndSendAIResponse(messageText, context, instanceName, fromNumber, instanceBaseUrl, aiConfig, messageData, conversationId, imageUrl);
    }

    const searchResults = await searchResponse.json();
    await logDebug('AI_SEARCH_RESULTS', 'Semantic search completed', { 
      resultCount: searchResults.results?.length || 0,
      similarity: searchResults.results?.[0]?.similarity || 0
    });

    // IMPROVED CONTEXT ASSEMBLY: Balance between conversation history and RAG content
    let context = '';
    let ragContext = '';
    
    // 1. Format conversation history in a clean, token-efficient format
    const conversationContext = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
    
    // 2. Format RAG results if available - more token-efficient formatting
    if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
      // Only include the most relevant sections to save tokens
      const topResults = searchResults.results.slice(0, 3);
      
      // Join RAG content with separators and add source information
      ragContext = topResults
        .map((result, index) => `DOCUMENT ${index + 1} (similarity: ${result.similarity.toFixed(2)}):\n${result.content.trim()}`)
        .join('\n\n---\n\n');
      
      // 3. The context assembly is now handled by the balanceContextTokens function in generate-response
      context = `${conversationContext}\n\n${ragContext}`;
      
      await logDebug('AI_CONTEXT_ASSEMBLED', 'Enhanced context assembled for token balancing', { 
        conversationChars: conversationContext.length,
        ragChars: ragContext.length,
        totalChars: context.length,
        estimatedTokens: Math.ceil(context.length * 0.25)
      });
    } else {
      // Only conversation history is available
      context = conversationContext;
      await logDebug('AI_CONTEXT_ASSEMBLED', 'Context assembled with only conversation history', { 
        conversationChars: conversationContext.length,
        estimatedTokens: Math.ceil(conversationContext.length * 0.25)
      });
    }

    // Generate and send the response with improved context and token management
    return await generateAndSendAIResponse(
      messageText,
      context,
      instanceName,
      fromNumber,
      instanceBaseUrl,
      aiConfig,
      messageData,
      conversationId,
      imageUrl
    );
  } catch (error) {
    await logDebug('AI_PROCESS_EXCEPTION', 'Unhandled exception in AI processing', { error });
    logger.error('Error in processMessageForAI:', error);
    return false;
  }
}

// Helper function to generate and send AI response
async function generateAndSendAIResponse(
  query: string,
  context: string,
  instanceName: string,
  fromNumber: string,
  instanceBaseUrl: string,
  aiConfig: any,
  messageData: any,
  conversationId: string,
  imageUrl?: string | null
) {
  try {
    // Generate system prompt
    await logDebug('AI_SYSTEM_PROMPT', 'Using system prompt from configuration', { 
      userSystemPrompt: aiConfig.system_prompt
    });
    
    const systemPrompt = aiConfig.system_prompt;

    // Generate AI response with improved token management and include imageUrl
    await logDebug('AI_RESPONSE_GENERATION', 'Generating AI response with token management', {
      hasImageUrl: !!imageUrl
    });
    const responseGenResponse = await fetch(`${supabaseUrl}/functions/v1/generate-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: query,
        context: context,
        systemPrompt: systemPrompt,
        temperature: aiConfig.temperature || 0.7,
        model: 'gpt-4o-mini',
        maxContextTokens: 3000, // Explicit token limit
        imageUrl: imageUrl, // Pass the image URL if available
        userId: aiConfig.user_id || null
      })
    });

    if (!responseGenResponse.ok) {
      const errorText = await responseGenResponse.text();
      await logDebug('AI_RESPONSE_ERROR', 'AI response generation failed', {
        status: responseGenResponse.status,
        error: errorText
      });
      logger.error('AI response generation failed:', errorText);
      return false;
    }

    const responseData = await responseGenResponse.json();
    await logDebug('AI_RESPONSE_GENERATED', 'AI response generated successfully', {
      responsePreview: responseData.answer?.substring(0, 100) + '...',
      tokens: responseData.usage
    });

    // Log token usage if available
    if (responseData.tokenUsage) {
      await logDebug('AI_TOKEN_USAGE', 'Token usage details', responseData.tokenUsage);
    }

    // Store AI response in conversation history
    if (responseData.answer) {
      await storeMessageInConversation(conversationId, 'assistant', responseData.answer, undefined, supabaseAdmin);
    }

    // Save interaction to database
    try {
      await logDebug('AI_SAVING_INTERACTION', 'Saving AI interaction to database');
      
      const { error: interactionError } = await supabaseAdmin
        .from('whatsapp_ai_interactions')
        .insert({
          whatsapp_instance_id: aiConfig.whatsapp_instance_id,
          user_phone: fromNumber,
          user_message: query,
          ai_response: responseData.answer,
          prompt_tokens: responseData.usage?.prompt_tokens || 0,
          completion_tokens: responseData.usage?.completion_tokens || 0,
          total_tokens: responseData.usage?.total_tokens || 0,
          context_token_count: Math.ceil((context?.length || 0) / 4),
          search_result_count: context ? 1 : 0,
          response_model: responseData.model || 'gpt-4o-mini'
        });

      if (interactionError) {
        await logDebug('AI_INTERACTION_SAVE_ERROR', 'Error saving AI interaction', {
          error: interactionError
        });
        logger.error('Error saving AI interaction:', interactionError);
      } else {
        await logDebug('AI_INTERACTION_SAVED', 'AI interaction saved successfully');
      }
    } catch (error) {
      await logDebug('AI_INTERACTION_SAVE_EXCEPTION', 'Exception saving AI interaction', {
        error
      });
      logger.error('Exception saving AI interaction:', error);
    }

    // Send response back through WhatsApp
    if (instanceBaseUrl && fromNumber && responseData.answer) {
      await logDebug('AI_SENDING_RESPONSE', 'Sending AI response to WhatsApp', {
        instanceName,
        toNumber: fromNumber,
        baseUrl: instanceBaseUrl
      });
      
      // Determine Evolution API key
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      if (!evolutionApiKey) {
        await logDebug('AI_MISSING_API_KEY', 'EVOLUTION_API_KEY environment variable not set and no apikey in payload');
        logger.error('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
        return false;
      }

      // Construct the send message URL according to EVOLUTION API format
      const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
      await logDebug('AI_RESPONSE_URL', 'Constructed send message URL', { sendUrl });
      
      try {
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: fromNumber,
            text: responseData.answer
          })
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          await logDebug('AI_SEND_RESPONSE_ERROR', 'Error sending WhatsApp message', {
            status: sendResponse.status,
            error: errorText,
            sendUrl,
            headers: {
              'Content-Type': 'application/json',
              'apikey': '[REDACTED]'
            },
            body: {
              number: fromNumber,
              text: responseData.answer.substring(0, 50) + '...'
            }
          });
          logger.error('Error sending WhatsApp message:', errorText);
          return false;
        }

        const sendResult = await sendResponse.json();
        await logDebug('AI_RESPONSE_SENT', 'WhatsApp message sent successfully', { sendResult });
        return true;
      } catch (error) {
        await logDebug('AI_SEND_EXCEPTION', 'Exception sending WhatsApp message', { 
          error,
          sendUrl, 
          instanceBaseUrl,
          fromNumber
        });
        logger.error('Exception sending WhatsApp message:', error);
        return false;
      }
    } else {
      await logDebug('AI_SEND_MISSING_DATA', 'Missing data for sending WhatsApp message', {
        hasInstanceBaseUrl: !!instanceBaseUrl,
        hasFromNumber: !!fromNumber,
        hasResponse: !!responseData.answer
      });
      return false;
    }
  } catch (error) {
    await logDebug('AI_GENERATE_SEND_EXCEPTION', 'Exception in generate and send function', { error });
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
