
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * IMPORTANT: This is a simplified version of the WebSocket implementation.
 * The actual WebSocket functionality has been removed as the system now
 * relies entirely on webhooks for message handling.
 * 
 * This file maintains the API endpoints for compatibility but doesn't
 * create actual WebSocket connections.
 */

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { action } = await req.json();

    // Main actions this endpoint supports (now simplified)
    switch (action) {
      case 'start':
        return handleStart();
      case 'stop':
        return handleStop();
      case 'status':
        return handleStatus();
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid action' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Returns a success response but doesn't actually start WebSocket connections.
 * The system relies on webhooks instead.
 */
async function handleStart(): Promise<Response> {
  console.log('WebSocket start requested - This functionality has been deprecated in favor of webhooks');
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      message: 'WebSocket functionality has been deprecated. The system now uses webhooks for message handling.',
      webhookStatus: 'active'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Returns a success response but doesn't actually stop any connections.
 */
async function handleStop(): Promise<Response> {
  console.log('WebSocket stop requested - This functionality has been deprecated in favor of webhooks');
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      message: 'WebSocket functionality has been deprecated. The system now uses webhooks for message handling.' 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Returns a status response indicating that WebSockets are not in use.
 */
async function handleStatus(): Promise<Response> {
  console.log('WebSocket status requested - This functionality has been deprecated in favor of webhooks');
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      message: 'WebSocket functionality has been deprecated. The system now uses webhooks for message handling.',
      activeConnections: {},
      count: 0,
      webhookStatus: 'active'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
