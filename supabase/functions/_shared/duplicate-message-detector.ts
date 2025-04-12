
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateSimilarity } from "./text-similarity.ts";

// Create a logger for edge functions that respects configuration
const logger = {
  log: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.log(...args);
  },
  error: (...args: any[]) => {
    // Always log errors regardless of setting
    console.error(...args);
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


/**
 * Debug logging function that logs to both console and database
 * @param category The log category (e.g., 'WEBHOOK_SAVE', 'AI_PROCESS_START')
 * @param message The log message
 * @param data Optional data to include with the log
 * @returns Promise<void>
 */
async function logDebug(category: string, message: string, data?: any): Promise<void> {
  // Log to console
  logger.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  
  try {
    // Get Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Log to database
    await supabaseAdmin.from('webhook_debug_logs').insert({
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
 * Check for duplicate messages to prevent processing the same message multiple times
 * @param conversationId The ID of the conversation
 * @param newMessageContent The content of the new message to check
 * @param supabaseAdmin The Supabase admin client
 * @returns Promise<boolean> indicating whether the message is a duplicate
 */
export async function checkForDuplicateMessage(
  conversationId: string, 
  newMessageContent: string,
  supabaseAdmin: any
): Promise<boolean> {
  try {
    if (!newMessageContent) return false;
    
    // Get recent messages from the same conversation (last 5 minutes)
    const { data: recentMessages, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('content, timestamp')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')  // Only compare with user messages
      .gte('timestamp', new Date(Date.now() - 5 * 60 * 1000).toISOString())  // Last 5 minutes
      .order('timestamp', { ascending: false });
      
    if (error || !recentMessages || recentMessages.length === 0) {
      return false; // No recent messages or error, not a duplicate
    }
    
    // Simple similarity check - normalize strings and compare
    const normalizedNewContent = newMessageContent.toLowerCase().trim();
    
    for (const message of recentMessages) {
      const normalizedContent = message.content?.toLowerCase().trim() || '';
      
      // Skip if we're comparing with the exact same message
      if (normalizedContent === normalizedNewContent) {
        await logDebug('DUPLICATE_MESSAGE_DETECTED', 'Exact duplicate message detected', {
          conversationId,
          messagePreview: newMessageContent.substring(0, 50) + '...'
        });
        return true;
      }
      
      // Check for high similarity
      const similarity = calculateSimilarity(normalizedContent, normalizedNewContent);
      if (similarity > 0.9) {
        await logDebug('SIMILAR_MESSAGE_DETECTED', 'Highly similar message detected', {
          conversationId,
          messagePreview: newMessageContent.substring(0, 50) + '...',
          similarity
        });
        return true;
      }
    }
    
    return false; // Not a duplicate
  } catch (error) {
    await logDebug('DUPLICATE_CHECK_ERROR', 'Error checking for duplicate message', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false; // On error, continue with processing (fail open)
  }
}
