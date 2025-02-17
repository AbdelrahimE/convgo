
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

    // First, try to get connection state
    const connectionResponse = await fetch(`https://api.convgo.com/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('Connection response status:', connectionResponse.status);
    const connectionData = await connectionResponse.json();
    console.log('Connection response data:', connectionData);

    if (!connectionResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Connection check failed',
        details: connectionData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: connectionResponse.status
      });
    }

    // If not connected, try to get QR code
    if (connectionData.state !== 'open') {
      const qrResponse = await fetch(`https://api.convgo.com/instance/qrcode/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('QR response status:', qrResponse.status);
      const qrData = await qrResponse.json();
      console.log('QR response data:', qrData);

      return new Response(JSON.stringify({
        instance: {
          state: connectionData.state,
          qrcode: qrData.qrcode,
          statusReason: connectionData.statusReason
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // If connected, return connection state
    return new Response(JSON.stringify({
      instance: {
        state: connectionData.state,
        qrcode: null,
        statusReason: connectionData.statusReason
      }
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
      status: 500,
    });
  }
});
