
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
    // Sanitize data before storage if necessary
    let sanitizedData = data;
    if (data) {
      // Deep clone and possibly clean sensitive data
      sanitizedData = JSON.parse(JSON.stringify(data));
      
      // Add timestamp for monitoring purposes
      sanitizedData._loggedAt = new Date().toISOString();
      
      // Add browser info for debugging across devices
      if (typeof navigator !== 'undefined') {
        sanitizedData._userAgent = navigator.userAgent;
      }
    }
    
    // Log to database using the browser supabase client
    await supabase.from('webhook_debug_logs').insert({
      category,
      message,
      data: sanitizedData || null
    });
  } catch (error) {
    // If we can't log to the database, at least log the error to the console
    logger.error('Failed to log debug info to database:', error);
  }
}

/**
 * Utility function to get readable filesize representation
 */
export function getReadableFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Log performance metrics for monitoring
 */
export async function logPerformanceMetrics(
  operation: string, 
  timeMs: number, 
  additionalData?: any
): Promise<void> {
  logDebug(
    'PERFORMANCE_METRIC', 
    `${operation} completed in ${timeMs.toFixed(2)}ms`, 
    {
      operation,
      timeMs,
      timestamp: Date.now(),
      ...additionalData
    }
  );
}

/**
 * Log significant system events that may require attention
 */
export async function logSystemEvent(
  eventType: 'WARNING' | 'ERROR' | 'INFO' | 'ALERT',
  message: string,
  data?: any
): Promise<void> {
  const category = `SYSTEM_${eventType}`;
  
  // Always log system events to console, even if DB logging fails
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Log to database
    await supabase.from('webhook_debug_logs').insert({
      category,
      message,
      data: data || null,
      priority: eventType === 'ERROR' || eventType === 'ALERT' ? 'high' : 'normal'
    });
  } catch (error) {
    // If we can't log to the database, ensure we have console output at least
    logger.error('Failed to log system event to database:', error, {
      category,
      message,
      data
    });
  }
}

export default logDebug;
