
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

    // First, check if instance exists
    const infoResponse = await fetch(`https://api.convgo.com/instance/info/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!infoResponse.ok) {
      if (infoResponse.status === 404) {
        console.log('Instance not found, checking connection status');
        
        // If instance not found, try to get connection status
        const statusResponse = await fetch(`https://api.convgo.com/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': apiKey,
            'Content-Type': 'application/json'
          }
        });

        const statusData = await statusResponse.json();
        console.log('Connection status response:', statusData);

        return new Response(JSON.stringify({
          instance: {
            state: statusData.state || 'STARTING',
            qrcode: null
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }

      throw new Error(`Failed to get instance info: ${infoResponse.statusText}`);
    }

    const data = await infoResponse.json();
    console.log('Instance info response:', data);

    // Get QR code if instance exists but not connected
    if (data.instance && data.instance.state !== 'CONNECTED') {
      const qrResponse = await fetch(`https://api.convgo.com/instance/qrcode/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (qrResponse.ok) {
        const qrData = await qrResponse.json();
        if (qrData.qrcode) {
          data.instance.qrcode = qrData.qrcode;
        }
      }
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
