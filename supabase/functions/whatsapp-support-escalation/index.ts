
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { handleSupportEscalation, WebhookData } from "../_shared/escalation-utils.ts";
import messageBufferManager from "../_shared/message-buffer.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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

    // Check URL parameters for already found instance ID
    const url = new URL(req.url);
    const foundInstanceId = url.searchParams.get('foundInstanceId');
    const transcribedText = url.searchParams.get('transcribedText');

    // Before processing, flush all buffered messages to ensure we don't miss any context
    // This is important for escalation because we want to check with complete context
    if (webhookData.instance) {
      const fromNumber = webhookData.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
      if (fromNumber) {
        const bufferKey = `${webhookData.instance}:${fromNumber}`;
        logger.info(`Flushing message buffer for ${bufferKey} before escalation check`);
        
        // Use the enhanced buffering system - force immediate processing of any pending messages
        messageBufferManager.flushAllBuffers(async (messages) => {
          logger.info(`Flushed ${messages.length} buffered messages before escalation check`);
          // This is a noop callback since we just want to flush, not process
        });
      }
    }

    // Process the message using the extracted core logic
    const result = await handleSupportEscalation(
      webhookData,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      EVOLUTION_API_URL,
      EVOLUTION_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY,  // Pass the service role key
      foundInstanceId,  // Pass the already-found instance ID if available
      transcribedText   // Pass the transcribed text if available
    );

    // If the result indicates AI limit exceeded, return with appropriate status code
    if (result.ai_limit_exceeded) {
      return new Response(JSON.stringify(result), { 
        status: 429,  // Too Many Requests
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    logger.error('Error in support escalation function:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
