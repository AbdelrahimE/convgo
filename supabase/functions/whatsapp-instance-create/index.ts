
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    const body = await req.json();
    const { instanceName } = body;

    if (!instanceName || typeof instanceName !== 'string') {
      throw new Error('Instance name is required and must be a string');
    }

    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!apiKey) {
      throw new Error('Evolution API key not configured');
    }

    console.log('Request to Evolution API:');
    console.log('URL:', 'https://api.convgo.com/instance/create');
    console.log('Body:', JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    }, null, 2));

    const response = await fetch('https://api.convgo.com/instance/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Evolution API error response:', data);
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
    }

    console.log('Evolution API success response:', data);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in Edge Function:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
