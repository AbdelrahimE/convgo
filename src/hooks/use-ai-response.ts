
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface GenerateResponseOptions {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  includeConversationHistory?: boolean;
  conversationId?: string;
  imageUrl?: string;
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

interface TranscribeAudioOptions {
  audioUrl: string;
  mimeType?: string;
  instanceName?: string;
  evolutionApiKey?: string;
}

interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  language?: string;
  duration?: number;
  error?: string;
}

interface ProcessImageOptions {
  imageUrl: string;
  mimeType?: string;
  instanceName?: string;
  evolutionApiKey?: string;
  mediaKey?: string;
}

interface ProcessImageResult {
  success: boolean;
  mediaUrl?: string;
  mediaType?: string;
  error?: string;
}

interface AIUsageLimitResult {
  allowed: boolean;
  limit: number;
  used: number;
  resetsOn: string | null;
  errorMessage?: string;
}

export function useAIResponse() {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseResult, setResponseResult] = useState<AIResponseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isCleaningConversations, setIsCleaningConversations] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [aiUsageLimit, setAiUsageLimit] = useState<AIUsageLimitResult | null>(null);

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
          model: options?.model || 'gpt-4.1-mini',
          temperature: options?.temperature || 0.7,
          systemPrompt: options?.systemPrompt,
          includeConversationHistory: options?.includeConversationHistory || false,
          conversationId: options?.conversationId,
          imageUrl: options?.imageUrl,
          userId: user?.id
        },
      });

      if (error) {
        throw new Error(`Error generating response: ${error.message}`);
      }

      if (!data.success) {
        if (data.error === 'Monthly AI response limit reached') {
          setAiUsageLimit({
            allowed: false,
            limit: data.details?.limit || 0,
            used: data.details?.used || 0,
            resetsOn: data.details?.resetsOn || null,
            errorMessage: data.error
          });
          throw new Error(`AI usage limit reached: ${data.details?.used}/${data.details?.limit} responses used this month.`);
        }
        
        throw new Error(data.error || 'Failed to generate response');
      }

      if (data.aiUsage) {
        setAiUsageLimit({
          allowed: true,
          limit: data.aiUsage.limit,
          used: data.aiUsage.used,
          resetsOn: data.aiUsage.resetsOn
        });
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
      logger.error('Error generating AI response:', errMessage);
      setError(errMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const checkAIUsageLimit = async (): Promise<AIUsageLimitResult | null> => {
    try {
      logger.log('Checking AI usage limit for user:', user?.id);
      
      const { data, error } = await supabase.functions.invoke('check-ai-usage-limit', {
        body: {
          userId: user?.id
        }
      });

      if (error) {
        logger.error('Supabase function error:', error);
        throw new Error(`Error checking AI usage limit: ${error.message}`);
      }

      logger.log('AI usage limit check response:', data);
      
      if (!data || !data.success) {
        const errorMsg = data?.error || 'Failed to check AI usage limit';
        logger.error('AI usage limit check failed:', errorMsg);
        throw new Error(errorMsg);
      }

      const result = {
        allowed: data.allowed,
        limit: data.limit,
        used: data.used,
        resetsOn: data.resetsOn,
        errorMessage: data.errorMessage
      };

      logger.log('AI usage limit result:', result);
      setAiUsageLimit(result);
      return result;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Error checking AI usage limit:', errMessage);
      setError(errMessage);
      return null;
    }
  };

  const sendWhatsAppMessage = async (options: SendWhatsAppMessageOptions): Promise<boolean> => {
    try {
      setIsSendingWhatsApp(true);
      
      const { instanceName, recipientPhone, message } = options;
      
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
      logger.error('Error sending WhatsApp message:', errMessage);
      toast.error(`Failed to send WhatsApp message: ${errMessage}`);
      return false;
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const cleanupTestConversations = async (instanceId: string): Promise<CleanupTestConversationsResult> => {
    try {
      setIsCleaningConversations(true);
      
      const { data: testConversations, error: fetchError } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('instance_id', instanceId)
        .like('user_phone', 'test-user-%')
        .contains('conversation_data', { is_test: true });
      
      if (fetchError) {
        throw new Error(`Error finding test conversations: ${fetchError.message}`);
      }
      
      if (!testConversations || testConversations.length === 0) {
        return { success: true, count: 0 };
      }
      
      const conversationIds = testConversations.map(conv => conv.id);
      logger.log(`Found ${conversationIds.length} stale test conversations to clean up`);
      
      const { error: messagesDeleteError } = await supabase
        .from('whatsapp_conversation_messages')
        .delete()
        .in('conversation_id', conversationIds);
      
      if (messagesDeleteError) {
        throw new Error(`Error deleting test conversation messages: ${messagesDeleteError.message}`);
      }
      
      const { error: convsDeleteError } = await supabase
        .from('whatsapp_conversations')
        .delete()
        .in('id', conversationIds);
      
      if (convsDeleteError) {
        throw new Error(`Error deleting test conversations: ${convsDeleteError.message}`);
      }
      
      logger.log(`Successfully cleaned up ${conversationIds.length} test conversations`);
      return { 
        success: true, 
        count: conversationIds.length 
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Error cleaning up test conversations:', errMessage);
      return { 
        success: false, 
        count: 0,
        error: errMessage
      };
    } finally {
      setIsCleaningConversations(false);
    }
  };

  const transcribeAudio = async (options: TranscribeAudioOptions): Promise<TranscriptionResult> => {
    try {
      setIsTranscribing(true);
      setError(null);
      
      const { audioUrl, mimeType, instanceName, evolutionApiKey } = options;
      
      if (!audioUrl) {
        throw new Error('Audio URL is required for transcription');
      }
      
      logger.log(`Requesting transcription for audio URL: ${audioUrl.substring(0, 30)}...`);
      
      const { data, error } = await supabase.functions.invoke('whatsapp-voice-transcribe', {
        body: {
          audioUrl,
          mimeType: mimeType || 'audio/ogg; codecs=opus',
          instanceName: instanceName || 'unknown',
          evolutionApiKey
        },
      });
      
      if (error) {
        logger.error('Edge function error:', error);
        throw new Error(`Error transcribing audio: ${error.message}`);
      }
      
      if (!data || !data.success) {
        const errorMessage = data?.error || 'Failed to transcribe audio';
        logger.error('Transcription failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      toast.success('Audio transcription successful');
      logger.log('Transcription result:', data);
      
      return {
        success: true,
        transcription: data.transcription,
        language: data.language,
        duration: data.duration
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Error transcribing audio:', errMessage);
      setError(errMessage);
      
      return {
        success: false,
        error: errMessage
      };
    } finally {
      setIsTranscribing(false);
    }
  };

  const processImage = async (options: ProcessImageOptions): Promise<ProcessImageResult> => {
    try {
      setIsProcessingImage(true);
      setError(null);
      
      const { imageUrl, mimeType, instanceName, evolutionApiKey, mediaKey } = options;
      
      if (!imageUrl) {
        throw new Error('Image URL is required for processing');
      }
      
      logger.log(`Requesting image processing for URL: ${imageUrl.substring(0, 30)}...`);
      
      const { data, error } = await supabase.functions.invoke('whatsapp-image-process', {
        body: {
          imageUrl,
          mimeType: mimeType || 'image/jpeg',
          instanceName: instanceName || 'unknown',
          evolutionApiKey,
          mediaKey
        },
      });
      
      if (error) {
        logger.error('Edge function error:', error);
        throw new Error(`Error processing image: ${error.message}`);
      }
      
      if (!data || !data.success) {
        const errorMessage = data?.error || 'Failed to process image';
        logger.error('Image processing failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      toast.success('Image processed successfully');
      logger.log('Image processing result:', data);
      
      return {
        success: true,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Error processing image:', errMessage);
      setError(errMessage);
      
      return {
        success: false,
        error: errMessage
      };
    } finally {
      setIsProcessingImage(false);
    }
  };

  return {
    generateResponse,
    sendWhatsAppMessage,
    cleanupTestConversations,
    transcribeAudio,
    processImage,
    checkAIUsageLimit,
    isGenerating,
    isSendingWhatsApp,
    isCleaningConversations,
    isTranscribing,
    isProcessingImage,
    responseResult,
    error,
    aiUsageLimit
  };
}
