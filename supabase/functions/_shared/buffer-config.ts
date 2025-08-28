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
 * Check if message buffering is enabled globally and for specific instance
 */
export async function isBufferingEnabledForInstance(
  instanceId: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ enabled: boolean; reason: string }> {
  try {
    // First check global environment variable
    const globalBufferingEnabled = Deno.env.get('ENABLE_MESSAGE_BUFFERING') === 'true';
    
    if (!globalBufferingEnabled) {
      return { 
        enabled: false, 
        reason: 'Global message buffering disabled (ENABLE_MESSAGE_BUFFERING != true)' 
      };
    }

    // Check if Redis is available
    const redisAvailable = await isBufferingAvailable();
    if (!redisAvailable) {
      return { 
        enabled: false, 
        reason: 'Redis/Upstash not available or misconfigured' 
      };
    }

    // Check per-instance configuration
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('enable_message_buffering, is_active')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .maybeSingle();

    if (aiConfigError) {
      logger.error('Error checking instance buffering config:', aiConfigError);
      return { 
        enabled: false, 
        reason: 'Error checking instance configuration' 
      };
    }

    if (!aiConfig) {
      return { 
        enabled: false, 
        reason: 'AI not configured or not active for this instance' 
      };
    }

    if (!aiConfig.enable_message_buffering) {
      return { 
        enabled: false, 
        reason: 'Message buffering disabled for this instance' 
      };
    }

    logger.info('Message buffering enabled for instance', {
      instanceId,
      globalEnabled: globalBufferingEnabled,
      instanceEnabled: aiConfig.enable_message_buffering,
      redisAvailable
    });

    return { enabled: true, reason: 'Buffering enabled and available' };
  } catch (error) {
    logger.error('Error checking buffering configuration:', error);
    return { 
      enabled: false, 
      reason: 'Exception checking buffering configuration' 
    };
  }
}

/**
 * Simple helper to check if buffering should be used
 */
export async function shouldUseBuffering(
  instanceName: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<boolean> {
  try {
    // Get instance ID first
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError || !instanceData) {
      logger.warn('Instance not found for buffering check', { instanceName });
      return false;
    }

    const { enabled } = await isBufferingEnabledForInstance(instanceData.id, supabaseAdmin);
    return enabled;
  } catch (error) {
    logger.error('Error in shouldUseBuffering:', error);
    return false;
  }
}