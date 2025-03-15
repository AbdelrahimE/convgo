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

// Track active WebSocket connections
const activeConnections = new Map<string, WebSocket>();

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
      case 'stop':
        return handleStop();
      case 'status':
        return handleStatus();
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

    // Create WebSocket connections for each active instance
    const instanceNames = instances.map(inst => inst.instance_name);
    const connectedInstances = [];
    
    for (const instance of instanceNames) {
      // Skip if a connection already exists
      if (activeConnections.has(instance)) {
        connectedInstances.push(instance);
        continue;
      }
      
      try {
        // Connect to the EVOLUTION API WebSocket endpoint
        await connectToEvolutionWebSocket(instance);
        connectedInstances.push(instance);
      } catch (error) {
        console.error(`Failed to connect to WebSocket for instance ${instance}:`, error);
      }
    }

    if (connectedInstances.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to connect to any WhatsApp instances' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'WebSocket connections established',
        instances: connectedInstances
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleStart:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to start WebSocket connections',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

async function handleStop(): Promise<Response> {
  try {
    // Close all active WebSocket connections
    for (const [instance, ws] of activeConnections.entries()) {
      try {
        ws.close();
        activeConnections.delete(instance);
        console.log(`Closed WebSocket connection for instance: ${instance}`);
      } catch (error) {
        console.error(`Error closing WebSocket for instance ${instance}:`, error);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'All WebSocket connections closed' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleStop:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to stop WebSocket connections',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

async function handleStatus(): Promise<Response> {
  try {
    const connectionStatus = {};
    
    for (const [instance, ws] of activeConnections.entries()) {
      connectionStatus[instance] = {
        connected: ws.readyState === WebSocket.OPEN,
        readyState: ws.readyState
      };
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        activeConnections: connectionStatus,
        count: activeConnections.size
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleStatus:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to get WebSocket connection status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Function to establish a WebSocket connection to the EVOLUTION API
async function connectToEvolutionWebSocket(instanceName: string): Promise<void> {
  try {
    console.log(`Connecting to WebSocket for instance: ${instanceName}`);
    
    // Construct the WebSocket URL - Using the correct format from documentation
    const wsUrl = `wss://api.convgo.com/${instanceName}`;
    
    // Create WebSocket connection
    const ws = new WebSocket(wsUrl);
    
    // Set up event handlers
    ws.onopen = () => {
      console.log(`WebSocket connection established for instance: ${instanceName}`);
      activeConnections.set(instanceName, ws);
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`Received message for instance ${instanceName}:`, JSON.stringify(message));
        
        // Only process message events
        if (message.event === 'messages.upsert') {
          await handleWhatsAppMessage(message as EvolutionMessage);
        }
      } catch (error) {
        console.error(`Error processing WebSocket message for ${instanceName}:`, error);
      }
    };
    
    ws.onerror = (error) => {
      console.error(`WebSocket error for instance ${instanceName}:`, error);
      activeConnections.delete(instanceName);
    };
    
    ws.onclose = () => {
      console.log(`WebSocket connection closed for instance: ${instanceName}`);
      activeConnections.delete(instanceName);
    };
    
    // Wait for the connection to establish or fail
    return new Promise((resolve, reject) => {
      // Set a timeout for the connection attempt
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timeout for instance: ${instanceName}`));
      }, 10000); // 10 second timeout
      
      // Success handler
      ws.onopen = () => {
        clearTimeout(timeout);
        console.log(`WebSocket connection established for instance: ${instanceName}`);
        activeConnections.set(instanceName, ws);
        resolve();
      };
      
      // Error handler
      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error(`WebSocket error for instance ${instanceName}:`, error);
        reject(error);
      };
    });
  } catch (error) {
    console.error(`Error establishing WebSocket connection for ${instanceName}:`, error);
    throw error;
  }
}

// Function to handle an incoming WhatsApp message
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
    
    // Extract the pure phone number from JID if needed
    const recipientNumber = recipientJid.includes('@') 
      ? recipientJid.split('@')[0] 
      : recipientJid;
    
    console.log(`Sending response to ${recipientNumber} using instance ${instanceName}`);
    
    // Prepare the request using the exact format from Evolution API documentation
    const response = await fetch(`https://api.convgo.com/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: recipientNumber,
        text: responseText
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`EVOLUTION API error: ${errorData}`);
    }
    
    console.log(`Response successfully sent to ${recipientNumber} on instance ${instanceName}`);
  } catch (error) {
    console.error('Error sending WhatsApp response:', error);
  }
}
