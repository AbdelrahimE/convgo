import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateSimilarity } from "../_shared/text-similarity.ts";
import { extractAudioDetails, hasAudioContent } from "../_shared/audio-processing.ts";
import { downloadAudioFile } from "../_shared/audio-download.ts";
import { storeMessageInConversation } from "../_shared/conversation-storage.ts";
import { processConnectionStatus } from "../_shared/connection-status.ts";
import { isConnectionStatusEvent } from "../_shared/connection-event-detector.ts";
import { checkForDuplicateMessage } from "../_shared/duplicate-message-detector.ts";
import { processAudioMessage } from "../_shared/audio-processor.ts";
import { generateAndSendAIResponse } from "../_shared/ai-response-generator.ts";

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
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// REMOVED: Support phone number check function (escalation system removed)

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
        logger.info(`Conversation ${existingConversation.id} expired after ${hoursDifference.toFixed(2)} hours of inactivity`);
        
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
          
          logger.info(`Reactivated conversation ${anyConversation.id} for instance ${instanceId} and phone ${userPhone}`);
          
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
      
      logger.info(`Updated existing conversation ${inactiveConversation.id} to active status`);
      
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
    logger.info(`New conversation created for instance ${instanceId} and phone ${userPhone}`);
    
    return newConversation.id;
  } catch (error) {
    logger.error('Error in findOrCreateConversation:', error);
    logger.error('Error in findOrCreateConversation:', error);
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
    logger.info(`Retrieved ${data.length} messages from conversation ${conversationId}`, {
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
const DEFAULT_EVOLUTION_API_URL = 'https://api.botifiy.com';

// Helper function to save webhook message
async function saveWebhookMessage(instance: string, event: string, data: any) {
  try {
    logger.info(`Saving webhook message for instance ${instance}, event ${event}`);
    
    const { error } = await supabaseAdmin.from('webhook_messages').insert({
      instance,
      event,
      data
    });
    
          if (error) {
        logger.error('Error saving webhook message:', { error, instance, event });
        return false;
      }
    
    return true;
      } catch (error) {
      logger.error('Exception when saving webhook message:', { error, instance, event });
      return false;
    }
}

// Helper function to process message for AI
async function processMessageForAI(instance: string, messageData: any) {
  try {
    logger.info('Starting AI message processing', { instance });
    
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
    
    logger.info('Extracted message details', { 
      instanceName, 
      fromNumber, 
      messageText, 
      remoteJid, 
      isFromMe 
    });

    // NEW: Check for and process image content
    let imageUrl = null;
    if (messageData.message?.imageMessage) {
      logger.info('Detected image message', {
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
          logger.info('Processing image for AI analysis', {
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
                logger.info('Added default text for image-only message', {
                  defaultText: messageText
                });
              }
              
              logger.info('Successfully processed image for AI analysis', {
                originalUrlFragment: rawImageUrl.substring(0, 30) + '...',
                processedUrlFragment: result.mediaUrl.substring(0, 30) + '...',
                mediaType: result.mediaType
              });
            } else {
              logger.warn('Image processing returned failure', result);
            }
          } else {
            const errorText = await imageProcessResponse.text();
            logger.error('Error response from image processing endpoint', {
              status: imageProcessResponse.status,
              error: errorText
            });
          }
        } catch (error) {
          logger.error('Exception during image processing', {
            error: error.message,
            stack: error.stack
          });
          // Continue with just the text if image processing fails
        }
      } else {
        logger.warn('Image message missing required data', {
          hasUrl: !!rawImageUrl,
          hasMediaKey: !!mediaKey
        });
      }
    }

    // Skip processing if:
    // 1. Message is from a group chat (contains @g.us)
    // 2. Message is from the bot itself (fromMe is true)
    if (remoteJid.includes('@g.us') || isFromMe) {
      logger.info('Skipping AI processing: Group message or sent by bot', {
        isGroup: remoteJid.includes('@g.us'),
        isFromMe
      });
      return false;
    }

    // Determine Evolution API key
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
    
    if (!evolutionApiKey) {
      logger.warn('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
    }

    // Check if this is an audio message
    const isAudioMessage = hasAudioContent(messageData);
    
    // Variable to track if we should bypass AI and send direct response
    let bypassAiProcessing = false;
    let directResponse = null;
    
    if (isAudioMessage) {
      logger.info('Audio message detected', { 
        messageType: messageData.messageType,
        hasAudioMessage: !!messageData.message?.audioMessage,
        hasPttMessage: !!messageData.message?.pttMessage
      });
      
      // Extract audio details
      const audioDetails = extractAudioDetails(messageData);
      logger.info('Extracted audio details', { audioDetails });
      
      // Process the audio for transcription
      const transcriptionResult = await processAudioMessage(audioDetails, instanceName, fromNumber, evolutionApiKey);
      
      // Check if we should bypass AI and send direct response
      if (transcriptionResult.bypassAiProcessing && transcriptionResult.directResponse) {
        logger.info('Using direct response for disabled voice processing', {
          directResponse: transcriptionResult.directResponse
        });
        
        // Initialize instance base URL for sending responses
        let instanceBaseUrl = '';

        // Try to determine the base URL for this instance (reusing existing code logic)
        try {
          logger.info('Determining EVOLUTION API URL for direct response', { instanceName });
          
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
              logger.error('Failed to get instance data', { error: instanceError });
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
            logger.info('Sending direct response to WhatsApp', {
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
              logger.error('Error sending direct response', {
                status: sendResponse.status,
                error: errorText
              });
              return false;
            }

            const sendResult = await sendResponse.json();
            logger.info('Direct response sent successfully', { sendResult });
            return true;
          }
        } catch (error) {
          logger.error('Exception sending direct response', { error });
          return false;
        }
        
        // If we couldn't send the direct response, continue with normal processing as fallback
      }
      
      if (!transcriptionResult.success) {
        // If transcription failed but we have a fallback transcription, use it
        if (transcriptionResult.transcription) {
          messageText = transcriptionResult.transcription;
          
          logger.info('Using fallback transcription for failed audio processing', {
            transcription: messageText
          });
        } else {
          // Complete failure - set generic placeholder
          messageText = "This is a voice message that could not be processed.";
          
          logger.error('Failed to process audio with no fallback', {
            error: transcriptionResult.error
          });
        }
      } else {
        // Successful transcription
        messageText = transcriptionResult.transcription;
        
        logger.info('Successfully transcribed audio message', {
          transcription: messageText?.substring(0, 100) + '...'
        });
      }
    }

    // If no message content (text or processed audio), skip
    if (!messageText && !imageUrl) {
      logger.info('Skipping AI processing: No text or image content', { messageData });
      return false;
    }

    // Get instance ID from instance name
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.error('Instance not found in database', { 
        instanceName, 
        error: instanceError 
      });
      return false;
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(instanceData.id, fromNumber);
    logger.info('Conversation found or created', { conversationId });

    // NEW: Check for duplicate messages before processing
    const isDuplicate = await checkForDuplicateMessage(conversationId, messageText, supabaseAdmin);
    if (isDuplicate) {
      logger.info('Skipping AI processing: Duplicate or similar message detected', {
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
    logger.info('Retrieved conversation history', { 
      messageCount: conversationHistory.length,
      estimatedTokens: conversationHistory.reduce((sum, msg) => sum + Math.ceil(msg.content.length * 0.25), 0)
    });

    // Check if this instance has AI enabled
    logger.info('Checking if AI is enabled for instance', { instanceName });
    
    const instanceId = instanceData.id;
    logger.info('Found instance in database', { instanceId, status: instanceData.status });

    // Check if AI is enabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .maybeSingle();

    if (aiConfigError || !aiConfig) {
      logger.warn('AI is not enabled for this instance', { 
        instanceId, 
        error: aiConfigError 
      });
      return false;
    }

    // REMOVED: maxAIAttempts logic (escalation system removed)

    logger.info('AI is enabled for this instance', { 
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
      logger.error('Error getting file mappings', { 
        instanceId, 
        error: fileMappingsError 
      });
      return false;
    }

    // Extract file IDs
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    logger.info('Retrieved file mappings for instance', { 
      instanceId, 
      fileCount: fileIds.length,
      fileIds
    });

    if (fileIds.length === 0) {
      logger.info('No files mapped to this instance, using empty context', { instanceId });
    }

    // Initialize instance base URL for sending responses
    let instanceBaseUrl = '';

    // Try to determine the base URL for this instance
    try {
      logger.info('Attempting to determine EVOLUTION API URL', { instanceId });
      
      // IMPORTANT: First check if the server_url is available in the current message payload
      if (messageData.server_url) {
        instanceBaseUrl = messageData.server_url;
        logger.info('Using server_url from payload', { 
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
            logger.info('Extracted base URL from webhook config', { 
              instanceBaseUrl,
              webhookUrl: webhookConfig.webhook_url
            });
          } else {
            // If webhook URL doesn't exist, use the default Evolution API URL
            instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
            logger.info('Using default EVOLUTION API URL', { 
              instanceBaseUrl,
              webhookError
            });
          }
      }
    } catch (error) {
      // In case of any error, use the default Evolution API URL
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
      logger.warn('Error determining EVOLUTION API URL, using default', { 
        instanceBaseUrl,
        error
      });
    }

    // SMART: Smart Intent Classification with 99% Accuracy
    let intentClassification = null;
    let selectedPersonality = null;
    
    // Check if personality system is enabled for this instance
    const personalitySystemEnabled = aiConfig.use_personality_system && aiConfig.intent_recognition_enabled;
    
    if (personalitySystemEnabled && messageText) {
      logger.info('Starting smart intent classification', { 
        userQuery: messageText,
        instanceId: instanceId,
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
            message: messageText,
            whatsappInstanceId: instanceId,
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
                message: messageText,
                whatsappInstanceId: instanceId,
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
    const hasGreeting = messageText.includes('السلام عليكم') || 
                       messageText.includes('أهلا') || 
                       messageText.includes('مرحبا') ||
                       messageText.includes('صباح الخير') ||
                       messageText.includes('مساء الخير');
    
    logger.info('Starting semantic search for context', { 
      userQuery: messageText,
      hasGreeting,
      fileIds,
      detectedIntent: (intentClassification as any)?.intent || 'none',
      usingPersonality: !!selectedPersonality,
      selectedPersonalityName: (selectedPersonality as any)?.name || 'none'
    });

    // Perform simple semantic search - restored to original approach
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
      
      // REMOVED: AI escalation logic (escalation system removed)
      // Continue with AI processing in fallback case

      const aiResponseResult = await generateAndSendAIResponse(
        messageText, 
        '', 
        instanceName, 
        fromNumber, 
        instanceBaseUrl, 
        aiConfig, 
        messageData, 
        conversationId,
        supabaseUrl,
        supabaseServiceKey,
        imageUrl
      );

      // REMOVED: AI attempt recording (escalation system removed)

      return aiResponseResult;
    }

    const searchResults = await searchResponse.json();
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
    
    // 2. Simple RAG results processing - restored to original approach
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
      })
    };

    // إضافة logging للتأكد من البيانات
    logger.info('Smart AI Config created', {
      hasPersonality: !!selectedPersonality,
      selectedPersonalityName: (selectedPersonality as any)?.name || 'none',
      selectedPersonalityId: (selectedPersonality as any)?.id || 'none',
      systemPrompt: smartAiConfig.system_prompt ? smartAiConfig.system_prompt.substring(0, 100) + '...' : 'undefined',
      originalSystemPrompt: aiConfig.system_prompt ? aiConfig.system_prompt.substring(0, 100) + '...' : 'undefined'
    });

    // REMOVED: AI escalation logic (escalation system removed)
    // Continue with AI processing

    // Generate and send the response with smart context and personality management
    const aiResponseResult = await generateAndSendAIResponse(
      messageText,
      context,
      instanceName,
      fromNumber,
      instanceBaseUrl,
      smartAiConfig,
      messageData,
      conversationId,
      supabaseUrl,
      supabaseServiceKey,
      imageUrl
    );

    // REMOVED: AI attempt recording (escalation system removed)

    return aiResponseResult;
  } catch (error) {
    logger.error('Unhandled exception in AI processing', { error });
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
  logger.info('WEBHOOK REQUEST RECEIVED', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Log full path analysis for debugging
    logger.info('Full request path analysis', { 
      fullPath: url.pathname,
      pathParts 
    });
    
    // Get the request body for further processing
    let data;
    try {
      data = await req.json();
      logger.info('Webhook payload received', { data });
      
      // Check if message contains audio
      if (data && hasAudioContent(data)) {
        logger.info('Audio content detected in webhook payload', {
          messageType: data.messageType,
          hasAudioMessage: !!data.message?.audioMessage
        });
      }
    } catch (error) {
      logger.error('Failed to parse webhook payload', { error });
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
    let instanceName: string | null = null;
    
    // Pattern 1: Direct path format
    if (pathParts.length >= 3 && pathParts[0] === 'api') {
      instanceName = pathParts[1];
      logger.info(`Direct webhook path detected for instance: ${instanceName}`);
    }
    // Pattern 2: Supabase prefixed path format
    else if (pathParts.length >= 6 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook' && 
             pathParts[3] === 'api') {
      instanceName = pathParts[4];
      logger.info(`Supabase prefixed webhook path detected for instance: ${instanceName}`);
    }
    // Pattern 3: Another possible edge function URL format with just the instance in the path
    else if (pathParts.length >= 4 && 
             pathParts[0] === 'functions' && 
             pathParts[1] === 'v1' && 
             pathParts[2] === 'whatsapp-webhook') {
      // Try to extract instance from the next path part
      instanceName = pathParts[3];
      logger.info(`Alternative webhook path detected, using: ${instanceName}`);
    }
    
    // If instance name is not found in the path, try to extract it from the payload
    // This handles the simple path format that EVOLUTION API is using
    if (!instanceName && data) {
      if (data.instance) {
        instanceName = data.instance;
        logger.info(`Extracted instance from payload: ${instanceName}`);
      } else if (data.instanceId) {
        instanceName = data.instanceId;
        logger.info(`Extracted instanceId from payload: ${instanceName}`);
      } else if (data.data && data.data.instance) {
        // Handle nested instance name in data object
        instanceName = data.data.instance;
        logger.info(`Extracted instance from nested data: ${instanceName}`);
      }
    }
    
    // If we have identified an instance name, process the webhook
    if (instanceName) {
      logger.info(`Processing webhook for instance: ${instanceName}`);
      
      // REMOVED: Support phone number check (escalation system removed)
      
      // Different webhook events have different structures
      // We need to normalize based on the structure
      let event = 'unknown';
      let normalizedData = data;
      
      // NEW: First check if this is a connection status event
      if (isConnectionStatusEvent(data)) {
        event = 'connection.update';
        normalizedData = data;
        logger.info(`Connection state event detected: ${data.data?.state || data.state}`);
        
        // Save the webhook message to the database first
        const saved = await saveWebhookMessage(instanceName, event, normalizedData);
        if (saved) {
          logger.info('Connection state event saved successfully');
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
        logger.info(`Standard event format detected: ${event}`);
      } else if (data.key && data.key.remoteJid) {
        // This is a message format
        event = 'messages.upsert';
        normalizedData = data;
        logger.info('Message event detected');
      } else if (data.status) {
        // This is a connection status event
        event = 'connection.update';
        normalizedData = data;
        logger.info(`Connection event detected: ${data.status}`);
      } else if (data.qrcode) {
        // This is a QR code event
        event = 'qrcode.updated';
        normalizedData = data;
        logger.info('QR code event detected');
      }
      
      // Save the webhook message to the database
      const saved = await saveWebhookMessage(instanceName, event, normalizedData);
      
      if (saved) {
        logger.info('Webhook message saved successfully');
      }
      
      // Process voice messages if needed
      let foundInstanceId = null;
      let transcribedText: string | null = null; // Add variable to store transcribed text for voice messages
      
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
            logger.info('Found instance ID for escalation check', { 
              instanceName, 
              instanceId: foundInstanceId 
            });
          } else {
            // Handle case where instance isn't found without throwing errors
            logger.warn('Instance not found but continuing processing', { 
              instanceName, 
              error: instanceError 
            });
            // Allow processing to continue without the instance ID
          }

          // Modified flow: First check if this is a voice message that needs transcription
          let needsTranscription = false;
          
          if (hasAudioContent(normalizedData)) {
            logger.info('Detected voice message, will transcribe before escalation check');
            
            // Extract audio details
            const audioDetails = extractAudioDetails(normalizedData);
            
            // Get API keys for transcription
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || normalizedData.apikey;
            
            // Process the audio for transcription first
            const transcriptionResult = await processAudioMessage(audioDetails, instanceName, 
              normalizedData.key?.remoteJid?.split('@')[0] || '', evolutionApiKey);
            
            if (transcriptionResult.success && transcriptionResult.transcription) {
              transcribedText = transcriptionResult.transcription as string;
              logger.info('Successfully transcribed voice message for escalation check', {
                transcription: transcribedText
              });
            } else {
              logger.error('Failed to transcribe voice message for escalation check', {
                error: transcriptionResult.error
              });
            }
          }
          
          // REMOVED: Webhook data preparation (no longer needed)
          
          logger.info('Voice message processing completed', { 
            instance: instanceName,
            hasTranscribedText: !!transcribedText
          });
          
          // REMOVED: Evolution API settings (no longer needed for escalation)
          
          // REMOVED: Smart escalation analysis (escalation system removed)
          // Continue with normal AI processing
        } catch (error) {
          // Log error but continue with AI processing
          logger.error('Error in voice message processing', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          // Continue with AI processing despite error
        }
      }
      
      // Process for AI if this is a message event
      if (event === 'messages.upsert') {
        logger.info('Attempting to process message for AI response');
        if (transcribedText) {
          // If we already transcribed the message for escalation, pass it to AI processing
          normalizedData.transcribedText = transcribedText;
          logger.info('Using already transcribed text for AI processing', {
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
    logger.error('No valid instance name could be extracted from path or payload', { 
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
    logger.error('Error processing webhook', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
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
