import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddingStatusDetails } from './use-document-embeddings';
import logger from '@/utils/logger';
import { Json } from '@/integrations/supabase/types';

export interface FileWithMetadata {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  path: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
  embedding_status?: EmbeddingStatusDetails;
  primary_language?: string;
  language_confidence?: any;
  language_detection_status?: any;
  detected_languages?: string[];
  text_extraction_status?: any;
  text_content?: string;
}

// Helper function to parse embedding status (exported for use in real-time subscriptions)
// Always returns a valid EmbeddingStatusDetails object for safety
export const parseEmbeddingStatus = (jsonData: Json | null): EmbeddingStatusDetails => {
  if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    return { status: 'pending' };
  }
  const statusObj = jsonData as Record<string, any>;
  return {
    status: statusObj.status || 'pending',
    started_at: typeof statusObj.started_at === 'string' ? statusObj.started_at : undefined,
    completed_at: typeof statusObj.completed_at === 'string' ? statusObj.completed_at : undefined,
    success_count: typeof statusObj.success_count === 'number' ? statusObj.success_count : undefined,
    error_count: typeof statusObj.error_count === 'number' ? statusObj.error_count : undefined,
    last_updated: typeof statusObj.last_updated === 'string' ? statusObj.last_updated : undefined,
    error: typeof statusObj.error === 'string' ? statusObj.error : undefined
  };
};

// Custom hook for fetching files with React Query and pagination
export function useFilesQuery(page: number = 0, pageSize: number = 20) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['files', user?.id, page, pageSize],
    queryFn: async (): Promise<FileWithMetadata[]> => {
      if (!user?.id) return [];
      
      const offset = page * pageSize;
      
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select(`
          id,
          filename,
          original_name,
          mime_type,
          size_bytes,
          path,
          profile_id,
          created_at,
          updated_at,
          embedding_status,
          primary_language,
          language_confidence,
          detected_languages,
          language_detection_status,
          text_extraction_status
        `)
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filesError) {
        logger.error("Error fetching files:", filesError);
        throw filesError;
      }

      // Transform data with metadata
      const filesWithMetadata: FileWithMetadata[] = (filesData || []).map(file => ({
        ...file,
        primary_language: file.primary_language || 'unknown',
        language_confidence: file.language_confidence || {},
        detected_languages: file.detected_languages || [],
        language_detection_status: file.language_detection_status || { status: 'pending' },
        text_extraction_status: file.text_extraction_status || { status: 'pending' },
        embedding_status: parseEmbeddingStatus(file.embedding_status)
      }));

      return filesWithMetadata;
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
    keepPreviousData: true, // Keep previous page data while loading new page
  });
}

// Hook for getting total file count for pagination
export function useFilesCountQuery() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['files-count', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user?.id) return 0;
      
      const { count, error } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', user.id);

      if (error) {
        logger.error("Error fetching file count:", error);
        throw error;
      }

      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Hook for deleting files with cache invalidation
export function useDeleteFileMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);
      
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate all files queries for this user (all pages) and count query
      queryClient.invalidateQueries({ queryKey: ['files', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['files-count', user?.id] });
    },
    onError: (error: any) => {
      logger.error("Error deleting file:", error);
    }
  });
}