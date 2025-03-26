
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { handleSupportEscalation, WebhookData } from "../_shared/escalation-utils.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the webhook data
    const webhookData = await req.json() as WebhookData;

    // Only process messages.upsert events (incoming messages)
    if (webhookData.event !== 'messages.upsert') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Event ignored, only processing messages.upsert events' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Extract parameters from URL if provided
    const url = new URL(req.url);
    const foundInstanceId = url.searchParams.get('instanceId');

    // Debug log for tracking the instance ID
    console.log(`[ESCALATION_FUNCTION] Processing with instanceId: ${foundInstanceId || 'not provided'}`);

    // Process the message using the extracted core logic
    const result = await handleSupportEscalation(
      webhookData,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      EVOLUTION_API_URL,
      EVOLUTION_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY,
      foundInstanceId
    );

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error('Error in support escalation function:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
