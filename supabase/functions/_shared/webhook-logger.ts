
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create a simple logger for edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Initialize Supabase admin client (this will be available in edge functions)
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  // Basic validation to help debugging
  if (!supabaseUrl) console.error('[CRITICAL] SUPABASE_URL environment variable is not set');
  if (!supabaseServiceKey) console.error('[CRITICAL] SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Debug logging function that logs to both console and database
 * @param category The log category (e.g., 'WEBHOOK_SAVE', 'AI_PROCESS_START')
 * @param message The log message
 * @param data Optional data to include with the log
 * @returns Promise<void>
 */
export async function logDebug(category: string, message: string, data?: any): Promise<void> {
  // Check if logging is enabled via environment variable
  const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
  if (!enableLogs) {
    // Even if logging is disabled, still log critical errors and connection status issues
    if (category.includes('ERROR') || category.includes('EXCEPTION') || category.includes('CONNECTION_STATUS')) {
      console.warn(`[${category}] ${message} (logging disabled but showing critical error)`);
    }
    return;
  }
  
  // Generate a timestamp to help with debugging timing issues
  const timestamp = new Date().toISOString();
  
  // Log to console with timestamp
  logger.log(`[${timestamp}] [${category}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  
  try {
    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdmin();
    
    // Log to database
    const { error } = await supabaseAdmin.from('webhook_debug_logs').insert({
      category,
      message,
      data: data || null
    });
    
    if (error) {
      // Log database insertion error to console
      logger.error(`[${timestamp}] Failed to log debug info to database:`, error);
    }
  } catch (error) {
    // If we can't log to the database, at least log the error to the console
    logger.error(`[${timestamp}] Exception logging to database:`, error);
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
