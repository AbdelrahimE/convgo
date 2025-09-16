import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isBufferingAvailable } from './message-buffer.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * UPDATED: Buffering is now MANDATORY - only fails if Redis is completely unavailable
 * No longer checks AI configuration - buffering is required regardless
 */
export async function isBufferingEnabledForInstance(
  instanceId: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ enabled: boolean; reason: string }> {
  try {
    // ONLY check if Redis is available - this is the only hard requirement
    const redisAvailable = await isBufferingAvailable();
    if (!redisAvailable) {
      logger.error('🚨 CRITICAL: Redis/Upstash not available - buffering system down', {
        instanceId
      });
      return { 
        enabled: false, 
        reason: 'CRITICAL: Redis/Upstash not available - system cannot process messages' 
      };
    }

    logger.info('✅ MANDATORY buffering system available for instance', {
      instanceId,
      redisAvailable,
      note: 'Buffering is now mandatory for all messages'
    });

    // Buffering is mandatory and Redis is available
    return { enabled: true, reason: 'Mandatory buffering system available' };
    
  } catch (error) {
    logger.error('🚨 CRITICAL: Exception in buffering system check:', error);
    return { 
      enabled: false, 
      reason: `CRITICAL: System error - ${error.message || 'Unknown exception'}` 
    };
  }
}

/**
 * DEPRECATED: Buffering is now MANDATORY for all instances
 * This function is kept for compatibility but always returns true
 */
export async function shouldUseBuffering(
  instanceName: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<boolean> {
  logger.info('⚠️ DEPRECATED: shouldUseBuffering called - buffering is now MANDATORY', {
    instanceName,
    note: 'All messages must go through buffering system'
  });
  
  // Buffering is now mandatory - always return true
  return true;
}