
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type OpenAITestResult = {
  success: boolean;
  message: string;
  response?: string;
  model?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export function useOpenAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<OpenAITestResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const testConnection = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('openai-test-connection');
      
      if (error) {
        console.error('Error testing OpenAI connection:', error);
        setError(error);
        return;
      }

      setResult(data as OpenAITestResult);
    } catch (err) {
      console.error('Exception while testing OpenAI connection:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    testConnection,
    isLoading,
    result,
    error,
    isSuccess: result?.success === true,
    isError: !!error || result?.success === false,
  };
}
