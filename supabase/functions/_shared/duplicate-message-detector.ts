
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateSimilarity } from "./text-similarity.ts";

// Create a simple logger for edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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
        logger.info('Exact duplicate message detected', {
          conversationId,
          messagePreview: newMessageContent.substring(0, 50) + '...'
        });
        return true;
      }
      
      // Check for high similarity
      const similarity = calculateSimilarity(normalizedContent, normalizedNewContent);
      if (similarity > 0.9) {
        logger.info('Highly similar message detected', {
          conversationId,
          messagePreview: newMessageContent.substring(0, 50) + '...',
          similarity
        });
        return true;
      }
    }
    
    return false; // Not a duplicate
  } catch (error) {
    logger.error('Error checking for duplicate message', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false; // On error, continue with processing (fail open)
  }
}
