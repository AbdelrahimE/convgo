
import { useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logger from '@/utils/logger';

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
        logger.error('Language detection error:', error);
        toast.error("Error detecting language", {
          description: error.message
        });
        return null;
      }

      return data;
    } catch (error: any) {
      logger.error('Language detection error:', error);
      toast.error("Error", {
        description: "Failed to detect language. Please try again."
      });
      return null;
    }
  }, []);

  return { detectLanguage };
}
