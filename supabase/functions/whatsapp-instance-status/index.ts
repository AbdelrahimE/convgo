
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";
import logDebug from "../_shared/webhook-logger.ts";

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

    await logDebug('INSTANCE_STATUS_CHECK', `Checking connection state for instance: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/connectionState/${instanceName.trim()}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    await logDebug('INSTANCE_STATUS_RESPONSE_STATUS', `Response status for instance ${instanceName}`, {
      statusCode: response.status
    });
    
    const data = await response.json();
    await logDebug('INSTANCE_STATUS_RESPONSE_DATA', `Received response data for instance ${instanceName}`, {
      responseData: data
    });
    
    // Map Evolution API connection state to our expected states
    let state = 'close';
    let statusReason = data.instance?.state || 'Unknown';

    if (data.instance?.state === 'open') {
      state = 'open';
    } else if (data.instance?.state === 'connecting') {
      state = 'connecting';
    }

    await logDebug('INSTANCE_STATUS_MAPPED', `Mapped status for instance ${instanceName}`, {
      originalState: data.instance?.state,
      mappedState: state
    });

    return new Response(JSON.stringify({
      state,
      statusReason,
      rawResponse: data // Include raw response for debugging
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    await logDebug('INSTANCE_STATUS_ERROR', 'Error checking WhatsApp instance status', {
      error: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
