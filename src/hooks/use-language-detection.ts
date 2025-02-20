
import { useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DetectLanguageResponse {
  chunk: {
    id: string;
    language: string;
    direction: string;
  };
  language: string;
  direction: string;
  isReliable: boolean;
}

export function useLanguageDetection() {
  const { toast } = useToast();

  const detectLanguage = useCallback(async (
    fileId: string,
    text: string,
    chunkOrder: number
  ): Promise<DetectLanguageResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke<DetectLanguageResponse>(
        'detect-language',
        {
          body: {
            fileId,
            text,
            chunkOrder
          }
        }
      );

      if (error) {
        console.error('Language detection error:', error);
        toast({
          variant: "destructive",
          title: "Error detecting language",
          description: error.message
        });
        return null;
      }

      return data;
    } catch (error: any) {
      console.error('Language detection error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to detect language. Please try again."
      });
      return null;
    }
  }, [toast]);

  return { detectLanguage };
}
