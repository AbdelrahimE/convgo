
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceName } = await req.json();
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      throw new Error('Evolution API key not configured');
    }

    console.log(`Attempting to connect WhatsApp instance: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error from Evolution API:', errorData);
      throw new Error(`Failed to connect instance: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    console.log('Response from Evolution API:', data);

    // The QR code is in the 'code' field according to the API response
    if (!data.code) {
      throw new Error('No QR code received from server');
    }

    return new Response(JSON.stringify({ qrcode: data.code }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in connect function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
