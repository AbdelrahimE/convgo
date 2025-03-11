
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080'; // default for local testing

interface SendMessageRequest {
  instanceName: string;
  to: string;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceName, to, message } = await req.json() as SendMessageRequest;

    if (!instanceName || !to || !message) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'instanceName, to, and message are required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Sending message to ${to} from instance ${instanceName}`);

    // Make request to EVOLUTION API to send a message
    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: to,
        options: {
          delay: 1200,
          presence: "composing"
        },
        textMessage: {
          text: message
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`EVOLUTION API error: ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    return new Response(
      JSON.stringify({
        success: true,
        data: responseData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in whatsapp-send-message function:', error);
    
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
