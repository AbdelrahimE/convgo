import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { handleExpiredResponses } from '../_shared/response-handler.ts';

/**
 * Handle Expired Responses Edge Function
 * 
 * This function processes expired pending responses for External Actions V2.
 * It can be called:
 * 1. Manually via HTTP request
 * 2. Via cron job/scheduled task
 * 3. Via webhook trigger
 * 
 * It finds all pending responses that have exceeded their timeout,
 * sends timeout messages to users, and marks them as handled.
 */

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    logger.info('🕐 Handle Expired Responses - Function triggered');

    // Only allow POST and GET requests
    if (!['POST', 'GET'].includes(req.method)) {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST or GET.' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Optional: Check for authorization header for security
    const authHeader = req.headers.get('authorization');
    const expectedAuth = Deno.env.get('CRON_SECRET');
    
    if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
      logger.warn('Unauthorized access attempt to expired response handler');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Process expired responses
    const result = await handleExpiredResponses();
    
    const processingTime = Date.now() - startTime;

    logger.info('📊 Expired Response Handler Summary:', {
      totalProcessed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      successRate: result.processed > 0 ? `${Math.round((result.succeeded / result.processed) * 100)}%` : '0%',
      totalProcessingTimeMs: processingTime
    });

    // Return summary
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Expired responses processed successfully',
        summary: {
          totalProcessed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          successRate: result.processed > 0 ? Math.round((result.succeeded / result.processed) * 100) : 0,
          processingTimeMs: processingTime
        },
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('💥 Critical error in handle-expired-responses:', {
      error: error.message || error,
      stack: error.stack,
      processingTimeMs: processingTime
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error while handling expired responses',
        message: error.message || 'Unknown error occurred',
        processingTimeMs: processingTime
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});