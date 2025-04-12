
import { supabase } from "@/integrations/supabase/client";
import logger from './logger';

/**
 * Debug logging function that logs to both console and database
 * @param category The log category (e.g., 'WEBHOOK_SAVE', 'AI_PROCESS_START')
 * @param message The log message
 * @param data Optional data to include with the log
 * @returns Promise<void>
 */
export async function logDebug(category: string, message: string, data?: any): Promise<void> {
  // Check if logging is enabled
  const enableLogs = import.meta.env.VITE_ENABLE_LOGS === 'true';
  if (!enableLogs) return;

  // Log to console
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Log to database using the browser supabase client
    await supabase.from('webhook_debug_logs').insert({
      category,
      message,
      data: data || null
    });
  } catch (error) {
    // If we can't log to the database, at least log the error to the console
    logger.error('Failed to log debug info to database:', error);
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
