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

// Updated helper function to find or create a conversation with improved timeout management
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
        // Mark the old conversation as expired and create a new one
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
        
        // Create new conversation below (fall through to creation)
      } else {
        // Existing active conversation that hasn't expired
        return existingConversation.id;
      }
    }

    // If no active conversation exists or it expired, create a new one
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
            activity_timeout_hours: 6 // Configurable timeout period
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

// Helper function to process message for AI
async function processMessageForAI(instance: string, messageData: any) {
  try {
    await logDebug('AI_PROCESS_START', 'Starting AI message processing', { instance });
    
    // Extract key information from the message
    const instanceName = instance;
    const fromNumber = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || null;
    const messageText = messageData.message?.conversation || 
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
    // 3. No text message content is available
    if (remoteJid.includes('@g.us') || isFromMe) {
      await logDebug('AI_PROCESSING_SKIPPED', 'Skipping AI processing: Group message or sent by bot', {
        isGroup: remoteJid.includes('@g.us'),
        isFromMe
      });
      return false;
    }

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
      console.error('Semantic search failed:', errorText);
      
      // Continue with empty context instead of failing
      await logDebug('AI_SEARCH_FALLBACK', 'Continuing with empty context due to search failure');
      return await generateAndSendAIResponse(messageText, '', instanceName, fromNumber, instanceBaseUrl, aiConfig, messageData, conversationId);
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
      conversationId
    );
  } catch (error) {
    await logDebug('AI_PROCESS_EXCEPTION', 'Unhandled exception in AI processing', { error });
    console.error('Error in processMessageForAI:', error);
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
  conversationId: string
) {
  try {
    // Generate system prompt
    await logDebug('AI_SYSTEM_PROMPT', 'Using system prompt from configuration', { 
      userSystemPrompt: aiConfig.system_prompt
    });
    
    const systemPrompt = aiConfig.system_prompt;

    // Generate AI response with improved token management
    await logDebug('AI_RESPONSE_GENERATION', 'Generating AI response with token management');
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
        maxContextTokens: 3000 // Explicit token limit
      })
    });

    if (!responseGenResponse.ok) {
      const errorText = await responseGenResponse.text();
      await logDebug('AI_RESPONSE_ERROR', 'AI response generation failed', {
        status: responseGenResponse.status,
        error: errorText
      });
      console.error('AI response generation failed:', errorText);
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
      await storeMessageInConversation(conversationId, 'assistant', responseData.answer);
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
        console.error('Error saving AI interaction:', interactionError);
      } else {
        await logDebug('AI_INTERACTION_SAVED', 'AI interaction saved successfully');
      }
    } catch (error) {
      await logDebug('AI_INTERACTION_SAVE_EXCEPTION', 'Exception saving AI interaction', {
        error
      });
      console.error('Exception saving AI interaction:', error);
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
        console.error('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
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
          console.error('Error sending WhatsApp message:', errorText);
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
        console.error('Exception sending WhatsApp message:', error);
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
      }
    }
    
    // If we have identified an instance name, process the webhook
    if (instanceName) {
      await logDebug('WEBHOOK_INSTANCE', `Processing webhook for instance: ${instanceName}`);
      
      // Different webhook events have different structures
      // We need to normalize based on the structure
      let event = 'unknown';
      let normalizedData = data;
      
      // Determine the event type based on data structure
      if (data.event) {
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
      
      // Process for AI if this is a message event
      if (event === 'messages.upsert') {
        await logDebug('AI_PROCESS_ATTEMPT', 'Attempting to process message for AI response');
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
    
    console.error('Error processing webhook:', error);
    
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
