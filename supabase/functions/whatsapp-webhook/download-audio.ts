
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { downloadAudioFile } from "../_shared/audio-download.ts";
import logDebug from "../_shared/webhook-logger.ts";

// Define standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    const { url, instance, evolutionApiKey } = await req.json();
    
    if (!url || !instance) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters' 
        }),
        { 
          status: 400, 
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    // Use the existing downloadAudioFile from the shared utilities
    const result = await downloadAudioFile(url, instance, evolutionApiKey);
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    await logDebug('DOWNLOAD_AUDIO_ERROR', 'Error processing audio download request', { error });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
