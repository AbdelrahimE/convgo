
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface RequestBody {
  instanceName: string;
  phone: string;
  message: string;
}

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

if (!EVOLUTION_API_URL) {
  logger.error('EVOLUTION_API_URL environment variable is not set');
}

if (!EVOLUTION_API_KEY) {
  logger.error('EVOLUTION_API_KEY environment variable is not set');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json() as RequestBody;
    const { instanceName, phone, message } = requestData;

    if (!instanceName || !phone || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: instanceName, phone, or message',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Format the phone number (remove any non-numeric characters except the + sign)
    const formattedPhone = phone.startsWith('+') 
      ? phone.replace(/[^\d+]/g, '') 
      : phone.replace(/\D/g, '');

    // Build the request URL for the EVOLUTION API
    const apiUrl = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;

    logger.log(`Sending WhatsApp message to ${formattedPhone} via instance ${instanceName}`);

    // Send the message using the EVOLUTION API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: formattedPhone,
        options: {
          delay: 1200
        },
        textMessage: {
          text: message
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`EVOLUTION API error (${response.status}):`, errorText);
      
      return new Response(
        JSON.stringify({
          success: false,
          message: `WhatsApp API error: ${response.status} ${response.statusText}`,
          details: errorText
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    const responseData = await response.json();
    logger.log('EVOLUTION API response:', JSON.stringify(responseData));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'WhatsApp message sent successfully',
        data: responseData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in whatsapp-send-message function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
