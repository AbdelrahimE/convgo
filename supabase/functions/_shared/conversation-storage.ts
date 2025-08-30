
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Helper function to store message in conversation with optimized metadata
 * Uses stored procedure for atomic operation (3 queries in 1)
 * 
 * @param conversationId The ID of the conversation to store the message in
 * @param role The role of the message sender ('user' or 'assistant')
 * @param content The content of the message
 * @param messageId Optional original message ID from WhatsApp
 * @param supabaseAdmin Supabase client with admin privileges
 * @returns Promise<any> Returns data from stored procedure including message_id and message_count
 */
export async function storeMessageInConversation(
  conversationId: string, 
  role: 'user' | 'assistant', 
  content: string, 
  messageId?: string,
  supabaseAdmin?: any
) {
  try {
    // Use stored procedure for atomic operation
    const { data, error } = await supabaseAdmin.rpc('store_message_with_update', {
      p_conversation_id: conversationId,
      p_role: role,
      p_content: content,
      p_message_id: messageId
    });

    if (error) {
      console.error('Stored procedure failed:', error);
      throw error;
    }
    
    // Check if the stored procedure returned an error
    if (data && !data.success) {
      console.error('Stored procedure returned error:', data.error);
      throw new Error(data.error || 'Stored procedure failed');
    }
    
    // Return data from stored procedure
    return data;
  } catch (error) {
    console.error('Error in storeMessageInConversation:', error);
    throw error;
  }
}
