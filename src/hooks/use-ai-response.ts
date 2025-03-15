
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GenerateResponseOptions {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

interface ResponseResult {
  answer: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function useAIResponse() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseResult, setResponseResult] = useState<ResponseResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const generateResponse = async (
    query: string,
    context: string,
    options?: GenerateResponseOptions
  ) => {
    if (!query) {
      setError(new Error('Query is required'));
      return null;
    }

    setIsGenerating(true);
    setError(null);
    
    try {
      // Call the generate-response edge function
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: {
          query,
          context,
          model: options?.model || 'gpt-4o-mini',
          temperature: options?.temperature || 0.3,
          systemPrompt: options?.systemPrompt
        }
      });
      
      if (error) {
        console.error('Error generating AI response:', error);
        setError(error instanceof Error ? error : new Error('Failed to generate response'));
        toast.error('Response generation failed', {
          description: error.message || 'An unknown error occurred'
        });
        setResponseResult(null);
        return null;
      }

      if (!data.success) {
        setError(new Error(data.error || 'Response generation failed'));
        toast.error('Response generation failed', {
          description: data.error || 'An unknown error occurred'
        });
        setResponseResult(null);
        return null;
      }

      setResponseResult(data);
      return data;
    } catch (err) {
      console.error('Exception during response generation:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast.error('Response generation error', {
        description: err instanceof Error ? err.message : 'An unknown error occurred'
      });
      setResponseResult(null);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setResponseResult(null);
    setError(null);
  };

  return {
    generateResponse,
    reset,
    isGenerating,
    responseResult,
    error,
    hasResponse: !!responseResult
  };
}
