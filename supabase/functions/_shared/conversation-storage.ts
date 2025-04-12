
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Helper function to store message in conversation with better metadata
 * 
 * @param conversationId The ID of the conversation to store the message in
 * @param role The role of the message sender ('user' or 'assistant')
 * @param content The content of the message
 * @param messageId Optional original message ID from WhatsApp
 * @param supabaseAdmin Supabase client with admin privileges
 * @returns Promise<void>
 */
export async function storeMessageInConversation(
  conversationId: string, 
  role: 'user' | 'assistant', 
  content: string, 
  messageId?: string,
  supabaseAdmin?: any
) {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        message_id: messageId,
        metadata: {
          estimated_tokens: Math.ceil(content.length * 0.25),
          timestamp: new Date().toISOString()
        }
      });

    if (error) throw error;
    
    // Update conversation data with message count
    const { data: messageCount } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('id', { count: 'exact' })
      .eq('conversation_id', conversationId);
      
    // Update the conversation metadata
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ 
        last_activity: new Date().toISOString(),
        conversation_data: {
          context: {
            last_update: new Date().toISOString(),
            message_count: messageCount || 0,
            last_message_role: role
          }
        }
      })
      .eq('id', conversationId);
  } catch (error) {
    console.error('Error in storeMessageInConversation:', error);
    throw error;
  }
}
