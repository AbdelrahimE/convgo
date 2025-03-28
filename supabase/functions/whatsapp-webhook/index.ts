import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleSupportEscalation } from "../_shared/escalation-utils.ts";

// Define standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role (for admin operations)
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
      console.error('Error checking support phone number:', error);
      return false;
    }
    
    // Return true if the instance name matches a support phone number
    return !!data;
  } catch (error) {
    // Handle any unexpected errors
    console.error('Exception checking support phone number:', error);
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
    console.error('Error in findOrCreateConversation:', error);
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
    console.error('Error in getRecentConversationHistory:', error);
    return [];
  }
}

// Helper function to store message in conversation with better metadata
async function storeMessageInConversation(conversationId: string, role: 'user' | 'assistant', content: string, messageId?: string) {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        message_id: messageId,
        metadata: {
          estimated_tokens: Math.ceil(content.length * 0.25),
          timestamp: new Date().toISOString()
        }
      });

    if (error) throw error;
    
    // Update conversation data with message count
    const { data: messageCount } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('id', { count: 'exact' })
      .eq('conversation_id', conversationId);
      
    // Update the conversation metadata
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ 
        last_activity: new Date().toISOString(),
        conversation_data: {
          context: {
            last_update: new Date().toISOString(),
            message_count: messageCount || 0,
            last_message_role: role
          }
        }
      })
      .eq('id', conversationId);
  } catch (error) {
    console.error('Error in storeMessageInConversation:', error);
    throw error;
  }
}

// Default API URL - Set to the correct Evolution API URL
const DEFAULT_EVOLUTION_API_URL = 'https://api.convgo.com';

// Debug logging function that logs to both console and database
async function logDebug(category: string, message: string, data?: any) {
  console.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    await supabaseAdmin.from('webhook_debug_logs').insert({
      category,
      message,
      data: data || null
    });
  } catch (error) {
    console.error('Failed to log debug info to database:', error);
  }
}

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
      console.error('Error saving webhook message:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    await logDebug('WEBHOOK_SAVE_EXCEPTION', 'Exception when saving webhook message', { error, instance, event });
    console.error('Exception when saving webhook message:', error);
    return false;
  }
}

// Helper function to download audio file from WhatsApp
async function downloadAudioFile(url: string, instance: string, evolutionApiKey: string): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
  try {
    await logDebug('AUDIO_DOWNLOAD_START', `Starting audio download request for URL: ${url}`);
    
    // We cannot directly download the encrypted WhatsApp audio file
    // Instead, we need to retrieve the decrypted media file through the EVOLUTION API
    
    if (!evolutionApiKey) {
      await logDebug('AUDIO_DOWNLOAD_ERROR', 'EVOLUTION_API_KEY not available');
      return { 
        success: false, 
        error: 'EVOLUTION API key not available for media download' 
      };
    }
    
    // Prepare Evolution API URL to download media
    // Using the format explained in the Evolution API docs
    const mediaUrl = url.split('?')[0]; // Remove query parameters
    const mediaId = mediaUrl.split('/').pop(); // Extract media ID
    
    if (!mediaId) {
      return { success: false, error: 'Could not extract media ID from URL' };
    }
    
    await logDebug('AUDIO_DOWNLOAD_MEDIA_ID', `Extracted media ID: ${mediaId}`);
    
    // We're returning the URL that will be used with the proper headers in the transcription function
    // This is more reliable than downloading here and passing the bytes
    return {
      success: true,
      audioUrl: url
    };
  } catch (error) {
    await logDebug('AUDIO_DOWNLOAD_ERROR', 'Error processing audio file URL', { error });
    return { success: false, error: error.message };
  }
}

// Helper function to determine if a message contains audio
function hasAudioContent(messageData: any): boolean {
  return (
    messageData?.message?.audioMessage || 
    (messageData?.messageType === 'audioMessage') ||
    (messageData?.message?.pttMessage)
  );
}

// Helper function to extract audio details from the message
function extractAudioDetails(messageData: any): { 
  url: string | null; 
  mediaKey: string | null;
  duration: number | null;
  mimeType: string | null;
  ptt: boolean;
} {
  // Check for audioMessage object
  const audioMessage = messageData?.message?.audioMessage;
  if (audioMessage) {
    return {
      url: audioMessage.url || null,
      mediaKey: audioMessage.mediaKey || null,
      duration: audioMessage.seconds || null,
      mimeType: audioMessage.mimetype || 'audio/ogg; codecs=opus',
      ptt: audioMessage.ptt || false
    };
  }
  
  // Check for pttMessage object (Push To Talk - voice messages)
  const pttMessage = messageData?.message?.pttMessage;
  if (pttMessage) {
    return {
      url: pttMessage.url || null,
      mediaKey: pttMessage.mediaKey || null,
      duration: pttMessage.seconds || null,
      mimeType: pttMessage.mimetype || 'audio/ogg; codecs=opus',
      ptt: true
    };
  }
  
  // No audio content found
  return {
    url: null,
    mediaKey: null,
    duration: null,
    mimeType: null,
    ptt: false
  };
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
      preferredLanguage: preferredLanguage,  // Log the preferred language used
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
