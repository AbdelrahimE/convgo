import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { handleExpiredResponses } from '../_shared/response-handler.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * External Action Timeout Handler
 *
 * This function is called periodically by pg_cron to handle expired pending responses.
 * It finds all external action responses that have exceeded their timeout and sends
 * timeout messages to customers.
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.info('🕐 External Action Timeout Handler - Starting execution...');

    const startTime = Date.now();

    // Handle expired responses
    const result = await handleExpiredResponses();

    const executionTime = Date.now() - startTime;

    logger.info('✅ Timeout handling completed successfully:', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      executionTimeMs: executionTime
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Timeout handling completed',
        statistics: {
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          executionTimeMs: executionTime
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error('💥 Critical error in timeout handler:', {
      error: error.message || error,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message || 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
