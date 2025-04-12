
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read the environment variable only once when the module is loaded
const ENABLE_LOGS = Deno.env.get('ENABLE_LOGS') === 'true';

// Initialize Supabase admin client when needed (lazy initialization)
let supabaseAdmin: any = null;
const getSupabaseAdmin = () => {
  if (!supabaseAdmin) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseAdmin;
};

// Create a simple logger object with methods that respect the global setting
export const logger = {
  // Standard logging - only logs if ENABLE_LOGS is true
  log: (...args: any[]) => {
    if (ENABLE_LOGS) console.log(...args);
  },
  
  // Error logging - always logs errors by default, but can be configured
  error: (...args: any[]) => {
    if (ENABLE_LOGS) console.error(...args);
  },
  
  // Info logging
  info: (...args: any[]) => {
    if (ENABLE_LOGS) console.info(...args);
  },
  
  // Warning logging
  warn: (...args: any[]) => {
    if (ENABLE_LOGS) console.warn(...args);
  },
  
  // Debug logging
  debug: (...args: any[]) => {
    if (ENABLE_LOGS) console.debug(...args);
  }
};

/**
 * Debug logging function that logs to both console and database
 * @param category The log category (e.g., 'WEBHOOK_SAVE', 'AI_PROCESS_START')
 * @param message The log message
 * @param data Optional data to include with the log
 * @returns Promise<void>
 */
export async function logDebug(category: string, message: string, data?: any): Promise<void> {
  // Only proceed if logging is enabled
  if (!ENABLE_LOGS) return;
  
  // Log to console
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Log to database
    const supabaseAdmin = getSupabaseAdmin();
    
    await supabaseAdmin.from('webhook_debug_logs').insert({
      category,
      message,
      data: data || null
    });
  } catch (error) {
    // If we can't log to the database, log the error to console if enabled
    if (ENABLE_LOGS) {
      logger.error('Failed to log debug info to database:', error);
    }
  }
}

export default logDebug;
