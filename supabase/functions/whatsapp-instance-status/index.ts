
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
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

    const data = await response.json();
    console.log('Evolution API response:', data);

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: 'Instance not ready',
        details: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in status check:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
