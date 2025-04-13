
import { supabase } from "@/integrations/supabase/client";
import logger from './logger';
import { isLoggingEnabled } from '@/lib/utils';

/**
 * Debug logging function that logs only to console
 * @param category The log category (e.g., 'WEBHOOK_SAVE', 'AI_PROCESS_START')
 * @param message The log message
 * @param data Optional data to include with the log
 * @returns Promise<void>
 */
export async function logDebug(category: string, message: string, data?: any): Promise<void> {
  // Check if logging is enabled
  const enableLogs = isLoggingEnabled();
  if (!enableLogs) return;

  // Log to console
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Also log to database if we're not in the browser
    if (typeof window === 'undefined') {
      await supabase.from('webhook_debug_logs').insert({
        category,
        message,
        data: data || null
      });
    }
  } catch (error) {
    // Silently fail if database logging fails
    logger.error('Failed to log to database:', error);
  }
}

/**
 * Log a message related to webhook processing
 * @param message The log message
 * @param data Optional data to include with the log
 */
export function logWebhook(message: string, data?: any): Promise<void> {
  return logDebug('WEBHOOK_REQUEST', message, data);
}

/**
 * Log an error related to webhook processing
 * @param message The error message
 * @param error The error object
 */
export function logWebhookError(message: string, error: any): Promise<void> {
  return logDebug('WEBHOOK_ERROR', message, { error: error?.message || String(error), stack: error?.stack });
}

export default logDebug;
