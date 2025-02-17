
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse the request body only for POST requests
    let instanceName = '';
    if (req.method === 'POST') {
      const body = await req.json();
      instanceName = body.instanceName;
    }

    if (!instanceName) {
      throw new Error('Instance name is required');
    }

    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!apiKey) {
      console.error('Evolution API key not found in environment variables');
      throw new Error('Evolution API key not configured');
    }

    console.log('Creating WhatsApp instance:', instanceName);
    console.log('API Key length:', apiKey.length);

    const response = await fetch('https://api.convgo.com/instance/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS' // Added the required integration parameter
      })
    });

    const data = await response.json();
    console.log('Evolution API status:', response.status);
    console.log('Evolution API response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${data.message || JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in Edge Function:', error);
    
    const errorResponse = {
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
