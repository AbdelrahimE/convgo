
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

// Create a Supabase client with the service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Enhanced logging function
async function logDebug(category: string, message: string, data?: any): Promise<void> {
  const logEntry = {
    category,
    message,
    data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 1000) : data) : null,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[DEBUG][${category}] ${message}`, data ? logEntry.data : '');
  
  try {
    // Store detailed debug logs in a separate table for analysis
    await supabaseAdmin
      .from('webhook_debug_logs')
      .insert({
        category,
        message,
        data: data,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to store debug log:', error);
  }
}

// Simplified function to extract content from request
async function extractRequestContent(req: Request): Promise<{ parsedData: any, contentType: string, rawContent: string }> {
  // Get the content type for logging
  const contentType = req.headers.get('content-type') || 'unknown';
  let rawContent = '';
  
  try {
    // Clone the request to ensure we don't read the body multiple times
    const reqClone = req.clone();
    
    // Try to get the raw content as text first
    try {
      rawContent = await reqClone.text();
      console.log('Raw request content:', rawContent.substring(0, 1000));
    } catch (error) {
      console.error('Failed to read raw request content:', error);
    }
    
    // First, try to parse as JSON regardless of content type
    try {
      // If rawContent was already retrieved, use it
      if (rawContent) {
        return { 
          parsedData: JSON.parse(rawContent), 
          contentType, 
          rawContent 
        };
      }
      
      // Otherwise, get JSON directly
      const jsonData = await req.json();
      return { 
        parsedData: jsonData, 
        contentType, 
        rawContent: JSON.stringify(jsonData) 
      };
    } catch (jsonError) {
      console.log('Not valid JSON, trying other formats');
    }
    
    // Try to parse as form data
    if (contentType.includes('form')) {
      try {
        const formData = await req.formData();
        const formObj = Object.fromEntries(formData.entries());
        return { 
          parsedData: formObj, 
          contentType, 
          rawContent: rawContent || JSON.stringify(formObj) 
        };
      } catch (formError) {
        console.log('Not valid form data');
      }
    }
    
    // If we have raw content but couldn't parse it as JSON, try more permissive parsing
    if (rawContent) {
      try {
        // Try to detect JSON-like structure even with malformed JSON
        // This works for cases where the JSON might have comments or trailing commas
        const repaired = rawContent
          .replace(/[\r\n\t]/g, ' ')     // Replace whitespace
          .replace(/,\s*}/g, '}')       // Remove trailing commas in objects
          .replace(/,\s*\]/g, ']')      // Remove trailing commas in arrays
          .trim();
          
        // Attempt to parse the repaired JSON
        return { 
          parsedData: JSON.parse(repaired), 
          contentType, 
          rawContent 
        };
      } catch (fixError) {
        console.log('Could not repair malformed JSON');
      }
      
      // Last resort: try to extract a JSON object using regex
      try {
        const jsonMatch = rawContent.match(/({[\s\S]*}|\[[\s\S]*\])/);
        if (jsonMatch && jsonMatch[0]) {
          return { 
            parsedData: JSON.parse(jsonMatch[0]), 
            contentType, 
            rawContent 
          };
        }
      } catch (regexError) {
        console.log('Regex extraction failed');
      }
    }
    
    // If all parsing methods failed, return the raw content
    return { 
      parsedData: { raw: rawContent }, 
      contentType, 
      rawContent 
    };
  } catch (error) {
    console.error('Error extracting content from request:', error);
    return { 
      parsedData: { error: 'Failed to parse request' }, 
      contentType, 
      rawContent 
    };
  }
}

// Function to normalize event data regardless of format
function normalizeEventData(data: any): { 
  event: string; 
  instance: string; 
  data: any;
} {
  try {
    console.log('Normalizing data:', JSON.stringify(data).substring(0, 500));
    
    // Check if this is already in our expected format
    if (data.event && data.instance && data.data) {
      console.log('Data already in expected format');
      return data;
    }
    
    // EVOLUTION API's format
    // Check for EVOLUTION API webhook format (based on your webhook.site capture)
    if (data.body?.key?.remoteJid || data.key?.remoteJid) {
      // This appears to be EVOLUTION's direct format
      const messageObj = data.body || data;
      const instanceName = data.instance || data.instance_name || 'unknown-instance';
      
      console.log('Detected EVOLUTION API format, instance:', instanceName);
      
      // Construct normalized event data
      return {
        event: 'messages.upsert',
        instance: instanceName,
        data: messageObj
      };
    }
    
    // Handle other potential formats or return something reasonable
    const result = {
      event: data.type || data.event || 'unknown',
      instance: data.instance || data.instanceName || 'unknown-instance',
      data: data
    };
    
    console.log('Using fallback format:', JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error('Error normalizing event data:', error);
    return {
      event: 'error',
      instance: 'parsing-error',
      data: { error: 'Failed to normalize event data', originalData: data }
    };
  }
}

// Process WhatsApp message for AI response
async function processMessageForAI(messageData: any, instanceName: string): Promise<boolean> {
  try {
    await logDebug('AI_PROCESSING', 'Starting AI processing', { instanceName });
    console.log('🤖 Processing message for AI response...');
    
    // Check if this is a message we should process
    // Only process messages from individual chats, not groups
    // EVOLUTION API format check based on the data structure
    const remoteJid = messageData?.key?.remoteJid || '';
    const messageType = messageData?.message ? Object.keys(messageData.message)[0] : null;
    const isFromMe = messageData?.key?.fromMe || false;
    
    await logDebug('AI_PROCESSING', 'Message details', { 
      remoteJid, 
      messageType, 
      isFromMe,
      hasGroupId: remoteJid.includes('@g.us')
    });
    
    // Skip processing if:
    // 1. Message is from a group chat (contains @g.us)
    // 2. Message is from the bot itself (fromMe is true)
    // 3. No text message content is available
    if (remoteJid.includes('@g.us') || isFromMe) {
      await logDebug('AI_PROCESSING', 'Skipping - Group message or sent by bot', { remoteJid, isFromMe });
      console.log('⏭️ Skipping AI processing: Group message or sent by bot');
      return false;
    }
    
    // Extract the actual message text
    let messageText = '';
    
    // Handle different message types (text, image with caption, etc)
    if (messageType === 'conversation') {
      messageText = messageData.message.conversation || '';
    } else if (messageType === 'extendedTextMessage') {
      messageText = messageData.message.extendedTextMessage.text || '';
    } else if (messageData.message?.imageMessage?.caption) {
      messageText = messageData.message.imageMessage.caption || '';
    } else if (messageData.message?.videoMessage?.caption) {
      messageText = messageData.message.videoMessage.caption || '';
    }
    
    await logDebug('AI_PROCESSING', 'Extracted message text', { 
      messageType, 
      messageText: messageText.substring(0, 100),
      hasText: messageText.trim().length > 0
    });
    
    // If no usable text was found, skip processing
    if (!messageText.trim()) {
      await logDebug('AI_PROCESSING', 'Skipping - No text content');
      console.log('⏭️ Skipping AI processing: No text content');
      return false;
    }
    
    // Log the message we're processing
    console.log(`📝 Processing message text: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`);
    
    // Get the instance ID from the instance name
    await logDebug('AI_PROCESSING', 'Looking up instance data', { instanceName });
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_url, instance_name')
      .eq('instance_name', instanceName)
      .single();
      
    if (instanceError || !instanceData) {
      await logDebug('AI_PROCESSING', 'Instance not found', { 
        instanceName, 
        error: instanceError ? instanceError.message : 'No instance data returned'
      });
      console.error('❌ Instance not found:', instanceName, instanceError);
      return false;
    }
    
    await logDebug('AI_PROCESSING', 'Found instance', instanceData);
    
    const instanceId = instanceData.id;
    const instanceName2 = instanceData.instance_name;

    // Find the EVOLUTION API instance URL
    let instanceBaseUrl = '';
    
    // Try to determine the base URL for this instance
    try {
      await logDebug('AI_PROCESSING', 'Fetching webhook config');
      const { data: webhookConfig, error: webhookError } = await supabaseAdmin
        .from('whatsapp_webhook_config')
        .select('webhook_url')
        .eq('whatsapp_instance_id', instanceId)
        .single();
        
      if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
        // Extract base URL from webhook URL
        // Example: If webhook URL is http://api.example.com/webhook/instance1
        // We want http://api.example.com
        const url = new URL(webhookConfig.webhook_url);
        instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
        await logDebug('AI_PROCESSING', 'Using instance base URL from webhook config', { 
          webhookUrl: webhookConfig.webhook_url,
          instanceBaseUrl
        });
        console.log(`ℹ️ Using instance base URL from webhook config: ${instanceBaseUrl}`);
      } else {
        await logDebug('AI_PROCESSING', 'No webhook URL found', { 
          error: webhookError ? webhookError.message : 'No webhook config returned'
        });
        console.warn('⚠️ No webhook URL found, using fallback method to determine instance URL');
        // If we couldn't get it from webhook URL, use a default pattern or environment variable
        // This needs to be configured based on your EVOLUTION API setup
        instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
        await logDebug('AI_PROCESSING', 'Using fallback instance base URL', { instanceBaseUrl });
      }
    } catch (error) {
      await logDebug('AI_PROCESSING', 'Error determining instance base URL', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('❌ Error determining instance base URL:', error);
      instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
      await logDebug('AI_PROCESSING', 'Using fallback instance base URL after error', { instanceBaseUrl });
    }
    console.log(`🌐 Using EVOLUTION API base URL: ${instanceBaseUrl}`);
    
    // Check if AI is enabled for this instance
    await logDebug('AI_PROCESSING', 'Checking AI configuration');
    const { data: aiConfigData, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .single();
      
    if (aiConfigError || !aiConfigData) {
      await logDebug('AI_PROCESSING', 'AI is not enabled or config not found', { 
        error: aiConfigError ? aiConfigError.message : 'No AI config returned',
        instanceId
      });
      console.log('⏭️ AI is not enabled for this instance or config not found');
      return false;
    }
    
    await logDebug('AI_PROCESSING', 'AI is enabled for this instance', {
      systemPrompt: aiConfigData.system_prompt?.substring(0, 50) + '...',
      temperature: aiConfigData.temperature,
      instanceId
    });
    
    console.log('✅ AI is enabled for this instance', {
      systemPrompt: aiConfigData.system_prompt?.substring(0, 50) + '...',
      temperature: aiConfigData.temperature
    });
    
    // Get file mappings for this instance
    await logDebug('AI_PROCESSING', 'Fetching file mappings');
    const { data: fileMappings, error: fileMappingsError } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);
      
    if (fileMappingsError) {
      await logDebug('AI_PROCESSING', 'Error fetching file mappings', { 
        error: fileMappingsError.message
      });
      console.error('❌ Error fetching file mappings:', fileMappingsError);
      return false;
    }
    
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    await logDebug('AI_PROCESSING', 'Found file mappings', { 
      fileCount: fileIds.length,
      fileIds
    });
    console.log(`✅ Found ${fileIds.length} file mappings for this instance`);

    // PHASE 2: Call semantic-search to find relevant content
    await logDebug('AI_PROCESSING', 'Calling semantic-search', {
      query: messageText.substring(0, 50) + '...'
    });
    console.log('🔍 Phase 2.1: Calling semantic-search with query:', messageText.substring(0, 50) + '...');
    
    try {
      // Step 1: Call semantic-search edge function
      await logDebug('AI_PROCESSING', 'Sending semantic search request', {
        query: messageText,
        fileIds: fileIds.length > 0 ? 'Using specific files' : 'No file filters'
      });
      
      const { data: searchData, error: searchError } = await supabaseAdmin.functions.invoke('semantic-search', {
        body: {
          query: messageText,
          limit: 8, // Increased from default 5 to get more context
          threshold: 0.6, // Slightly lower threshold to get more results
          fileIds: fileIds.length > 0 ? fileIds : undefined
        }
      });
      
      if (searchError) {
        await logDebug('AI_PROCESSING', 'Error calling semantic-search', { 
          error: searchError
        });
        console.error('❌ Error calling semantic-search:', searchError);
        return false;
      }
      
      if (!searchData.success) {
        await logDebug('AI_PROCESSING', 'Semantic search failed', { 
          error: searchData.error
        });
        console.error('❌ Semantic search failed:', searchData.error);
        return false;
      }
      
      const searchResults = searchData.results;
      await logDebug('AI_PROCESSING', 'Semantic search results', { 
        resultCount: searchResults.length,
        firstResult: searchResults.length > 0 ? {
          score: searchResults[0].score,
          content: searchResults[0].content.substring(0, 100) + '...'
        } : null
      });
      console.log(`✅ Semantic search returned ${searchResults.length} results`);
      
      if (searchResults.length === 0) {
        await logDebug('AI_PROCESSING', 'No relevant content found');
        console.log('⚠️ No relevant content found. Will try generating response with empty context.');
      }
      
      // Step 2: Call assemble-context edge function
      await logDebug('AI_PROCESSING', 'Calling assemble-context');
      console.log('📝 Phase 2.2: Calling assemble-context to compile knowledge base information');
      
      const { data: assembleData, error: assembleError } = await supabaseAdmin.functions.invoke('assemble-context', {
        body: {
          results: searchResults,
          maxContextLength: 6000 // Adjust based on your model's context window
        }
      });
      
      if (assembleError) {
        await logDebug('AI_PROCESSING', 'Error calling assemble-context', { 
          error: assembleError
        });
        console.error('❌ Error calling assemble-context:', assembleError);
        return false;
      }
      
      if (!assembleData.success) {
        await logDebug('AI_PROCESSING', 'Context assembly failed', { 
          error: assembleData.error
        });
        console.error('❌ Context assembly failed:', assembleData.error);
        return false;
      }
      
      const assembledContext = assembleData.assembled.context || '';
      await logDebug('AI_PROCESSING', 'Context assembled', { 
        contextLength: assembledContext.length,
        stats: assembleData.assembled.stats
      });
      console.log(`✅ Context assembled: ${assembledContext.length} characters`);
      console.log(`📊 Context stats:`, assembleData.assembled.stats);
      
      // Step 3: Call generate-response edge function
      await logDebug('AI_PROCESSING', 'Calling generate-response');
      console.log('🧠 Phase 2.3: Calling generate-response to create AI response');
      
      const { data: responseData, error: responseError } = await supabaseAdmin.functions.invoke('generate-response', {
        body: {
          query: messageText,
          context: assembledContext,
          systemPrompt: aiConfigData.system_prompt,
          temperature: aiConfigData.temperature || 0.3,
          model: aiConfigData.model || 'gpt-4o-mini'
        }
      });
      
      if (responseError) {
        await logDebug('AI_PROCESSING', 'Error calling generate-response', { 
          error: responseError
        });
        console.error('❌ Error calling generate-response:', responseError);
        return false;
      }
      
      if (!responseData.success) {
        await logDebug('AI_PROCESSING', 'Response generation failed', { 
          error: responseData.error
        });
        console.error('❌ Response generation failed:', responseData.error);
        return false;
      }
      
      const aiAnswer = responseData.answer;
      await logDebug('AI_PROCESSING', 'Generated AI response', { 
        response: aiAnswer.substring(0, 100) + '...',
        model: responseData.model,
        usage: responseData.usage
      });
      console.log(`✅ Generated AI response: ${aiAnswer.substring(0, 100)}${aiAnswer.length > 100 ? '...' : ''}`);
      
      // Store the AI interaction in the database for history/analytics
      await logDebug('AI_PROCESSING', 'Storing AI interaction');
      const { data: interactionData, error: interactionError } = await supabaseAdmin
        .from('whatsapp_ai_interactions')
        .insert({
          whatsapp_instance_id: instanceId,
          user_message: messageText,
          user_phone: remoteJid.split('@')[0],
          ai_response: aiAnswer,
          context_token_count: assembleData.assembled.stats.totalTokenEstimate || 0,
          search_result_count: searchResults.length,
          response_model: responseData.model,
          prompt_tokens: responseData.usage?.prompt_tokens || 0,
          completion_tokens: responseData.usage?.completion_tokens || 0,
          total_tokens: responseData.usage?.total_tokens || 0
        })
        .select('id')
        .single();
        
      if (interactionError) {
        await logDebug('AI_PROCESSING', 'Failed to store AI interaction', { 
          error: interactionError.message
        });
        console.warn('⚠️ Failed to store AI interaction:', interactionError);
        // Continue despite error - this is non-critical
      } else {
        await logDebug('AI_PROCESSING', 'Stored AI interaction', { 
          interactionId: interactionData?.id
        });
        console.log(`✅ Stored AI interaction with ID: ${interactionData?.id}`);
      }
      
      // PHASE 3: Send the AI response back via EVOLUTION API
      await logDebug('AI_PROCESSING', 'Sending AI response via EVOLUTION API');
      console.log('📤 Phase 3: Sending AI response back to user via EVOLUTION API');
      
      try {
        // Build the URL for the message sending endpoint
        const sendMessageUrl = `${instanceBaseUrl}/api/v1/message/sendText/${instanceName2}`;
        await logDebug('AI_PROCESSING', 'Sending message to URL', { 
          url: sendMessageUrl,
          instance: instanceName2
        });
        console.log(`🔗 Sending message to URL: ${sendMessageUrl}`);
        
        // Format the number correctly - remove any non-digit characters
        const phoneNumber = remoteJid.split('@')[0].replace(/\D/g, '');
        
        // Prepare the request body
        const sendMessageBody = {
          number: phoneNumber,
          options: {
            delay: 1000, // 1 second delay
            presence: "composing" // Show "typing" indicator
          },
          textMessage: {
            text: aiAnswer
          }
        };
        
        await logDebug('AI_PROCESSING', 'Sending message with body', { 
          number: phoneNumber,
          messageLength: aiAnswer.length
        });
        console.log('📨 Request body:', JSON.stringify(sendMessageBody));
        
        // Send the message using fetch
        const response = await fetch(sendMessageUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY
          },
          body: JSON.stringify(sendMessageBody)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          await logDebug('AI_PROCESSING', 'Failed to send message', { 
            status: response.status,
            statusText: response.statusText,
            errorText
          });
          throw new Error(`Failed to send message: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const responseData = await response.json();
        await logDebug('AI_PROCESSING', 'Message sent successfully', responseData);
        console.log('✅ Message sent successfully:', JSON.stringify(responseData));
        
        return true;
      } catch (error) {
        await logDebug('AI_PROCESSING', 'Error sending message via EVOLUTION API', { 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error('❌ Error sending message via EVOLUTION API:', error);
        return false;
      }
    } catch (error) {
      await logDebug('AI_PROCESSING', 'Error during AI response processing', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('❌ Error during AI response processing:', error);
      return false;
    }
  } catch (error) {
    await logDebug('AI_PROCESSING', 'Error processing message for AI', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error('❌ Error processing message for AI:', error);
    return false;
  }
}

// Main webhook handler
async function handleWebhook(req: Request): Promise<Response> {
  try {
    console.log('⭐ WEBHOOK REQUEST RECEIVED ⭐');
    await logDebug('WEBHOOK', 'Webhook request received');
    
    // Extract content from the request using our robust extraction function
    const { parsedData, contentType, rawContent } = await extractRequestContent(req);
    
    await logDebug('WEBHOOK', 'Extracted content', { 
      contentType,
      dataPreview: JSON.stringify(parsedData).substring(0, 500) 
    });
    console.log(`Processing webhook with content-type: ${contentType}`);
    console.log('📨 Incoming webhook data:', JSON.stringify(parsedData).substring(0, 500));
    
    // For test requests, handle differently
    if (req.method === 'POST' && parsedData.action === 'test') {
      await logDebug('WEBHOOK', 'Test request detected');
      return handleTestRequest(parsedData);
    }
    
    // For status check requests
    if (req.method === 'POST' && parsedData.action === 'status') {
      await logDebug('WEBHOOK', 'Status check request detected');
      return handleStatusRequest();
    }
    
    // Normalize the event data to a consistent format
    const normalizedEvent = normalizeEventData(parsedData);
    await logDebug('WEBHOOK', 'Normalized event', normalizedEvent);
    console.log('✅ Normalized event:', JSON.stringify(normalizedEvent).substring(0, 500));
    
    // Additional validation before insert
    if (!normalizedEvent.event || !normalizedEvent.instance) {
      await logDebug('WEBHOOK', 'Invalid normalized event - missing required fields', normalizedEvent);
      console.error('❌ Invalid normalized event - missing required fields:', JSON.stringify(normalizedEvent));
      await logWebhookError('Invalid normalized event - missing required fields', rawContent, contentType, normalizedEvent);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Invalid webhook data' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if this is a messages.upsert event and attempt to process for AI
    let aiProcessed = false;
    if (normalizedEvent.event === 'messages.upsert' && normalizedEvent.data) {
      await logDebug('WEBHOOK', 'Messages.upsert event detected, checking for AI processing');
      const messageData = normalizedEvent.data.messages ? normalizedEvent.data.messages[0] : normalizedEvent.data;
      
      if (messageData) {
        await logDebug('WEBHOOK', 'Processing message for AI', { 
          instance: normalizedEvent.instance 
        });
        aiProcessed = await processMessageForAI(messageData, normalizedEvent.instance);
        
        if (aiProcessed) {
          await logDebug('WEBHOOK', 'Message successfully processed for AI');
          console.log('✅ Message successfully processed for AI');
        } else {
          await logDebug('WEBHOOK', 'Message was not processed for AI');
          console.log('⚠️ Message was not processed for AI');
        }
      } else {
        await logDebug('WEBHOOK', 'No message data found for AI processing');
      }
    }
    
    // Store in database
    await logDebug('WEBHOOK', 'Storing webhook message in database');
    console.log('💾 Attempting to insert webhook message into database...');
    
    try {
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('webhook_messages')
        .insert({
          event: normalizedEvent.event,
          instance: normalizedEvent.instance,
          data: normalizedEvent.data
        });
      
      if (insertError) {
        await logDebug('WEBHOOK', 'Database insertion error', { 
          error: insertError.message 
        });
        console.error('❌ Database insertion error:', insertError);
        await logWebhookError(insertError.message, rawContent, contentType, normalizedEvent);
        
        // Even if we failed to store it, return 200 to avoid EVOLUTION API retries
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Failed to process webhook, but received' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      await logDebug('WEBHOOK', 'Successfully processed and stored webhook message');
      console.log('✅ Successfully processed and stored webhook message');
      
      // Return success response - ALWAYS return 200 to prevent retries
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook received and processed successfully',
          aiProcessed: aiProcessed
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (dbError) {
      await logDebug('WEBHOOK', 'Unexpected database error', { 
        error: dbError instanceof Error ? dbError.message : 'Unknown database error'
      });
      console.error('❌ Unexpected database error:', dbError);
      await logWebhookError(dbError instanceof Error ? dbError.message : 'Unknown database error', 
                           rawContent, contentType, normalizedEvent);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Database error, but request received' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    await logDebug('WEBHOOK', 'Unexpected error in webhook handler', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error('❌ Unexpected error in webhook handler:', error);
    
    try {
      await logWebhookError(error instanceof Error ? error.message : 'Unknown error', 
                           'Failed to extract content', 'unknown', null);
    } catch (logError) {
      console.error('❌ Failed to log webhook error:', logError);
    }
    
    // Return 200 even for errors to prevent retries
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error processing webhook, but request received' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Helper function to log errors for debugging
async function logWebhookError(errorMessage: string, rawContent: string, contentType: string, normalizedData: any): Promise<void> {
  try {
    await supabaseAdmin
      .from('webhook_errors')
      .insert({
        error_message: errorMessage,
        raw_content: rawContent,
        content_type: contentType,
        normalized_data: normalizedData,
        created_at: new Date().toISOString()
      });
    
    console.log('✅ Webhook error logged to database');
  } catch (error) {
    console.error('❌ Failed to log webhook error to database:', error);
  }
}

// Handle test requests
async function handleTestRequest(data: any): Promise<Response> {
  try {
    console.log('Processing test request:', JSON.stringify(data));
    
    // Extract instance name and test data
    const { instanceName, testData } = data;
    
    if (!instanceName) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing instanceName parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // If test data is provided, store a test message
    if (testData) {
      // Store test message in database
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('webhook_messages')
        .insert({
          event: testData.event || 'test',
          instance: instanceName,
          data: testData.data || { message: 'Test message' }
        });
      
      if (insertError) {
        console.error('Error inserting test message:', insertError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Failed to store test message',
            details: insertError.message
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Test message stored successfully');
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test webhook processed successfully',
        details: { instanceName }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing test request:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error processing test request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Handle status check requests
async function handleStatusRequest(): Promise<Response> {
  try {
    // Check webhook configurations
    const { data: webhookConfigs, error: configError } = await supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('*');
    
    if (configError) {
      console.error('Error fetching webhook configurations:', configError);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to retrieve webhook configurations',
          details: configError.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook status checked successfully',
        activeWebhooks: webhookConfigs
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking webhook status:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error checking webhook status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Main handler function
serve(async (req) => {
  console.log(`🔔 Webhook request received: ${req.method} ${new URL(req.url).pathname}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }
  
  // Process the webhook - note we're not checking for auth headers
  return handleWebhook(req);
});
