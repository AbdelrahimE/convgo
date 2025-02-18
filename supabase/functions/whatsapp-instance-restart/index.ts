
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

    console.log('Restarting instance:', instanceName);

    const response = await fetch(`https://api.convgo.com/instance/restart/${instanceName}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      }
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Evolution API error response:', data);
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
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
