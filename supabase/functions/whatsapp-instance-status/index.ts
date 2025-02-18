
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

    if (!instanceName) {
      throw new Error('Instance name is required');
    }

    console.log(`Checking connection state for instance: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/connectionState/${instanceName.trim()}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('API response status:', response.status);
    const data = await response.json();
    console.log('API response data:', JSON.stringify(data, null, 2));

    // Map Evolution API connection state to our expected states
    let state = 'close';
    let statusReason = data.instance?.state || 'Unknown';

    if (data.instance?.state === 'open') {
      state = 'open';
    } else if (data.instance?.state === 'connecting') {
      state = 'connecting';
    }

    return new Response(JSON.stringify({
      state,
      statusReason,
      rawResponse: data // Include raw response for debugging
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in status check:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
