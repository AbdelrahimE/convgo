
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";
import logger from '@/utils/logger';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceName } = await req.json();
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      throw new Error('Evolution API key not configured');
    }

    logger.log(`Attempting to logout WhatsApp instance: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Error from Evolution API:', errorData);
      throw new Error(`Failed to logout instance: ${errorData.error || response.statusText}`);
    }

    logger.log(`Successfully logged out WhatsApp instance: ${instanceName}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    logger.error('Error in logout function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
