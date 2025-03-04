
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface LanguageInfo {
  language: string;
  direction: string;
  content: string;
  chunk_order: number;
}

export function useChunkLanguages(fileId: string | null) {
  return useQuery({
    queryKey: ['chunkLanguages', fileId],
    queryFn: async (): Promise<LanguageInfo[]> => {
      if (!fileId) return [];
      
      const { data, error } = await supabase
        .from('text_chunks')
        .select('language, direction, content, chunk_order')
        .eq('file_id', fileId)
        .order('chunk_order', { ascending: true });
      
      if (error) {
        console.error('Error fetching chunk languages:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!fileId,
  });
}
