
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    logger.log('Starting scheduled cleanup operations...');

    // Run cleanup for orphaned metadata
    const { error: orphanedCleanupError } = await supabaseClient.rpc('cleanup_orphaned_metadata');
    if (orphanedCleanupError) {
      logger.error('Error cleaning up orphaned metadata:', orphanedCleanupError);
      throw orphanedCleanupError;
    }
    logger.log('Successfully cleaned up orphaned metadata');

    // Run cleanup for failed uploads
    const { error: failedUploadsError } = await supabaseClient.rpc('cleanup_failed_uploads');
    if (failedUploadsError) {
      logger.error('Error cleaning up failed uploads:', failedUploadsError);
      throw failedUploadsError;
    }
    logger.log('Successfully cleaned up failed uploads');

    return new Response(
      JSON.stringify({ 
        status: 'success',
        message: 'Cleanup operations completed successfully'
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error('Error during cleanup operations:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error.message
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
