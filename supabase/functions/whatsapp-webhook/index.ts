import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractAudioDetails, hasAudioContent } from "../_shared/audio-processing.ts";
import { extractImageDetails, hasImageContent, processImageMessage } from "../_shared/image-processing.ts";
import { processConnectionStatus } from "../_shared/connection-status.ts";
import { isConnectionStatusEvent } from "../_shared/connection-event-detector.ts";
import { processAudioMessage } from "../_shared/audio-processor.ts";
import { measureTime } from "../_shared/parallel-queries.ts";

// QUEUE SYSTEM: Import Redis Queue and Direct Processing
import { addToQueue } from "../_shared/redis-queue.ts";
import { processMessageDirectly } from "../_shared/direct-message-processor.ts";

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


// Helper function to check if conversation is escalated
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

// Helper function to check if message needs escalation (enhanced with AI intent detection)
async function checkEscalationNeeded(
  message: string, 
  phoneNumber: string,
  instanceId: string,
  conversationId: string,
  aiResponseConfidence?: number,
  intentAnalysis?: any
): Promise<{ needsEscalation: boolean; reason: string }> {
  try {
    const escalationTimer = measureTime('Smart webhook escalation check');
    
    // Get instance escalation configuration including separate controls
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('escalation_enabled, escalation_keywords, smart_escalation_enabled, keyword_escalation_enabled')
      .eq('id', instanceId)
      .single();
    
    escalationTimer.end();

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

// Helper function to check if AI is enabled for this instance (EARLY CHECK)
async function isAIEnabledForInstance(instanceName: string): Promise<{ enabled: boolean; instanceId?: string }> {
  try {
    // Get instance data first
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.warn('⚠️ Instance not found for AI check', { instanceName, error: instanceError });
      return { enabled: false };
    }

    // Check AI configuration
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('id, is_active')
      .eq('whatsapp_instance_id', instanceData.id)
      .eq('is_active', true)
      .maybeSingle();

    const isEnabled = !aiConfigError && !!aiConfig;
    
    logger.info('🤖 Early AI check completed', {
      instanceName,
      instanceId: instanceData.id,
      aiEnabled: isEnabled,
      configFound: !!aiConfig
    });

    return { 
      enabled: isEnabled, 
      instanceId: instanceData.id 
    };
  } catch (error) {
    logger.error('💥 Error in early AI check', {
      instanceName,
      error: error.message || error
    });
    return { enabled: false };
  }
}

// Helper function to handle escalation
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

    // Send escalation notification
    const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-escalation-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        customerNumber: phoneNumber,
        instanceId,
        escalationReason: reason,
        conversationContext: conversationHistory.slice(-10) // Last 10 messages
      })
    });

    if (!notificationResponse.ok) {
      logger.error('Failed to send escalation notification');
    }

    return instance.escalation_message || 'Your conversation has been transferred to our specialized support team. One of our representatives will contact you shortly.';
  } catch (error) {
    logger.error('Error handling escalation:', error);
    return 'Your conversation has been transferred to our specialized support team.';
  }
}

// Helper function to send typing indicator (composing presence) to user
async function sendTypingIndicator(
  instanceName: string,
  userPhone: string,
  evolutionApiKey: string
): Promise<boolean> {
  try {
    const baseUrl = 'https://api.convgo.com';
    const url = `${baseUrl}/chat/sendPresence/${instanceName}`;

    logger.info('📝 Sending typing indicator to customer', {
      instanceName,
      userPhone: userPhone.substring(0, 5) + '***', // Partial phone for privacy
      url
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        number: userPhone,
        delay: 12200,
        presence: 'composing'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('⚠️ Failed to send typing indicator (non-blocking)', {
        status: response.status,
        error: errorText,
        instanceName,
        userPhone: userPhone.substring(0, 5) + '***'
      });
      return false;
    }

    logger.info('✅ Typing indicator sent successfully', {
      instanceName,
      userPhone: userPhone.substring(0, 5) + '***'
    });

    return true;
  } catch (error) {
    logger.warn('⚠️ Exception sending typing indicator (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
      instanceName,
      userPhone: userPhone.substring(0, 5) + '***'
    });
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


// Default API URL - Set to the correct Evolution API URL
const DEFAULT_EVOLUTION_API_URL = 'https://api.convgo.com';

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
      
      // ✅ Escalation system is now integrated in Queue and Direct processing
      
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
      let processedImageUrl: string | null = null; // Add variable to store processed image URL for image messages
      
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
          const needsTranscription = false;
          
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

          // Process image messages - similar to voice message processing
          if (hasImageContent(normalizedData)) {
            logger.info('Detected image message, will process for AI analysis');
            
            // Extract image details
            const imageDetails = extractImageDetails(normalizedData);
            
            // Get API keys for image processing
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || normalizedData.apikey;
            
            // Process the image to get a usable URL
            const imageProcessingResult = await processImageMessage(imageDetails, instanceName, 
              normalizedData.key?.remoteJid?.split('@')[0] || '', evolutionApiKey);
            
            if (imageProcessingResult.success && imageProcessingResult.imageUrl) {
              processedImageUrl = imageProcessingResult.imageUrl;
              logger.info('Successfully processed image message', {
                imageUrl: processedImageUrl.substring(0, 50) + '...'
              });
            } else {
              logger.error('Failed to process image message', {
                error: imageProcessingResult.error
              });
            }
          }
          
          // REMOVED: Webhook data preparation (no longer needed)
          
          logger.info('Media message processing completed', { 
            instance: instanceName,
            hasTranscribedText: !!transcribedText,
            hasProcessedImageUrl: !!processedImageUrl
          });
          
          // ✅ Voice message transcribed and ready for processing
          // ✅ Escalation analysis will be performed by Queue/Direct processors
          // Continue with normal AI processing via queue system
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
        
        if (processedImageUrl) {
          // If we already processed the image, pass it to AI processing
          normalizedData.processedImageUrl = processedImageUrl;
          logger.info('Using already processed image URL for AI processing', {
            imageUrl: processedImageUrl.substring(0, 50) + '...'
          });
        }

        // Extract user phone for processing
        const userPhone = normalizedData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
        
        // 🤖 EARLY AI CHECK: Verify AI is enabled before storing in Redis
        const aiStatus = await isAIEnabledForInstance(instanceName);
        
        if (!aiStatus.enabled) {
          logger.info('🚫 AI not enabled for instance, skipping Redis storage and processing', {
            instanceName,
            userPhone,
            messageId: normalizedData.key?.id
          });
          
          // Return success without processing - this prevents unnecessary Redis storage
          return new Response(JSON.stringify({ 
            success: true,
            message: `AI not enabled for instance ${instanceName}`,
            skipped: true
          }), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }

        // 📝 TYPING INDICATOR: Send "composing" presence to user immediately
        // This makes the user feel that someone is responding and improves UX
        // The delay of 8200ms covers the Redis queue wait time + AI processing time
        try {
          if (userPhone) {
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || normalizedData.apikey;

            if (evolutionApiKey) {
              // Send typing indicator (non-blocking - don't wait for response)
              sendTypingIndicator(instanceName, userPhone, evolutionApiKey)
                .catch(error => {
                  logger.warn('Typing indicator failed but continuing message processing', {
                    error: error instanceof Error ? error.message : String(error),
                    instanceName,
                    userPhone: userPhone.substring(0, 5) + '***'
                  });
                });

              logger.debug('🚀 Typing indicator request sent (non-blocking)', {
                instanceName,
                userPhone: userPhone.substring(0, 5) + '***'
              });
            } else {
              logger.warn('⚠️ Evolution API key not available for typing indicator', {
                instanceName,
                userPhone: userPhone.substring(0, 5) + '***'
              });
            }
          }
        } catch (error) {
          // Typing indicator is non-critical - log and continue
          logger.warn('Exception in typing indicator (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
            instanceName
          });
        }

        // QUEUE SYSTEM: Process message with Queue (automatic direct fallback)
        let processingResult: any = { success: false, reason: 'unknown' };
        
        logger.info('🚀 Processing message with Queue System (automatic direct fallback)', {
          instanceName,
          userPhone,
          messageId: normalizedData.key?.id,
          aiEnabled: true
        });
        
        try {
          // Try to add message to Redis queue
          const queueResult = await addToQueue(instanceName, userPhone, normalizedData);
          
          if (queueResult.success) {
            processingResult = {
              success: true,
              usedQueue: true,
              messageId: queueResult.messageId,
              reason: 'queued_for_processing'
            };
            
            logger.info('✅ Message successfully added to Redis queue', {
              instanceName,
              userPhone,
              messageId: queueResult.messageId
            });
          } else {
            throw new Error(`Queue failed: ${queueResult.error}`);
          }
        } catch (queueError) {
          logger.warn('⚠️ Redis Queue failed, falling back to direct processing', {
            instanceName,
            userPhone,
            error: queueError.message || queueError
          });
          
          // Automatic fallback to direct processing
          try {
            const directSuccess = await processMessageDirectly(
              instanceName,
              normalizedData,
              supabaseAdmin,
              supabaseUrl,
              supabaseServiceKey
            );
            
            processingResult = {
              success: directSuccess,
              usedQueue: false,
              usedFallback: true,
              reason: directSuccess ? 'direct_processing_success' : 'direct_processing_failed'
            };
            
            logger.info(directSuccess ? '✅ Direct processing fallback succeeded' : '❌ Direct processing fallback failed', {
              instanceName,
              userPhone
            });
          } catch (directError) {
            logger.error('💥 Direct processing fallback also failed', {
              instanceName,
              userPhone,
              error: directError.message || directError
            });
            
            processingResult = {
              success: false,
              usedQueue: false,
              usedFallback: true,
              reason: 'both_systems_failed',
              error: directError.message || directError
            };
          }
        }
        
        logger.info('📊 Message processing completed', {
          instanceName,
          userPhone,
          success: processingResult.success,
          usedQueue: processingResult.usedQueue || false,
          usedDirectFallback: processingResult.usedFallback || false,
          reason: processingResult.reason,
          messageId: processingResult.messageId || 'unknown'
        });
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
