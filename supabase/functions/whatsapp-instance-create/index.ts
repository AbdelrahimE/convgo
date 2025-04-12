
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

// Create a logger for edge functions that respects configuration
const logger = {
  log: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.log(...args);
  },
  error: (...args: any[]) => {
    // Always log errors regardless of setting
    console.error(...args);
  },
  info: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.info(...args);
  },
  warn: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.warn(...args);
  },
  debug: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.debug(...args);
  },
};


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

    logger.log('Creating instance with name:', instanceName);

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
      logger.error('Evolution API error response:', data);
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
    }

    logger.log('Evolution API success response:', data);

    // Ensure we're returning the QR code in the expected format
    const responseData = {
      ...data,
      qrcode: {
        base64: data.qrcode?.base64 || data.qrcode
      }
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    logger.error('Error in Edge Function:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
