import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Fixed message limit for optimal cost and performance
const DEFAULT_MESSAGE_LIMIT = 10;

/**
 * Simplified conversation history retrieval with fixed message limits
 * Optimized for cost efficiency and performance
 * 
 * @param conversationId The conversation ID to get history for
 * @param maxTokens Ignored - we use fixed message limits for cost control
 * @param supabaseAdmin Supabase admin client instance
 * @returns Array of recent conversation messages (max 10)
 */
export async function getRecentConversationHistory(
  conversationId: string, 
  maxTokens = 1000, // Parameter kept for backward compatibility but ignored
  supabaseAdmin: ReturnType<typeof createClient>
) {
  try {
    logger.debug('Fetching recent conversation history', {
      conversationId,
      messageLimit: DEFAULT_MESSAGE_LIMIT
    });

    // Direct query with fixed limit - much simpler and faster
    const { data: messages, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(DEFAULT_MESSAGE_LIMIT);

    if (error) {
      logger.error('Database error fetching conversation history:', {
        error: error.message,
        conversationId
      });
      throw error;
    }

    // Handle empty conversations
    if (!messages || messages.length === 0) {
      logger.debug('No conversation history found', { conversationId });
      return [];
    }

    // Calculate actual token usage for logging (simple estimation)
    const estimatedTokens = messages.reduce((sum, msg) => 
      sum + Math.ceil(msg.content.length * 0.25), 0);

    // Log simplified and accurate information
    logger.info(`Retrieved ${messages.length} messages from conversation ${conversationId}`, {
      messageCount: messages.length,
      messageLimit: DEFAULT_MESSAGE_LIMIT,
      estimatedTokens: estimatedTokens,
      oldestMessage: messages[messages.length - 1]?.timestamp,
      newestMessage: messages[0]?.timestamp
    });

    // Return messages in chronological order (oldest first)
    return messages.reverse();

  } catch (error) {
    logger.error('Error in getRecentConversationHistory:', {
      error: error.message || error,
      conversationId,
      stack: error.stack
    });
    
    // Return empty array on error - don't break the conversation flow
    return [];
  }
}

/**
 * Alternative function with explicit message limit control
 * For cases where you need different limits
 */
export async function getConversationHistoryWithLimit(
  conversationId: string,
  messageLimit: number,
  supabaseAdmin: ReturnType<typeof createClient>
) {
  try {
    // Enforce reasonable limits for cost control
    const safeLimit = Math.min(Math.max(messageLimit, 1), 20); // Between 1-20 messages
    
    logger.debug('Fetching conversation history with custom limit', {
      conversationId,
      requestedLimit: messageLimit,
      safeLimit
    });

    const { data: messages, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    if (!messages || messages.length === 0) {
      logger.debug('No conversation history found', { conversationId });
      return [];
    }

    const estimatedTokens = messages.reduce((sum, msg) => 
      sum + Math.ceil(msg.content.length * 0.25), 0);

    logger.info(`Retrieved ${messages.length} messages with custom limit`, {
      messageCount: messages.length,
      requestedLimit: messageLimit,
      safeLimit,
      estimatedTokens
    });

    return messages.reverse();

  } catch (error) {
    logger.error('Error in getConversationHistoryWithLimit:', {
      error: error.message || error,
      conversationId,
      messageLimit
    });
    return [];
  }
}