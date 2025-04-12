
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
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
