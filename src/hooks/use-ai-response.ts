
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GenerateResponseOptions {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  includeConversationHistory?: boolean;
  conversationId?: string;
}

interface AIResponseResult {
  answer: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tokenUsage: {
    context: {
      conversation: number;
      rag: number;
      total: number;
    };
    completion: number;
    total: number;
  };
  conversationId?: string;
}

interface SendWhatsAppMessageOptions {
  instanceName: string;
  recipientPhone: string;
  message: string;
}

interface CleanupTestConversationsResult {
  success: boolean;
  count: number;
  error?: string;
}

export function useAIResponse() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseResult, setResponseResult] = useState<AIResponseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isCleaningConversations, setIsCleaningConversations] = useState(false);

  const generateResponse = async (
    query: string,
    context: string,
    options?: GenerateResponseOptions
  ): Promise<AIResponseResult | null> => {
    try {
      setIsGenerating(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: {
          query,
          context,
          model: options?.model || 'gpt-4o-mini',
          temperature: options?.temperature || 0.7,
          systemPrompt: options?.systemPrompt,
          includeConversationHistory: options?.includeConversationHistory || false,
          conversationId: options?.conversationId
        },
      });

      if (error) {
        throw new Error(`Error generating response: ${error.message}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate response');
      }

      const result: AIResponseResult = {
        answer: data.answer,
        model: data.model,
        usage: data.usage,
        tokenUsage: data.tokenUsage,
        conversationId: data.conversationId
      };

      setResponseResult(result);
      return result;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error generating AI response:', errMessage);
      setError(errMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const sendWhatsAppMessage = async (options: SendWhatsAppMessageOptions): Promise<boolean> => {
    try {
      setIsSendingWhatsApp(true);
      
      const { instanceName, recipientPhone, message } = options;
      
      // Call the Edge Function to send a WhatsApp message
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          instanceName,
          phone: recipientPhone,
          message
        }
      });
      
      if (error) {
        throw new Error(`Error sending WhatsApp message: ${error.message}`);
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to send WhatsApp message');
      }
      
      toast.success('WhatsApp message sent successfully');
      return true;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error sending WhatsApp message:', errMessage);
      toast.error(`Failed to send WhatsApp message: ${errMessage}`);
      return false;
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const cleanupTestConversations = async (instanceId: string): Promise<CleanupTestConversationsResult> => {
    try {
      setIsCleaningConversations(true);
      
      // Identify test conversations by looking for user_phone starting with 'test-user-' 
      // and having is_test:true in conversation_data
      const { data: testConversations, error: fetchError } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('instance_id', instanceId)
        .like('user_phone', 'test-user-%')  // Use like with wildcard to match all test users
        .contains('conversation_data', { is_test: true });
      
      if (fetchError) {
        throw new Error(`Error finding test conversations: ${fetchError.message}`);
      }
      
      if (!testConversations || testConversations.length === 0) {
        return { success: true, count: 0 };
      }
      
      const conversationIds = testConversations.map(conv => conv.id);
      console.log(`Found ${conversationIds.length} stale test conversations to clean up`);
      
      // Delete all messages from these conversations
      const { error: messagesDeleteError } = await supabase
        .from('whatsapp_conversation_messages')
        .delete()
        .in('conversation_id', conversationIds);
      
      if (messagesDeleteError) {
        throw new Error(`Error deleting test conversation messages: ${messagesDeleteError.message}`);
      }
      
      // Now delete the conversations themselves
      const { error: convsDeleteError } = await supabase
        .from('whatsapp_conversations')
        .delete()
        .in('id', conversationIds);
      
      if (convsDeleteError) {
        throw new Error(`Error deleting test conversations: ${convsDeleteError.message}`);
      }
      
      console.log(`Successfully cleaned up ${conversationIds.length} test conversations`);
      return { 
        success: true, 
        count: conversationIds.length 
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error cleaning up test conversations:', errMessage);
      return { 
        success: false, 
        count: 0,
        error: errMessage
      };
    } finally {
      setIsCleaningConversations(false);
    }
  };

  return {
    generateResponse,
    sendWhatsAppMessage,
    cleanupTestConversations,
    isGenerating,
    isSendingWhatsApp,
    isCleaningConversations,
    responseResult,
    error,
  };
}
