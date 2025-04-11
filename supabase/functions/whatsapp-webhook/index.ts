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

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function isSupportPhoneNumber(instanceName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_support_config')
      .select('support_phone_number')
      .eq('support_phone_number', instanceName)
      .maybeSingle();
    
    if (error) {
      logger.error('Error checking support phone number:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    logger.error('Exception checking support phone number:', error);
    return false;
  }
}

async function findOrCreateConversation(instanceId: string, userPhone: string) {
  try {
    const { data: existingConversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, status, last_activity')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .eq('status', 'active')
      .single();

    if (!findError && existingConversation) {
      const lastActivity = new Date(existingConversation.last_activity);
      const currentTime = new Date();
      const hoursDifference = (currentTime.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursDifference > 6) {
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
          
        await logDebug('CONVERSATION_EXPIRED', `Conversation ${existingConversation.id} expired after ${hoursDifference.toFixed(2)} hours of inactivity`);
        
        const { data: anyConversation, error: anyError } = await supabaseAdmin
          .from('whatsapp_conversations')
          .select('id, status')
          .eq('instance_id', instanceId)
          .eq('user_phone', userPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (!anyError && anyConversation) {
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
        return existingConversation.id;
      }
    }

    const { data: inactiveConversation, error: inactiveError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .limit(1)
      .single();
      
    if (!inactiveError && inactiveConversation) {
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
    
    await logDebug('CONVERSATION_CREATED', `New conversation created for instance ${instanceId} and phone ${userPhone}`);
    
    return newConversation.id;
  } catch (error) {
    logger.error('Error in findOrCreateConversation:', error);
    await logDebug('CONVERSATION_ERROR', `Error in findOrCreateConversation`, { error });
    throw error;
  }
}

async function getRecentConversationHistory(conversationId: string, maxTokens = 1000) {
  try {
    const { data: countData, error: countError } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('id', { count: 'exact' })
      .eq('conversation_id', conversationId);
    
    if (countError) throw countError;
    
    const messageCount = countData || 0;
    const estimatedMessagesToFetch = Math.min(Math.floor(maxTokens / 50), messageCount, 10);
    
    const messagesToFetch = Math.max(estimatedMessagesToFetch, Math.min(3, messageCount));
    
    const { data, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(messagesToFetch);

    if (error) throw error;
    
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

const DEFAULT_EVOLUTION_API_URL = 'https://api.convgo.com';

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

async function processBufferedMessages(messages: BufferedMessage[]): Promise<void> {
  try {
    if (!messages.length) return;
    
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
    const firstMessage = messages[0];
    const instanceName = firstMessage.instanceName;
    const fromNumber = firstMessage.fromNumber;
    
    await logDebug('BUFFER_BATCH_PROCESSING', 'Processing buffered message batch', {
      instanceName,
      fromNumber,
      messageCount: messages.length,
      timeSpan: messages[messages.length - 1].timestamp - messages[0].timestamp,
      firstMessageTime: new Date(messages[0].timestamp).toISOString(),
      lastMessageTime: new Date(messages[messages.length - 1].timestamp).toISOString(),
      timeSpanSeconds: Math.round((messages[messages.length - 1].timestamp - messages[0].timestamp) / 1000)
    });
    
    let combinedText = "";
    let latestMessageId = "";
    let latestMessageData = null;
    let hasImage = false;
    let imageUrl = null;
    
    for (const message of messages) {
      latestMessageId = message.messageId;
      latestMessageData = message.messageData;
      
      if (message.imageUrl) {
        hasImage = true;
        imageUrl = message.imageUrl;
      }
      
      if (message.messageText) {
        if (combinedText) combinedText += "\n";
        combinedText += message.messageText;
      }
    }
    
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
    
    await logDebug('BUFFER_COMBINED_CONTENT', 'Combined content from buffered messages', {
      instanceName,
      fromNumber,
      messageCount: messages.length,
      contentLength: combinedText.length,
      hasImage,
      contentPreview: combinedText.substring(0, 100) + (combinedText.length > 100 ? '...' : '')
    });
    
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
    
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber);
    await logDebug('CONVERSATION_MANAGED', 'Conversation found or created for buffered messages', { 
      conversationId,
      messageCount: messages.length
    });

    await storeMessageInConversation(
      conversationId, 
      'user', 
      combinedText, 
      latestMessageId, 
      supabaseAdmin
    );
    
    const conversationHistory = await getRecentConversationHistory(conversationId, 800);
    
    const instanceId = instanceData.id;
    
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

    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    
    let instanceBaseUrl = '';
    
    try {
      await logDebug('AI_EVOLUTION_URL_CHECK', 'Determining EVOLUTION API URL for buffered messages', { instanceId });
      
      if (latestMessageData && latestMessageData.server_url) {
        instanceBaseUrl = latestMessageData.server_url;
      } else {
        const { data: webhookConfig, error: webhookError } = await supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('webhook_url')
          .eq('whatsapp_instance_id', instanceId)
          .maybeSingle();
          
        if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
          const url = new URL(webhookConfig.webhook_url);
          instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
        } else {
          instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
        }
      }
    } catch (error) {
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      await logDebug('AI_EVOLUTION_URL_ERROR', 'Error determining URL, using default', { 
        instanceBaseUrl,
        error
      });
    }

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
    
    let context = '';
    let ragContext = '';
    
    const conversationContext = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
    
    if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
      const topResults = searchResults.results.slice(0, 3);
      
      ragContext = topResults
        .map((result, index) => `DOCUMENT ${index + 1} (similarity: ${result.similarity.toFixed(2)}):\n${result.content.trim()}`)
        .join('\n\n---\n\n');
      
      context = `${conversationContext}\n\n${ragContext}`;
    } else {
      context = conversationContext;
    }

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

async function processMessageForAI(instance: string, messageData: any) {
  try {
    await logDebug('AI_PROCESS_START', 'Starting AI message processing', { instance });
    
    const instanceName = instance;
    const fromNumber = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    let messageText = messageData.transcribedText || 
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
      messageId,
      timestamp: Date.now(),
      receivedAt: new Date().toISOString()
    });

    if (remoteJid.includes('@g.us') || isFromMe) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: Group message or sent by bot', {
        isGroup: remoteJid.includes('@g.us'),
        isFromMe
      });
      return false;
    }

    let imageUrl = null;
    if (messageData.message?.imageMessage) {
      await logDebug('IMAGE_MESSAGE_DETECTED', 'Detected image message', {
        hasCaption: !!messageData.message.imageMessage.caption,
        mimeType: messageData.message.imageMessage.mimetype || 'Unknown'
      });
      
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
        }
      }
    }

    if (hasAudioContent(messageData)) {
      await logDebug('AUDIO_MESSAGE_DETECTED', 'Audio message detected', { 
        messageType: messageData.messageType,
        hasAudioMessage: !!messageData.message?.audioMessage,
        hasPttMessage: !!messageData.message?.pttMessage
      });
      
      const audioDetails = extractAudioDetails(messageData);
      
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      const transcriptionResult = await processAudioMessage(audioDetails, instanceName, fromNumber, evolutionApiKey);
      
      if (transcriptionResult.bypassAiProcessing && transcriptionResult.directResponse) {
        await logDebug('AUDIO_DIRECT_RESPONSE', 'Using direct response for disabled voice processing', {
          directResponse: transcriptionResult.directResponse
        });
        
        try {
          let instanceBaseUrl = messageData.server_url || Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
          
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
        }
      }
      
      if (transcriptionResult.success) {
        messageText = transcriptionResult.transcription;
      } else if (transcriptionResult.transcription) {
        messageText = transcriptionResult.transcription;
      } else {
        messageText = "This is a voice message that could not be processed.";
      }
    }

    if (!messageText && !imageUrl) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: No text or image content');
      return false;
    }
    
    const bufferedMessage: BufferedMessage = {
      messageData: messageData,
      timestamp: Date.now(),
      instanceName,
      fromNumber,
      messageText,
      messageId,
      imageUrl
    };
    
    const added = messageBufferManager.addMessage(bufferedMessage, async (messages) => {
      await processBufferedMessages(messages);
    });
    
    if (added) {
      await logDebug('MESSAGE_BUFFER_ADD_SUCCESS', 'Message successfully added to buffer', {
        instanceName,
        fromNumber,
        timestamp: bufferedMessage.timestamp,
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
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  await logDebug('WEBHOOK_REQUEST', 'WEBHOOK REQUEST RECEIVED', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    await logDebug('PATH_ANALYSIS', 'Full request path analysis', { 
      fullPath: url.pathname,
      pathParts 
    });
    
    let data;
    try {
      data = await req.json();
      await logDebug('WEBHOOK_PAYLOAD', 'Webhook payload received', { data });
      
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
    
    let instanceName = null;
    
    if (pathParts.length >= 3 && pathParts[0] === 'api') {
      instanceName = pathParts[1];
      await logDebug('WEBHOOK_PATH_DIRECT', `Direct webhook path detected for instance: ${instanceName}`);
    } else if (pathParts.length >= 6 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook' && 
             pathParts[3] === 'api') {
      instanceName = pathParts[4];
      await logDebug('WEBHOOK_PATH_SUPABASE', `Supabase prefixed webhook path detected for instance: ${instanceName}`);
    } else if (pathParts.length >= 4 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook') {
      instanceName = pathParts[3];
      await logDebug('WEBHOOK_PATH_ALTERNATIVE', `Alternative webhook path detected, using: ${instanceName}`);
    }
    
    if (!instanceName && data) {
      if (data.instance) {
        instanceName = data.instance;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instance from payload: ${instanceName}`);
      } else if (data.instanceId) {
        instanceName = data.instanceId;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instanceId from payload: ${instanceName}`);
      } else if (data.data && data.data.instance) {
        instanceName = data.data.instance;
        await logDebug('WEBHOOK_INSTANCE_FROM_PAYLOAD', `Extracted instance from nested data: ${instanceName}`);
      }
    }
    
    if (instanceName) {
      await logDebug('WEBHOOK_INSTANCE', `Processing webhook for instance: ${instanceName}`);
      
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
      
      let event = 'unknown';
      let normalizedData = data;
      
      if (isConnectionStatusEvent(data)) {
        event = 'connection.update';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_CONNECTION_STATE', `Connection state event detected: ${data.data?.state || data.state}`);
        
        const saved = await saveWebhookMessage(instanceName, event, normalizedData);
        if (saved) {
          await logDebug('WEBHOOK_CONNECTION_SAVED', 'Connection state event saved successfully');
        }
        
        await processConnectionStatus(instanceName, normalizedData);
        
        return new Response(JSON.stringify({ 
          success: true,
          message: `Connection state processed for instance ${instanceName}`
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } else if (data.event) {
        event = data.event;
        normalizedData = data.data || data;
        await logDebug('WEBHOOK_EVENT_STANDARD', `Standard event format detected: ${event}`);
      } else if (data.key && data.key.remoteJid) {
        event = 'messages.upsert';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_MESSAGE', 'Message event detected');
      } else if (data.status) {
        event = 'connection.update';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_CONNECTION', `Connection event detected: ${data.status}`);
      } else if (data.qrcode) {
        event = 'qrcode.updated';
        normalizedData = data;
        await logDebug('WEBHOOK_EVENT_QRCODE', 'QR code event detected');
      }
      
      const saved = await saveWebhookMessage(instanceName, event, normalizedData);
      
      if (saved) {
        await logDebug('WEBHOOK_SAVED', 'Webhook message saved successfully');
      }
      
      let skipAiProcessing = false;
      let foundInstanceId = null;
      let transcribedText = null;
      
      if (event === 'messages.upsert') {
        try {
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
            await logDebug('INSTANCE_LOOKUP_WARNING', 'Instance not found but continuing processing', { 
              instanceName, 
              error: instanceError 
            });
          }

          let needsTranscription = false;
          
          if (hasAudioContent(normalizedData)) {
            await logDebug('VOICE_MESSAGE_ESCALATION', 'Detected voice message, will transcribe before escalation check');
            
            const audioDetails = extractAudioDetails(normalizedData);
            
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || normalizedData.apikey;
            
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
          
          const webhookData = {
            instance: instanceName,
            event: event,
            data: normalizedData
          };
          
          await logDebug('SUPPORT_ESCALATION_CHECK', 'Checking message for support escalation', { 
            instance: instanceName,
            hasTranscribedText: !!transcribedText
          });
          
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
          const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
          const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
          
          const escalationResult = await handleSupportEscalation(
            webhookData,
            supabaseUrl,
            supabaseAnonKey,
            evolutionApiUrl,
            evolutionApiKey,
            supabaseServiceKey,
            foundInstanceId,
            transcribedText
          );
          
          await logDebug('SUPPORT_ESCALATION_RESULT', 'Support escalation check result', { 
            success: escalationResult.success,
            action: escalationResult.action,
            escalated: escalationResult.action === 'escalated',
            skipAi: !!escalationResult.skip_ai_processing,
            usedTranscribedText: !!transcribedText
          });
          
          if (escalationResult.skip_ai_processing) {
            skipAiProcessing = true;
            await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing due to support escalation', {
              action: escalationResult.action,
              matchedKeyword: escalationResult.matched_keyword,
              category: escalationResult.category
            });
          }
        } catch (error) {
          await logDebug('SUPPORT_ESCALATION_ERROR', 'Error checking for support escalation', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          logger.error('Error checking for support escalation:', error);
        }
      }
      
      if (event === 'messages.upsert' && !skipAiProcessing) {
        await logDebug('AI_PROCESS_ATTEMPT', 'Attempting to process message for AI response');
        if (transcribedText) {
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
