
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create a simple logger for edge functions
const logger = {
  log: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.log(...args);
  },
  error: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    // Only log errors if explicitly enabled - this is different from before
    if (enableLogs) console.error(...args);
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

// Initialize Supabase admin client (this will be available in edge functions)
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
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
  // Check if logging is enabled - only proceed if explicitly set to 'true'
  const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
  if (!enableLogs) return;
  
  // Log to console - we already checked enableLogs above
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // ONLY log to database if logging is enabled
    if (enableLogs) {
      // Get Supabase admin client
      const supabaseAdmin = getSupabaseAdmin();
      
      // Log to database
      await supabaseAdmin.from('webhook_debug_logs').insert({
        category,
        message,
        data: data || null
      });
    }
  } catch (error) {
    // If we can't log to the database, log the error to console if enabled
    if (enableLogs) {
      logger.error('Failed to log debug info to database:', error);
    }
  }
}

export default logDebug;
