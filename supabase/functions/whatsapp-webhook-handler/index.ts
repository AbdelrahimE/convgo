
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse webhook data
    const webhookData = await req.json();
    console.log('Received webhook data:', JSON.stringify(webhookData));

    // Check if this is a message event
    if (webhookData.event !== 'messages.upsert' || 
        !webhookData.data || 
        !webhookData.data.instance || 
        !webhookData.data.messages || 
        webhookData.data.messages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored non-message event' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const instanceName = webhookData.data.instance.instanceName;
    const message = webhookData.data.messages[0];

    // Ignore messages sent by the user (only process incoming messages)
    if (message.key.fromMe) {
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored outgoing message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ignore non-text messages for now
    if (!message.message?.conversation && !message.message?.extendedTextMessage?.text) {
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored non-text message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the message text
    const messageText = message.message.conversation || 
                        message.message.extendedTextMessage?.text || '';
    
    // Get the sender's phone number
    const senderNumber = message.key.remoteJid.replace('@s.whatsapp.net', '');
    
    console.log(`Processing message from ${senderNumber}: ${messageText}`);

    // Get instance details
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, user_id')
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instanceData) {
      throw new Error(`Instance not found: ${instanceError?.message || 'No data'}`);
    }

    // Check if AI is active for this instance
    const { data: aiConfigData, error: aiConfigError } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceData.id)
      .eq('is_active', true)
      .single();

    if (aiConfigError || !aiConfigData) {
      console.log(`AI not active for instance ${instanceName}`);
      return new Response(
        JSON.stringify({ success: true, message: 'AI not active for this instance' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the files associated with this instance
    const { data: mappingsData, error: mappingsError } = await supabase
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceData.id);

    if (mappingsError) {
      throw new Error(`Error getting file mappings: ${mappingsError.message}`);
    }

    if (!mappingsData || mappingsData.length === 0) {
      console.log(`No files mapped to instance ${instanceName}`);
      
      // Send a response indicating no files are mapped
      await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: senderNumber,
          options: {
            delay: 1200,
            presence: "composing"
          },
          textMessage: {
            text: "I'm sorry, but I don't have any information to respond with. Please contact the administrator."
          }
        })
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'No files mapped to this instance' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare file IDs for the semantic search
    const fileIds = mappingsData.map(mapping => mapping.file_id);

    // Perform semantic search
    const semanticSearchResponse = await fetch(
      `${supabaseUrl}/functions/v1/semantic-search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          query: messageText,
          limit: 5,
          threshold: 0.7,
          fileIds: fileIds
        })
      }
    );

    if (!semanticSearchResponse.ok) {
      const errorData = await semanticSearchResponse.json();
      throw new Error(`Semantic search error: ${JSON.stringify(errorData)}`);
    }

    const searchResults = await semanticSearchResponse.json();
    console.log(`Got ${searchResults.results?.length || 0} search results`);

    // If no relevant content found
    if (!searchResults.results || searchResults.results.length === 0) {
      await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: senderNumber,
          options: {
            delay: 1200,
            presence: "composing"
          },
          textMessage: {
            text: "I'm sorry, but I couldn't find any relevant information to answer your question."
          }
        })
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'No relevant content found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assemble context from search results
    const context = searchResults.results
      .map(result => result.content)
      .join('\n\n');

    // Generate AI response
    const generateResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-response`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          query: messageText,
          context: context,
          systemPrompt: aiConfigData.system_prompt,
          temperature: aiConfigData.temperature,
          model: 'gpt-4o-mini'
        })
      }
    );

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json();
      throw new Error(`Generate response error: ${JSON.stringify(errorData)}`);
    }

    const responseData = await generateResponse.json();
    const aiAnswer = responseData.answer;

    // Send the AI response back to the user
    const sendResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: senderNumber,
        options: {
          delay: 1200,
          presence: "composing"
        },
        textMessage: {
          text: aiAnswer
        }
      })
    });

    if (!sendResponse.ok) {
      const errorData = await sendResponse.json();
      throw new Error(`Error sending message: ${JSON.stringify(errorData)}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'AI response sent successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in whatsapp-webhook-handler function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
