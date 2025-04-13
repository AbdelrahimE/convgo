
/**
 * Simplified logging utility for the application
 * Uses a single environment variable to control all logging behavior
 */

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

  // Format message with timestamp for better tracking
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${category}] ${message}`;
  
  // Log to console with colored output for better visibility
  console.log(
    `%c${formattedMessage}`, 
    'color: #4CAF50; font-weight: bold;', 
    data ? JSON.stringify(data, null, 2) : ''
  );
  
  // Database logging is disabled on frontend to prevent 403 errors
  // Original implementation attempted to insert into webhook_debug_logs table
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
  // For errors, always log to console regardless of settings to ensure visibility
  console.error(`[WEBHOOK_ERROR] ${message}`, error);
  return logDebug('WEBHOOK_ERROR', message, { error: error?.message || String(error), stack: error?.stack });
}

export default logDebug;
