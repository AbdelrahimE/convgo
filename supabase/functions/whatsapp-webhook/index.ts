
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Get API key for EVOLUTION API
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

// Function to send a WhatsApp response using the Evolution API
async function sendWhatsAppResponse(instanceName: string, recipientNumber: string, responseText: string): Promise<void> {
  try {
    console.log(`Sending response to ${recipientNumber} using instance ${instanceName}`);
    
    // Format the recipient number - remove any @ and domain parts if present
    const cleanRecipientNumber = recipientNumber.includes('@') 
      ? recipientNumber.split('@')[0] 
      : recipientNumber;
    
    // Prepare the request using the exact format from Evolution API documentation
    const response = await fetch(`https://api.convgo.com/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: cleanRecipientNumber,
        text: responseText
      })
    });
    
    const responseText = await response.text();
    console.log(`API Response: ${response.status}`, responseText);
    
    if (!response.ok) {
      throw new Error(`EVOLUTION API error: Status ${response.status} - ${responseText}`);
    }
    
    console.log(`Response successfully sent to ${cleanRecipientNumber} using instance ${instanceName}`);
  } catch (error) {
    console.error('Error sending WhatsApp response:', error);
    throw error;
  }
}

// Helper function to extract message text from various message types
function extractMessageText(message: any): string {
  if (!message) return '';
  
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  
  return '';
}

// Handle incoming webhook requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  console.log('WEBHOOK REQUEST RECEIVED', {
    url: req.url,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  try {
    // Parse the full URL to determine the type of webhook
    const url = new URL(req.url);
    const fullPath = url.pathname;
    const pathParts = fullPath.split('/').filter(Boolean);
    
    console.log('Full request path analysis', { fullPath, pathParts });
    
    // Handle different webhook endpoints
    if (pathParts.includes('webhook-callback')) {
      // This is for webhook callbacks from third-party services
      console.log('Received webhook callback request');
      return handleCallbackRequest(req);
    } else {
      // This is the main webhook endpoint
      return handleMainWebhook(req);
    }
  } catch (error) {
    console.error('Error processing webhook request:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Error processing webhook request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

// Handle the main webhook endpoint
async function handleMainWebhook(req: Request): Promise<Response> {
  try {
    const payload = await req.json();
    
    console.log('Webhook payload received', { data: payload });
    
    // Extract instance name from the payload
    const instanceName = payload.instance;
    if (!instanceName) {
      throw new Error('Instance name not found in webhook payload');
    }
    
    console.log(`Extracted instance from payload: ${instanceName}`);
    
    // Save the webhook message to the database for logging/debugging
    await saveWebhookMessage(instanceName, payload.event || 'unknown', payload);
    
    // Check if this is a standard Evolution API message event
    if (payload.event === 'messages.upsert') {
      console.log('Standard event format detected: messages.upsert');
      await processMessage(payload);
    }
    
    // Return a success response
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling main webhook:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Error handling webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

// Handle callback requests from third-party services
async function handleCallbackRequest(req: Request): Promise<Response> {
  try {
    const payload = await req.json();
    
    console.log('Callback webhook payload received', { data: payload });
    
    // Process the callback as needed
    // This is a placeholder for any callback-specific processing
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling callback webhook:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Error handling callback webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

// Save webhook message to the database for logging/debugging
async function saveWebhookMessage(instanceName: string, eventType: string, payload: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('whatsapp_webhook_logs')
      .insert({
        instance_name: instanceName,
        event_type: eventType,
        payload: payload,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      throw error;
    }
    
    console.log(`Webhook message saved successfully`);
  } catch (error) {
    console.error('Error saving webhook message:', error);
  }
}

// Process incoming WhatsApp messages
async function processMessage(payload: any): Promise<void> {
  try {
    const instanceName = payload.instance;
    const messageData = payload.data;
    
    if (!messageData || !messageData.key) {
      console.log('No valid message data in payload');
      return;
    }
    
    // Extract relevant message information
    const isFromMe = messageData.key.fromMe === true;
    const remoteJid = messageData.key.remoteJid;
    const isGroup = remoteJid.includes('@g.us');
    const messageText = extractMessageText(messageData.message);
    
    // Format the sender number (remove the @s.whatsapp.net part if present)
    const fromNumber = remoteJid.includes('@') 
      ? remoteJid.split('@')[0] 
      : remoteJid;
    
    console.log(`Extracted message details`, {
      isFromMe,
      remoteJid,
      fromNumber,
      messageText,
      instanceName
    });
    
    // Skip processing for:
    // 1. Messages sent by the bot itself (fromMe === true)
    // 2. Group messages (if you don't want the bot to respond in groups)
    // 3. Empty messages
    if (isFromMe || isGroup || !messageText) {
      console.log(`Skipping AI processing: ${isFromMe ? "Sent by bot" : isGroup ? "Group message" : "Empty message"}`);
      return;
    }
    
    console.log(`Processing webhook for instance: ${remoteJid}`);
    
    // Get the WhatsApp instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .single();
    
    if (instanceError || !instanceData) {
      console.error(`Instance not found in database: ${instanceName}`);
      return;
    }
    
    const instanceId = instanceData.id;
    console.log(`Found instance in database`, { status: instanceData.status, instanceId });
    
    // Check if AI is enabled for this instance
    const { data: aiConfig, error: configError } = await supabase
      .from('whatsapp_ai_config')
      .select('id, system_prompt, temperature, is_active')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .single();
    
    if (configError || !aiConfig) {
      console.error(`AI not enabled for instance: ${instanceName}`);
      return;
    }
    
    console.log(`AI is enabled for this instance`, {
      aiConfigId: aiConfig.id,
      temperature: aiConfig.temperature,
      systemPromptPreview: aiConfig.system_prompt?.substring(0, 50) + '...'
    });
    
    // Start AI message processing
    console.log(`Starting AI message processing`, { instance: instanceName });
    
    // Get file mappings for this instance
    const { data: fileMappings, error: mappingError } = await supabase
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);
    
    if (mappingError || !fileMappings || fileMappings.length === 0) {
      console.error(`No file mappings found for instance: ${instanceName}`);
      // Send a response that no files are configured
      await sendWhatsAppResponse(
        instanceName,
        fromNumber,
        "Sorry, I don't have any knowledge base configured. Please ask the administrator to set up files for this WhatsApp number."
      );
      return;
    }
    
    // Extract file IDs
    const fileIds = fileMappings.map(mapping => mapping.file_id);
    console.log(`Retrieved file mappings for instance`, {
      fileIds,
      fileCount: fileIds.length,
      instanceId
    });
    
    // Perform semantic search
    console.log(`Starting semantic search for context`, {
      fileIds,
      userQuery: messageText
    });
    
    const { data: searchData, error: searchError } = await supabase.functions.invoke('semantic-search', {
      body: { 
        query: messageText,
        fileIds,
        limit: 5,
        threshold: 0.2 // Lower threshold to increase chances of finding matches
      }
    });
    
    if (searchError) {
      console.error('Semantic search error:', searchError);
      await sendWhatsAppResponse(instanceName, fromNumber, "Sorry, I'm having trouble searching for relevant information right now.");
      return;
    }
    
    const searchResults = searchData?.results || [];
    console.log(`Semantic search completed`, {
      resultCount: searchResults.length,
      similarity: searchResults.length > 0 ? searchResults[0].similarity : 0
    });
    
    // Simple context assembly (like in WhatsAppAIConfig.tsx)
    let context = '';
    if (searchResults && searchResults.length > 0) {
      context = searchResults.map(result => result.content).join('\n\n');
      console.log(`Context assembled from ${searchResults.length} search results, ${context.length} characters`);
    } else {
      console.log('No search results found for context assembly');
    }
    
    // Generate AI response
    const { data: responseData, error: responseError } = await supabase.functions.invoke('generate-response', {
      body: {
        query: messageText,
        context: context,
        systemPrompt: aiConfig.system_prompt,
        temperature: aiConfig.temperature
      }
    });
    
    if (responseError) {
      console.error('AI response generation error:', responseError);
      await sendWhatsAppResponse(instanceName, fromNumber, "Sorry, I'm having trouble generating a response right now.");
      return;
    }
    
    const response = responseData?.answer || "I don't have an answer for that question.";
    console.log(`AI response generated: ${response.substring(0, 50)}...`);
    
    // Send response back to the user
    await sendWhatsAppResponse(instanceName, fromNumber, response);
    
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
  }
}
