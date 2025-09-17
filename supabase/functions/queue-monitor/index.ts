import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  monitorRedisHealth, 
  cleanupExpiredLocks,
  detectOrphanedMessages,
  recoverOrphanedMessages,
  getQueueDepthStats,
  emergencyCleanup
} from '../_shared/queue-monitor.ts';

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

  try {
    const startTime = Date.now();
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'health';
    
    logger.info('🏥 Queue monitor started', {
      method: req.method,
      action,
      timestamp: new Date().toISOString()
    });

    let result: any = {};
    let statusCode = 200;

    switch (action) {
      case 'health':
        // Full health monitoring (default action)
        result = await monitorRedisHealth();
        break;

      case 'cleanup':
        // Clean up expired locks
        const cleanedLocks = await cleanupExpiredLocks();
        result = {
          success: true,
          action: 'cleanup',
          cleanedLocks,
          timestamp: new Date().toISOString()
        };
        break;

      case 'orphaned':
        // Detect and recover orphaned messages
        const orphanedMessages = await detectOrphanedMessages();
        const recoveredCount = orphanedMessages.length > 0 
          ? await recoverOrphanedMessages() 
          : 0;
        
        result = {
          success: true,
          action: 'orphaned',
          orphanedMessages: orphanedMessages.length,
          recoveredMessages: recoveredCount,
          timestamp: new Date().toISOString()
        };
        break;

      case 'stats':
        // Get queue statistics
        const stats = await getQueueDepthStats();
        result = {
          success: true,
          action: 'stats',
          stats,
          timestamp: new Date().toISOString()
        };
        break;

      case 'emergency':
        // Emergency cleanup (use with caution)
        if (req.method !== 'POST') {
          result = {
            success: false,
            error: 'Emergency cleanup requires POST method for safety'
          };
          statusCode = 405;
        } else {
          const emergencyResult = await emergencyCleanup();
          result = {
            success: emergencyResult.success,
            action: 'emergency',
            cleanedItems: emergencyResult.cleanedItems,
            errors: emergencyResult.errors,
            timestamp: new Date().toISOString()
          };
        }
        break;

      default:
        result = {
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: ['health', 'cleanup', 'orphaned', 'stats', 'emergency']
        };
        statusCode = 400;
        break;
    }
    
    const monitoringTime = Date.now() - startTime;
    
    logger.info('🏁 Queue monitor completed', {
      action,
      success: result.success,
      monitoringTime,
      statusCode
    });

    // Add monitoring time to result
    result.monitoringTime = monitoringTime;

    return new Response(
      JSON.stringify(result),
      { 
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error('💥 Fatal error in queue monitor', {
      error: error.message || error,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Queue monitor error: ${error.message || error}`,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});