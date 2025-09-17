import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { processAllQueues, initializeProcessor } from '../_shared/queue-processor.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Initialize Supabase credentials
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize the processor
initializeProcessor(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    logger.info('🚀 Queue processor started', {
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });

    // Only allow POST requests for processing
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed - use POST' 
        }),
        { 
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Process all active queues
    const processingReport = await processAllQueues();
    
    const processingTime = Date.now() - startTime;
    
    logger.info('🏁 Queue processor completed', {
      success: processingReport.success,
      processedQueues: processingReport.processedQueues,
      processedMessages: processingReport.processedMessages,
      failedQueues: processingReport.failedQueues.length,
      errors: processingReport.errors.length,
      totalProcessingTime: processingTime
    });

    // Return processing report
    return new Response(
      JSON.stringify({
        success: processingReport.success,
        timestamp: new Date().toISOString(),
        processingTime,
        report: processingReport
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error('💥 Fatal error in queue processor', {
      error: error.message || error,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Queue processor error: ${error.message || error}`,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});