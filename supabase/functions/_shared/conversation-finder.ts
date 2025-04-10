
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Find an existing conversation or create a new one
 * @param userPhone The phone number of the WhatsApp user
 * @param instanceId The WhatsApp instance ID
 * @param supabaseAdmin The Supabase admin client
 * @returns Promise<{ conversationId: string, isNew: boolean }>
 */
export async function findOrCreateConversation(
  userPhone: string,
  instanceId: string,
  supabaseAdmin: any
): Promise<{ conversationId: string; isNew: boolean }> {
  try {
    // Check for existing conversation
    const { data: existingConversation, error: queryError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('user_phone', userPhone)
      .eq('instance_id', instanceId)
      .eq('status', 'active')
      .order('last_activity', { ascending: false })
      .limit(1)
      .single();
      
    if (existingConversation && !queryError) {
      // Conversation exists, return it
      return { 
        conversationId: existingConversation.id,
        isNew: false
      };
    }
    
    // No active conversation found, create a new one
    const { data: newConversation, error: insertError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        user_phone: userPhone,
        instance_id: instanceId,
        conversation_data: {
          context: {
            created_at: new Date().toISOString(),
            last_update: new Date().toISOString()
          }
        }
      })
      .select('id')
      .single();
      
    if (insertError || !newConversation) {
      console.error('Error creating conversation:', insertError);
      throw new Error(`Failed to create conversation: ${insertError?.message || 'Unknown error'}`);
    }
    
    return {
      conversationId: newConversation.id,
      isNew: true
    };
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    throw error;
  }
}
