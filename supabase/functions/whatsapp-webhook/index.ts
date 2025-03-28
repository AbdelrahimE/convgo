import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { handleSupportEscalation, WebhookData } from "../_shared/escalation-utils.ts";

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

// Helper function to check if an instance is actually a support phone number
async function isSupportPhoneNumber(supabaseAdmin, instanceName) {
  // Check if the instance name matches any support phone number
  const { data: supportConfig } = await supabaseAdmin
    .from('whatsapp_support_config')
    .select('support_phone_number')
    .eq('support_phone_number', instanceName)
    .maybeSingle();
  
  return !!supportConfig; // Return true if we found a match, false otherwise
}

// Middleware to validate the request path and method
const withValidPathAndMethod = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Check if the path is exactly '/whatsapp-webhook'
    if (pathname !== '/whatsapp-webhook') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return handler(req);
  };
};

// Middleware to verify the Supabase webhook signature
const withWebhookSignatureVerification = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    const expectedSignature = Deno.env.get('SUPABASE_WEBHOOK_SECRET');
    const signature = req.headers.get('x-signature') || '';

    if (!expectedSignature || expectedSignature.length === 0) {
      console.warn('Missing SUPABASE_WEBHOOK_SECRET environment variable. Skipping signature verification.');
      return handler(req);
    }

    if (!signature) {
      console.warn('Missing x-signature header. Rejecting request.');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (signature !== expectedSignature) {
      console.warn('Invalid x-signature header. Rejecting request.');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return handler(req);
  };
};

serve(withValidPathAndMethod(withWebhookSignatureVerification(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Check if the path is exactly '/whatsapp-webhook'
    if (pathname !== '/whatsapp-webhook') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize the Supabase client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Extract the webhook data
    const webhookBody = await req.json();
    
    // Validate the webhook data
    if (!webhookBody || typeof webhookBody !== 'object') {
      console.error('Invalid webhook body:', webhookBody);
      return new Response(JSON.stringify({ success: false, error: 'Invalid webhook body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookData = webhookBody as WebhookData;

    if (!webhookData.instance || !webhookData.event || !webhookData.data) {
      console.error('Invalid webhook data structure:', webhookData);
      return new Response(JSON.stringify({ success: false, error: 'Invalid webhook data structure' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Extract the instance from the webhook payload
    const instance = webhookData.instance || '';
    console.log(`[WEBHOOK_INSTANCE_FROM_PAYLOAD] Extracted instance from payload: ${instance}`);

    // NEW: Check if this is a support phone number before proceeding
    const isSupportPhone = await isSupportPhoneNumber(supabaseAdmin, instance);
    if (isSupportPhone) {
      console.log(`[SUPPORT_PHONE_IGNORED] Ignoring message from support phone number: ${instance}`);
      // Log this event for monitoring
      await supabaseAdmin.from('webhook_debug_logs').insert({
        category: 'support_phone',
        message: `Ignored message from support phone number: ${instance}`,
        data: { webhook_brief: { instance, event: webhookData.event } }
      });
      // Return success but don't process further
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Support phone number message ignored' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Check URL parameters for already found instance ID
    const urlParams = new URL(req.url).searchParams;
    const foundInstanceId = urlParams.get('foundInstanceId');
    const transcribedText = urlParams.get('transcribedText');

    // Process the message using the extracted core logic
    const result = await handleSupportEscalation(
      webhookData,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      EVOLUTION_API_URL,
      EVOLUTION_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY, // Pass the service role key
      foundInstanceId, // Pass the already-found instance ID if available
      transcribedText  // Pass the transcribed text if available
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in webhook function:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})));
