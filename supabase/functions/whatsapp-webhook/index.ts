import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Types for EVOLUTION API webhook messages
interface EvolutionMessage {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    messageType: string;
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    sender: {
      id: string;
      name: string;
      shortName: string;
    };
    chat: {
      id: string;
      name: string;
    };
  };
}

interface WebhookConfig {
  id: string;
  instance_name: string;
  webhook_url: string;
  is_active: boolean;
  last_status: string;
  last_checked_at: string;
}

interface AiConfig {
  id: string;
  whatsapp_instance_id: string;
  system_prompt: string;
  temperature: number;
  is_active: boolean;
}

interface SearchResult {
  content: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Get API key for EVOLUTION API
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

console.log(`Initializing webhook function. Supabase URL: ${supabaseUrl ? 'Set' : 'Not set'}, API Key: ${EVOLUTION_API_KEY ? 'Set' : 'Not set'}`);

serve(async (req) => {
  // Log all incoming requests for debugging
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const contentType = req.headers.get('content-type') || '';
  
  console.log(`[${new Date().toISOString()}] Received ${method} request to ${path} with Content-Type: ${contentType}`);
  
  // Handle CORS preflight requests - respond to all OPTIONS requests with OK
  if (req.method === 'OPTIONS') {
    console.log(`[${new Date().toISOString()}] Handling CORS preflight request`);
    return new Response('ok', { headers: corsHeaders });
  }

  // First, try to get raw request body for logging
  let requestBodyClone;
  try {
    // Clone the request body for logging
    const clonedReq = req.clone();
    requestBodyClone = await clonedReq.text();
    console.log(`[${new Date().toISOString()}] Raw request body (first 500 chars): ${requestBodyClone.substring(0, 500)}`);
  } catch (cloneError) {
    console.error(`[${new Date().toISOString()}] Failed to clone request body: ${cloneError.message}`);
  }
  
  // Handle different request types based on method and path
  const pathSegments = path.split('/');
  const lastSegment = pathSegments.pop() || '';
  const secondLastSegment = pathSegments.pop() || '';
  
  console.log(`[${new Date().toISOString()}] Path segments: ${JSON.stringify(pathSegments)}, last: ${lastSegment}, second last: ${secondLastSegment}`);
  
  // Try to parse the request body in various formats
  let requestBody;
  let parsedBody;
  
  try {
    // First try to read the raw body
    requestBody = await req.text();
    console.log(`[${new Date().toISOString()}] Request body length: ${requestBody.length} bytes`);
    
    // Then try to parse as JSON
    try {
      parsedBody = JSON.parse(requestBody);
      console.log(`[${new Date().toISOString()}] Successfully parsed request as JSON`);
    } catch (jsonError) {
      console.log(`[${new Date().toISOString()}] Not valid JSON, will process as text: ${jsonError.message}`);
      
      // Try to extract JSON-like patterns from the text
      if (requestBody.includes('event') && requestBody.includes('instance')) {
        console.log(`[${new Date().toISOString()}] Request contains 'event' and 'instance', treating as webhook payload`);
        
        try {
          // Try to extract using regex
          const eventMatch = requestBody.match(/"event"\s*:\s*"([^"]+)"/);
          const instanceMatch = requestBody.match(/"instance"\s*:\s*"([^"]+)"/);
          
          if (eventMatch && instanceMatch) {
            parsedBody = {
              event: eventMatch[1],
              instance: instanceMatch[1],
              data: { extracted: "from text payload" }
            };
            console.log(`[${new Date().toISOString()}] Extracted basic webhook data: event=${parsedBody.event}, instance=${parsedBody.instance}`);
          }
        } catch (extractError) {
          console.error(`[${new Date().toISOString()}] Failed to extract data from text: ${extractError.message}`);
        }
      }
    }
  } catch (bodyError) {
    console.error(`[${new Date().toISOString()}] Failed to read request body: ${bodyError.message}`);
  }
  
  // Handle webhook requests from EVOLUTION API
  // First, check if this looks like a webhook payload by checking for event and instance
  if (parsedBody && parsedBody.event && parsedBody.instance) {
    console.log(`[${new Date().toISOString()}] Processing webhook payload for event: ${parsedBody.event}, instance: ${parsedBody.instance}`);
    
    try {
      // Store the webhook message in the database for monitoring
      await supabase.from('webhook_messages').insert({
        instance: parsedBody.instance,
        event: parsedBody.event,
        data: parsedBody
      });
      
      console.log(`[${new Date().toISOString()}] Stored webhook message in database`);
      
      // Process message events in the background to avoid blocking response
      if (parsedBody.event === 'messages.upsert') {
        // Don't await this to return a response quickly
        handleWhatsAppMessage(parsedBody)
          .catch(err => console.error(`[${new Date().toISOString()}] Error processing message: ${err.message}`));
      }
      
      // Return success response immediately to acknowledge receipt
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing webhook: ${error.message}`);
      // Still return 200 to acknowledge receipt
      return new Response(
        JSON.stringify({ success: true, message: "Webhook acknowledged with errors" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
  
  // If not a webhook payload, handle API requests from our frontend
  if (parsedBody && parsedBody.action) {
    console.log(`[${new Date().toISOString()}] Processing API request with action: ${parsedBody.action}`);
    
    switch (parsedBody.action) {
      case 'register':
        return handleRegisterWebhook(parsedBody);
      case 'status':
        return handleStatus();
      case 'unregister':
        return handleUnregisterWebhook(parsedBody);
      case 'test':
        return handleWebhookTest(parsedBody);
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid action',
            details: `Action '${parsedBody.action}' not supported`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  }
  
  // If we got here, it's not a webhook or a known API request
  console.log(`[${new Date().toISOString()}] Request doesn't match expected formats`);
  
  // For any unhandled POST request to this endpoint, try to process as a webhook as a fallback
  if (method === 'POST') {
    console.log(`[${new Date().toISOString()}] Attempting to process unrecognized POST as webhook`);
    
    // Create a minimal message record for monitoring
    try {
      await supabase.from('webhook_messages').insert({
        instance: 'unknown',
        event: 'unknown',
        data: {
          raw: requestBody ? (requestBody.length > 1000 ? requestBody.substring(0, 1000) + '...' : requestBody) : null,
          headers: Object.fromEntries([...req.headers.entries()].map(([k, v]) => [k, v]))
        }
      });
      
      console.log(`[${new Date().toISOString()}] Stored unrecognized request for investigation`);
    } catch (storeError) {
      console.error(`[${new Date().toISOString()}] Failed to store unrecognized request: ${storeError.message}`);
    }
    
    // Still return success to avoid blocking the sender
    return new Response(
      JSON.stringify({ success: true, message: "Request received but not processed" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // Return 404 for other requests
  console.log(`[${new Date().toISOString()}] Unhandled request method: ${method}`);
  return new Response(
    JSON.stringify({ success: false, error: 'Not found' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
  );
});

// Handle test request - simulate processing a webhook message
async function handleWebhookTest(body: any): Promise<Response> {
  try {
    console.log('Testing webhook with data:', JSON.stringify(body));
    
    const { instanceName, testData } = body;
    
    if (!instanceName || !testData) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing instance name or test data',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Get the WhatsApp instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .single();
    
    if (instanceError || !instanceData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp instance not found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    const instanceId = instanceData.id;
    
    // Check if AI config exists
    const { data: aiConfig, error: aiConfigError } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .single();
    
    if (aiConfigError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No AI configuration found for this instance',
          details: aiConfigError.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    // Check if there are file mappings
    const { data: fileMappings, error: mappingError } = await supabase
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);
    
    if (mappingError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Error checking file mappings',
          details: mappingError.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Simulate full message processing but don't actually send a response back
    // We're only testing the processing, not the sending
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook test completed successfully',
        details: {
          aiConfigFound: !!aiConfig,
          fileMappingsFound: fileMappings && fileMappings.length > 0,
          fileCount: fileMappings?.length || 0,
          processedMessage: testData.data.message.conversation || testData.data.message.extendedTextMessage?.text
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error testing webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error testing webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle incoming webhook callbacks from EVOLUTION API
async function handleWhatsAppMessage(message: EvolutionMessage): Promise<void> {
  try {
    console.log(`Processing WhatsApp message from instance: ${message.instance}`);
    console.log(`Message content: ${message.data.message.conversation || message.data.message.extendedTextMessage?.text || 'No text content'}`);
    
    // Extract the message text
    const messageText = message.data.message.conversation || 
                        message.data.message.extendedTextMessage?.text || '';
    
    if (!messageText) {
      console.log('Empty message, ignoring');
      return;
    }
    
    // Get the WhatsApp instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', message.instance)
      .single();
    
    if (instanceError || !instanceData) {
      console.error(`Instance not found: ${message.instance}`);
      return;
    }
    
    const instanceId = instanceData.id;
    console.log(`Found instance ID: ${instanceId}`);
    
    // Get AI configuration for this instance
    const { data: aiConfig, error: configError } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .single();
    
    if (configError || !aiConfig) {
      console.error(`AI configuration not found for instance: ${message.instance}`);
      return;
    }
    console.log(`Found AI config: ${aiConfig.id}`);
    
    // Get file mappings for this instance
    const { data: fileMappings, error: mappingError } = await supabase
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);
    
    if (mappingError || !fileMappings || fileMappings.length === 0) {
      console.error(`No file mappings found for instance: ${message.instance}`);
      // Send a response that no files are configured
      await sendWhatsAppResponse(message, "Sorry, I don't have any knowledge base configured. Please ask the administrator to set up files for this WhatsApp number.");
      return;
    }
    
    console.log(`Found ${fileMappings.length} file mappings`);
    
    // Extract file IDs
    const fileIds = fileMappings.map(mapping => mapping.file_id);
    
    // Perform semantic search
    const searchResults = await performSemanticSearch(messageText, fileIds);
    console.log(`Semantic search results: ${searchResults.length} found`);
    
    // Generate AI response
    let context = '';
    if (searchResults && searchResults.length > 0) {
      context = searchResults.map(result => result.content).join('\n\n');
      console.log(`Assembled context length: ${context.length} characters`);
    }
    
    const response = await generateAIResponse(messageText, context, aiConfig);
    console.log(`Generated response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
    
    // Send response back to the user
    await sendWhatsAppResponse(message, response);
    console.log(`Response sent to ${message.data.key.remoteJid}`);
    
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
  }
}

// Function to perform semantic search
async function performSemanticSearch(query: string, fileIds: string[]): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabase.functions.invoke('semantic-search', {
      body: { 
        query, 
        fileIds,
        limit: 5 
      }
    });
    
    if (error) {
      console.error('Semantic search error:', error);
      return [];
    }
    
    return data.results || [];
  } catch (error) {
    console.error('Error in semantic search:', error);
    return [];
  }
}

// Function to generate AI response
async function generateAIResponse(query: string, context: string, aiConfig: AiConfig): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-response', {
      body: {
        query,
        context,
        systemPrompt: aiConfig.system_prompt,
        temperature: aiConfig.temperature
      }
    });
    
    if (error) {
      console.error('AI response generation error:', error);
      return "Sorry, I'm having trouble generating a response right now.";
    }
    
    return data.answer || "I don't have an answer for that question.";
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "Sorry, an error occurred while processing your request.";
  }
}

// Function to send a response back through the EVOLUTION API
async function sendWhatsAppResponse(originalMessage: EvolutionMessage, responseText: string): Promise<void> {
  try {
    const recipientJid = originalMessage.data.key.remoteJid;
    const instanceName = originalMessage.instance;
    
    console.log(`Preparing to send response to ${recipientJid} on instance ${instanceName}`);
    
    // Prepare the request to the EVOLUTION API
    const response = await fetch(`https://api.convgo.com/v1/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: recipientJid,
        options: {
          delay: 1000
        },
        textMessage: {
          text: responseText
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`EVOLUTION API error: ${errorData}`);
    }
    
    console.log(`Response sent successfully to ${recipientJid} on instance ${instanceName}`);
  } catch (error) {
    console.error('Error sending WhatsApp response:', error);
  }
}

// Register webhook with EVOLUTION API for an instance
async function handleRegisterWebhook(body: any): Promise<Response> {
  try {
    const { instanceName, webhookUrl } = body;
    
    if (!instanceName || !webhookUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Instance name and webhook URL are required' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Registering webhook for instance ${instanceName} with URL ${webhookUrl}`);
    
    // Get the WhatsApp instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .single();
    
    if (instanceError || !instanceData) {
      console.error(`Instance not found: ${instanceName}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp instance not found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    // Register webhook with EVOLUTION API
    const registerResponse = await fetch(`https://api.convgo.com/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        webhook: webhookUrl,
        // Include events you want to receive
        events: ["messages.upsert", "connection.update"],
        // Optional: webhook secret for validation
        webhook_by_events: true
      })
    });
    
    if (!registerResponse.ok) {
      const errorData = await registerResponse.text();
      throw new Error(`EVOLUTION API error: ${errorData}`);
    }
    
    const registerResult = await registerResponse.json();
    
    // Update webhook configuration in the database
    const { data: webhookData, error: webhookError } = await supabase
      .from('whatsapp_webhook_config')
      .upsert({
        whatsapp_instance_id: instanceData.id,
        instance_name: instanceName,
        webhook_url: webhookUrl,
        is_active: true,
        last_status: 'registered',
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'whatsapp_instance_id' })
      .select();
    
    if (webhookError) {
      throw new Error(`Error updating webhook config: ${webhookError.message}`);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook registered successfully',
        data: registerResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error registering webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to register webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Unregister webhook with EVOLUTION API
async function handleUnregisterWebhook(body: any): Promise<Response> {
  try {
    const { instanceName } = body;
    
    if (!instanceName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Instance name is required' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Unregistering webhook for instance ${instanceName}`);
    
    // Get the WhatsApp instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .single();
    
    if (instanceError || !instanceData) {
      console.error(`Instance not found: ${instanceName}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp instance not found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    // Unregister webhook with EVOLUTION API - set webhook URL to empty string
    const unregisterResponse = await fetch(`https://api.convgo.com/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        webhook: "", // Empty string to remove webhook
        events: []
      })
    });
    
    if (!unregisterResponse.ok) {
      const errorData = await unregisterResponse.text();
      throw new Error(`EVOLUTION API error: ${errorData}`);
    }
    
    // Update webhook configuration in the database
    const { error: webhookError } = await supabase
      .from('whatsapp_webhook_config')
      .update({
        is_active: false,
        last_status: 'unregistered',
        last_checked_at: new Date().toISOString()
      })
      .eq('whatsapp_instance_id', instanceData.id);
    
    if (webhookError) {
      throw new Error(`Error updating webhook config: ${webhookError.message}`);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook unregistered successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error unregistering webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to unregister webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Get status of webhook registration
async function handleStatus(): Promise<Response> {
  try {
    // Get all active webhook configurations
    const { data: webhookConfigs, error: configError } = await supabase
      .from('whatsapp_webhook_config')
      .select('*, whatsapp_instances!inner(instance_name, status)')
      .eq('is_active', true);
    
    if (configError) {
      throw new Error(`Error fetching webhook configurations: ${configError.message}`);
    }
    
    const activeWebhooks = webhookConfigs || [];
    
    // Check the status of each webhook with EVOLUTION API
    // This is a placeholder - EVOLUTION API may not have a direct webhook status endpoint
    // You can implement webhook validation by sending a test event if needed
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        activeWebhooks: activeWebhooks,
        count: activeWebhooks.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking webhook status:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to get webhook status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}
