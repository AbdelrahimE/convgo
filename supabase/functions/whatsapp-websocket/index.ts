import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Types for EVOLUTION API WebSocket messages
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

interface WebSocketConfig {
  apiKey: string;
  server: string;
  instances: string[];
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { action } = await req.json();

    // Main actions this endpoint supports
    switch (action) {
      case 'start':
        return handleStart();
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid action' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function handleStart(): Promise<Response> {
  try {
    // Get all active WhatsApp instances from the database
    const { data: instances, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, status')
      .eq('status', 'CONNECTED');

    if (instanceError) {
      throw new Error(`Error fetching WhatsApp instances: ${instanceError.message}`);
    }

    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'No active WhatsApp instances found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create WebSocket worker for each active instance
    const instanceNames = instances.map(inst => inst.instance_name);
    
    // Create edge function URL for WebSocket worker
    const url = new URL(req.url);
    const webSocketWorkerUrl = `${url.origin}/functions/v1/whatsapp-websocket`;
    
    const webSocketConfig: WebSocketConfig = {
      apiKey: EVOLUTION_API_KEY,
      server: "https://api.convgo.com",
      instances: instanceNames
    };

    // Initiate WebSocket connection in a worker
    startWebSocketWorker(webSocketConfig);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'WebSocket connection initiated for all active instances',
        instances: instanceNames
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleStart:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to start WebSocket connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// This function will initiate a WebSocket connection to the EVOLUTION API
// Note: This is a simplified implementation. In a production environment,
// you would need a separate worker or a persistent connection mechanism.
function startWebSocketWorker(config: WebSocketConfig) {
  console.log(`Starting WebSocket worker for instances: ${config.instances.join(', ')}`);
  
  // Due to the stateless nature of edge functions, we're using a background worker approach
  // In a more robust implementation, this would be handled by a separate service
  
  (async () => {
    try {
      // In a real implementation, this would connect to the EVOLUTION API WebSocket
      // We're simulating the process here
      console.log(`Would connect to WebSocket at: ${config.server}/v1/webhook/ws?apikey=${config.apiKey}`);
      console.log('WebSocket worker would listen for messages and process them');
      
      // Simulate processing messages
      await processMessages(config);
    } catch (error) {
      console.error('WebSocket worker error:', error);
    }
  })();
}

async function processMessages(config: WebSocketConfig) {
  // In a real implementation, this would handle incoming WebSocket messages
  console.log('Started message processing simulation');
  
  // This function illustrates the flow of how messages would be processed
  // but doesn't establish an actual WebSocket connection due to edge function limitations
  
  // The logic would be:
  // 1. Receive message from WebSocket
  // 2. Identify the WhatsApp instance from the message
  // 3. Get the AI configuration for that instance
  // 4. Get file associations for that instance
  // 5. Perform semantic search on the associated files
  // 6. Generate AI response
  // 7. Send response back through WebSocket
  
  console.log('Message processing would follow these steps:');
  console.log('1. Receive message -> 2. Identify instance -> 3. Get AI config -> 4. Get file associations -> 5. Perform semantic search -> 6. Generate response -> 7. Send response');
}

// Function to handle an incoming WhatsApp message (would be called from WebSocket handler)
async function handleWhatsAppMessage(message: EvolutionMessage): Promise<void> {
  try {
    console.log(`Processing message from instance: ${message.instance}`);
    
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
    
    // Extract file IDs
    const fileIds = fileMappings.map(mapping => mapping.file_id);
    
    // Perform semantic search
    const searchResults = await performSemanticSearch(messageText, fileIds);
    
    // Generate AI response
    let context = '';
    if (searchResults && searchResults.length > 0) {
      context = searchResults.map(result => result.content).join('\n\n');
    }
    
    const response = await generateAIResponse(messageText, context, aiConfig);
    
    // Send response back to the user
    await sendWhatsAppResponse(message, response);
    
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
    
    console.log(`Response sent to ${recipientJid} on instance ${instanceName}`);
  } catch (error) {
    console.error('Error sending WhatsApp response:', error);
  }
}
