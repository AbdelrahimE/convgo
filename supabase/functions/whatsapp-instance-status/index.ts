
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { instanceName } = await req.json();
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      throw new Error('Evolution API key not configured');
    }

    console.log(`Checking status for instance: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/info/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('API response status:', response.status);
    const data = await response.json();
    console.log('API response data:', JSON.stringify(data, null, 2));

    // Even if response is not ok, we still want to process the data
    // as the Evolution API might return useful information
    return new Response(JSON.stringify({
      instance: {
        state: data.instance?.status || 'UNKNOWN',
        qrcode: data.qrcode?.base64 || null, // Don't split the base64 string
        instanceId: data.instance?.instanceId,
        statusReason: data.instance?.status
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Always return 200 if we can process the response
    });

  } catch (error) {
    console.error('Error in status check:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Return 200 even for errors to prevent frontend issues
    });
  }
});
