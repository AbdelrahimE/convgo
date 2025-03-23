
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Define standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role (for admin operations)
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Updated helper function to find or create a conversation with improved timeout management and handling of unique constraint
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
      .single();

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
      .select('process_voice_messages, voice_message_default_response')
      .eq('whatsapp_instance_id', instanceData.id)
      .single();

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
        transcription: "This is a voice message that could not be processed. Voice transcription error: " + downloadResult.error
      };
    }
    
    await logDebug('AUDIO_URL_RETRIEVED', 'Successfully retrieved audio URL for transcription');
    
    // Call the transcription function
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
        mediaKey: audioDetails.mediaKey
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

// Helper function to check if a message appears to be an auto-response from our bot
// This helps prevent processing our own responses, which saves tokens and prevents
// incorrect conversation flow
async function isAutoResponseMessage(messageText: string, instanceId: string): Promise<boolean> {
  try {
    if (!messageText) return false;
    
    // Check if this instance has any custom auto-responses defined
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('voice_message_default_response')
      .eq('whatsapp_instance_id', instanceId)
      .single();
      
    if (aiConfigError) {
      await logDebug('AUTO_RESPONSE_CHECK_ERROR', 'Error checking for auto-response', { error: aiConfigError });
      return false;
    }
    
    // If we have a voice message default response and it matches the incoming message exactly
    // This is likely our bot's own message being echoed back
    if (aiConfig?.voice_message_default_response && 
        messageText.trim() === aiConfig.voice_message_default_response.trim()) {
      await logDebug('AUTO_RESPONSE_DETECTED', 'Detected message matching voice response template', {
        messagePreview: messageText.substring(0, 50) + '...',
      });
      return true;
    }
    
    return false;
  } catch (error) {
    await logDebug('AUTO_RESPONSE_CHECK_EXCEPTION', 'Exception when checking auto-response', { error });
    return false; // On error, default to processing the message
  }
}

// Helper function to process message for AI
async function processMessageForAI(instance: string, messageData: any) {
  try {
    await logDebug('AI_PROCESS_START', 'Starting AI message processing', { instance });
    
    // Extract key information from the message
    const instanceName = instance;
    const fromNumber = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    let messageText = messageData.message?.conversation || 
                    messageData.message?.extendedTextMessage?.text ||
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
              .single();

            if (instanceError) {
              await logDebug('DIRECT_RESPONSE_ERROR', 'Failed to get instance data', { error: instanceError });
              return false;
            }

            // If not available in the payload, try to get it from webhook config
            const { data: webhookConfig, error: webhookError } = await supabaseAdmin
              .from('whatsapp_webhook_config')
              .select('webhook_url')
              .eq('whatsapp_instance_id', instanceData.id)
              .single();
              
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
    if (!messageText) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: No text content', { messageData });
      return false;
    }

    // Get instance ID from instance name
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instanceData) {
      await logDebug('AI_CONFIG_ERROR', 'Instance not found in database', { 
        instanceName, 
        error: instanceError 
      });
      console.error('Error getting instance data:', instanceError);
      return false;
    }

    // NEW: Check if this message appears to be an auto-response from our system
    // This helps prevent processing our own messages that get echoed back via webhook
    const isAutoResponse = await isAutoResponseMessage(messageText, instanceData.id);
    if (isAutoResponse) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: Message appears to be our own auto-response', {
        messageTextPreview: messageText.substring(0, 50) + '...'
      });
      return false;
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber);
    await logDebug('CONVERSATION_MANAGED', 'Conversation found or created', { conversationId });

    // Store user message in conversation
    await storeMessageInConversation(conversationId, 'user', messageText, messageData.key?.id);
    
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
      .single();

    if (aiConfigError || !aiConfig) {
      await logDebug('AI_DISABLED', 'AI is not enabled for this instance', { 
        instanceId, 
        error: aiConfigError 
      });
      console.error('AI not enabled for this instance:', aiConfigError || 'No active config found');
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
      console.error('Error getting file mappings:', fileMappingsError);
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
          .single();
          
        if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
          // Extract base URL from webhook URL
          const url = new URL(webhookConfig.webhook_url);
          instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          
          await logDebug('AI_EVOLUTION_URL_FROM_WEBHOOK', 'Using base URL extracted from webhook URL', { 
            instanceBaseUrl, 
            webhookUrl: webhookConfig.webhook_url 
          });
        } else {
          // If webhook URL doesn't exist, use the default Evolution API URL
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
          
          await logDebug('AI_EVOLUTION_URL_DEFAULT', 'Using default API URL', { 
            instanceBaseUrl,
            fromEnv: !!Deno.env.get('EVOLUTION_API_URL')
          });
        }
      }
    } catch (error) {
      await logDebug('AI_EVOLUTION_URL_ERROR', 'Error determining API URL, using default', { 
        error,
        defaultUrl: DEFAULT_EVOLUTION_API_URL
      });
      
      // Fallback to default URL if extraction failed
      instanceBaseUrl = DEFAULT_EVOLUTION_API_URL;
    }

    // Get context for this query based on fileIds if available
    const contextResponse = await fetch(`${supabaseUrl}/functions/v1/assemble-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: messageText,
        fileIds,
        maxTokens: 2000, // Allocate enough tokens for the context
        conversationHistory
      })
    });

    let context = '';
    if (contextResponse.ok) {
      const contextResult = await contextResponse.json();
      if (contextResult.success && contextResult.context) {
        context = contextResult.context;
        await logDebug('AI_CONTEXT_RETRIEVED', 'Successfully retrieved context', {
          contextLength: context.length,
          estimatedTokens: Math.ceil(context.length * 0.25)
        });
      } else {
        await logDebug('AI_CONTEXT_EMPTY', 'No context found or error retrieving context', {
          success: contextResult.success,
          error: contextResult.error
        });
      }
    } else {
      await logDebug('AI_CONTEXT_ERROR', 'Error calling context assembly endpoint', {
        status: contextResponse.status
      });
    }

    // Get system prompt based on aiConfig and add context
    const systemPromptResponse = await fetch(`${supabaseUrl}/functions/v1/generate-system-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        baseSystemPrompt: aiConfig.system_prompt,
        context,
        maxTokens: 4000, // Allow plenty of tokens for system prompt
        languagePreference: aiConfig.language_preference || 'auto'
      })
    });

    let systemPrompt = aiConfig.system_prompt;
    if (systemPromptResponse.ok) {
      const systemPromptResult = await systemPromptResponse.json();
      if (systemPromptResult.success && systemPromptResult.systemPrompt) {
        systemPrompt = systemPromptResult.systemPrompt;
        await logDebug('AI_SYSTEM_PROMPT_GENERATED', 'Generated system prompt with context', {
          promptLength: systemPrompt.length,
          estimatedTokens: Math.ceil(systemPrompt.length * 0.25)
        });
      } else {
        await logDebug('AI_SYSTEM_PROMPT_ERROR', 'Error generating system prompt, using base prompt', {
          error: systemPromptResult.error
        });
      }
    } else {
      await logDebug('AI_SYSTEM_PROMPT_API_ERROR', 'API error generating system prompt', {
        status: systemPromptResponse.status
      });
    }

    // Generate AI response
    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/generate-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        model: aiConfig.model || 'gpt-4o-mini',
        systemPrompt,
        conversationHistory,
        userMessage: messageText,
        temperature: aiConfig.temperature || 0.7,
        maxTokens: aiConfig.max_tokens || 1024,
        fileIds
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      await logDebug('AI_GENERATION_API_ERROR', 'Error from AI generation API', {
        status: aiResponse.status,
        error: errorText
      });
      
      // If AI response generation failed, we can't send a response
      console.error('Error generating AI response:', aiResponse.status, errorText);
      return false;
    }

    const aiResult = await aiResponse.json();

    if (!aiResult.success) {
      await logDebug('AI_GENERATION_FAILED', 'AI generation process failed', {
        error: aiResult.error
      });
      
      // If AI response generation failed, we can't send a response
      console.error('Error in AI response generation:', aiResult.error);
      return false;
    }

    const assistantResponse = aiResult.response;
    await logDebug('AI_RESPONSE_GENERATED', 'Successfully generated AI response', {
      responseLength: assistantResponse.length,
      estimatedTokens: Math.ceil(assistantResponse.length * 0.25),
      preview: assistantResponse.substring(0, 100) + '...'
    });

    // Store assistant response in conversation
    await storeMessageInConversation(conversationId, 'assistant', assistantResponse);

    // Send the response back to the user via WhatsApp
    if (instanceBaseUrl && fromNumber) {
      await logDebug('AI_SENDING_RESPONSE', 'Sending AI response to WhatsApp', {
        instanceName,
        toNumber: fromNumber,
        baseUrl: instanceBaseUrl,
        responsePreview: assistantResponse.substring(0, 100) + '...'
      });
      
      // Construct the send message URL according to EVOLUTION API format
      const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
      
      // Check if we should chunk the response (if it's too long)
      const maxMessageLength = 4000; // WhatsApp has limitations on message length
      let responseToSend = assistantResponse;
      
      if (assistantResponse.length > maxMessageLength) {
        await logDebug('AI_RESPONSE_CHUNKING', 'Response exceeds maximum length, splitting into chunks', {
          responseLength: assistantResponse.length,
          maxLength: maxMessageLength,
          estimatedChunks: Math.ceil(assistantResponse.length / maxMessageLength)
        });
        
        // Split response into chunks at sensible points (e.g., paragraph breaks, sentences)
        const chunks = [];
        let remainingText = assistantResponse;
        
        while (remainingText.length > 0) {
          let chunkSize = Math.min(remainingText.length, maxMessageLength);
          
          // Try to find a good breaking point (paragraph, sentence)
          if (chunkSize < remainingText.length) {
            // Try to break at paragraph
            let breakPoint = remainingText.lastIndexOf('\n\n', maxMessageLength);
            
            if (breakPoint === -1 || breakPoint < maxMessageLength * 0.5) {
              // If no paragraph break found, or it's too early, try sentence
              breakPoint = remainingText.lastIndexOf('. ', maxMessageLength);
              
              if (breakPoint === -1 || breakPoint < maxMessageLength * 0.5) {
                // If no sentence break, try any break
                breakPoint = remainingText.lastIndexOf(' ', maxMessageLength);
                
                if (breakPoint === -1 || breakPoint < maxMessageLength * 0.8) {
                  // Last resort: just break at max length
                  breakPoint = maxMessageLength;
                }
              } else {
                // Move past the period and space
                breakPoint += 2;
              }
            } else {
              // Move past the paragraph breaks
              breakPoint += 2;
            }
            
            chunkSize = breakPoint;
          }
          
          chunks.push(remainingText.substring(0, chunkSize));
          remainingText = remainingText.substring(chunkSize);
        }
        
        await logDebug('AI_RESPONSE_CHUNKS', 'Split response into chunks', {
          chunkCount: chunks.length,
          chunkSizes: chunks.map(chunk => chunk.length)
        });
        
        // Send each chunk sequentially
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          await logDebug('AI_SENDING_CHUNK', `Sending chunk ${i+1} of ${chunks.length}`, {
            chunkLength: chunk.length
          });
          
          const chunkResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey
            },
            body: JSON.stringify({
              number: fromNumber,
              text: chunk
            })
          });

          if (!chunkResponse.ok) {
            const errorText = await chunkResponse.text();
            await logDebug('AI_SEND_CHUNK_ERROR', `Error sending chunk ${i+1}`, {
              status: chunkResponse.status,
              error: errorText
            });
            
            // Continue trying to send other chunks
            continue;
          }

          const chunkResult = await chunkResponse.json();
          await logDebug('AI_CHUNK_SENT', `Chunk ${i+1} sent successfully`, { 
            messageId: chunkResult.key?.id 
          });
          
          // Add a small delay between chunks to ensure proper ordering
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else {
        // Send the response as a single message
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: fromNumber,
            text: responseToSend
          })
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          await logDebug('AI_SEND_ERROR', 'Error sending AI response', {
            status: sendResponse.status,
            error: errorText
          });
          return false;
        }

        const sendResult = await sendResponse.json();
        await logDebug('AI_RESPONSE_SENT', 'AI response sent successfully', { sendResult });
      }
      
      return true;
    } else {
      await logDebug('AI_SEND_MISSING_INFO', 'Cannot send response, missing instance URL or number', {
        hasInstanceBaseUrl: !!instanceBaseUrl,
        hasFromNumber: !!fromNumber
      });
      return false;
    }
  } catch (error) {
    await logDebug('AI_PROCESSING_ERROR', 'Error in AI message processing', { error });
    console.error('Error processing message for AI:', error);
    return false;
  }
}

serve(async (req) => {
  // CORS check for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Log the request URL and method for debugging
    const url = new URL(req.url);
    const path = url.pathname;
    const pathParts = path.split('/').filter(Boolean);

    await logDebug('PATH_ANALYSIS', 'Full request path analysis', {
      fullPath: path,
      pathParts
    });

    // Log the full request details
    await logDebug('WEBHOOK_REQUEST', 'WEBHOOK REQUEST RECEIVED', {
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries())
    });

    // Handle status check from the frontend
    if (req.method === 'POST') {
      const requestData = await req.json();
      
      if (requestData.action === 'status') {
        // Check webhook status for all instances
        const { data: webhookConfigs, error: webhookError } = await supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('id, whatsapp_instance_id, webhook_url, is_active, last_status, last_checked_at');
          
        if (webhookError) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Error fetching webhook configurations: ' + webhookError.message
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          });
        }
        
        // Fetch instance information to match with webhooks
        const { data: instances, error: instancesError } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, instance_name');
          
        if (instancesError) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Error fetching instance data: ' + instancesError.message
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          });
        }
        
        // Map instance IDs to names
        const instanceMap = instances?.reduce((map, instance) => {
          map[instance.id] = instance.instance_name;
          return map;
        }, {}) || {};
        
        // Format webhook configs with instance names
        const activeWebhooks = webhookConfigs?.map(webhook => ({
          id: webhook.id,
          whatsapp_instance_id: webhook.whatsapp_instance_id,
          instance_name: instanceMap[webhook.whatsapp_instance_id] || 'Unknown',
          webhook_url: webhook.webhook_url,
          is_active: webhook.is_active,
          last_status: webhook.last_status,
          last_checked_at: webhook.last_checked_at
        })) || [];
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Webhook status retrieved successfully',
          activeWebhooks
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Regular webhook processing for messages from WhatsApp
    if (req.method === 'POST') {
      const payload = await req.json();
      
      // Log the full payload for debugging
      await logDebug('WEBHOOK_PAYLOAD', 'Webhook payload received', { data: payload });
      
      // Detect different webhook formats
      const isStandardFormat = payload?.event === 'messages.upsert';
      
      // For standard format (messages.upsert)
      if (isStandardFormat) {
        await logDebug('WEBHOOK_EVENT_STANDARD', 'Standard event format detected: messages.upsert');
        
        // Try to extract instance from payload
        let instance = payload?.instance || null;
        // Also check sender field as a backup
        if (!instance && payload?.sender) {
          instance = payload.sender.replace('@s.whatsapp.net', '');
          await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instance from payload: ${instance}`);
        }
        
        if (instance) {
          // Save the message for logging/debugging purposes
          await saveWebhookMessage(instance, 'messages.upsert', payload);
          
          // Process this specific webhook (for AI processing)
          await logDebug('WEBHOOK_INSTANCE', `Processing webhook for instance: ${instance}`);
          
          // Attempt to process the message for AI response
          await logDebug('AI_PROCESS_ATTEMPT', 'Attempting to process message for AI response');
          await processMessageForAI(instance, payload.data);
          
          // Return success response
          return new Response(JSON.stringify({
            success: true,
            message: 'Webhook received and processed'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          // No instance identified
          await logDebug('WEBHOOK_NO_INSTANCE', 'No instance found in payload');
          
          return new Response(JSON.stringify({
            success: false,
            error: 'No instance identified in webhook'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          });
        }
      } else {
        // Unknown format
        await logDebug('WEBHOOK_UNKNOWN_FORMAT', 'Unknown webhook format', { payload });
        
        // Still save the message for logging
        await saveWebhookMessage('unknown', 'unknown', payload);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Webhook received but format not recognized'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Default response for unsupported methods
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405
    });
  } catch (error) {
    // Log the error
    await logDebug('WEBHOOK_ERROR', 'Error processing webhook', { error: error.message, stack: error.stack });
    
    console.error('Error processing request:', error);
    
    // Return error response
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error: ' + error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
