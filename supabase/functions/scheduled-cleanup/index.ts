
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { cleanupDeadQueueKeys } from '../_shared/redis-queue.ts';
import { 
  monitorRedisHealth,
  cleanupExpiredLocks,
  recoverOrphanedMessages
} from '../_shared/queue-monitor.ts';

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
    
    const cleanupResults = {
      database: {
        orphanedMetadata: false,
        failedUploads: false
      },
      redis: {
        deadQueueKeys: 0,
        expiredLocks: 0,
        orphanedMessages: 0,
        healthStatus: 'unknown'
      }
    };

    // ==================== DATABASE CLEANUP ====================
    
    // Run cleanup for orphaned metadata
    const { error: orphanedCleanupError } = await supabaseClient.rpc('cleanup_orphaned_metadata');
    if (orphanedCleanupError) {
      logger.error('Error cleaning up orphaned metadata:', orphanedCleanupError);
      throw orphanedCleanupError;
    }
    cleanupResults.database.orphanedMetadata = true;
    logger.log('✅ Successfully cleaned up orphaned metadata');

    // Run cleanup for failed uploads
    const { error: failedUploadsError } = await supabaseClient.rpc('cleanup_failed_uploads');
    if (failedUploadsError) {
      logger.error('Error cleaning up failed uploads:', failedUploadsError);
      throw failedUploadsError;
    }
    cleanupResults.database.failedUploads = true;
    logger.log('✅ Successfully cleaned up failed uploads');
    
    // ==================== REDIS CLEANUP ====================
    
    logger.log('🚀 Starting Redis cleanup operations...');

    try {
      // 1. Clean up dead queue keys from active_queues
      const deadKeysCleanedUp = await cleanupDeadQueueKeys();
      cleanupResults.redis.deadQueueKeys = deadKeysCleanedUp;
      logger.log(`✅ Cleaned up ${deadKeysCleanedUp} dead queue keys`);

      // 2. Clean up expired processing locks
      const expiredLocksCleanedUp = await cleanupExpiredLocks();
      cleanupResults.redis.expiredLocks = expiredLocksCleanedUp;
      logger.log(`✅ Cleaned up ${expiredLocksCleanedUp} expired locks`);

      // 3. Recover orphaned messages (messages stuck in processing)
      const orphanedMessagesRecovered = await recoverOrphanedMessages();
      cleanupResults.redis.orphanedMessages = orphanedMessagesRecovered;
      logger.log(`✅ Recovered ${orphanedMessagesRecovered} orphaned messages`);

      // 4. Overall Redis health check
      const healthReport = await monitorRedisHealth();
      cleanupResults.redis.healthStatus = healthReport.success ? 'healthy' : 'unhealthy';
      
      if (healthReport.warnings.length > 0) {
        logger.warn('⚠️ Redis health warnings:', healthReport.warnings);
      }
      
      if (healthReport.errors.length > 0) {
        logger.error('❌ Redis health errors:', healthReport.errors);
      }
      
      logger.log(`✅ Redis health check completed - Status: ${cleanupResults.redis.healthStatus}`);
      
    } catch (redisError) {
      logger.error('💥 Error during Redis cleanup operations:', redisError);
      cleanupResults.redis.healthStatus = 'error';
      // Don't throw here - we want to continue even if Redis cleanup fails
    }

    logger.log('🎉 All cleanup operations completed successfully');

    return new Response(
      JSON.stringify({ 
        status: 'success',
        message: 'All cleanup operations completed successfully',
        results: cleanupResults,
        timestamp: new Date().toISOString()
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
