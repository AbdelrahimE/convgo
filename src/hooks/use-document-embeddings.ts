
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import logger from '@/utils/logger';

export type EmbeddingStatus = 'pending' | 'processing' | 'complete' | 'error' | 'partial';

export interface EmbeddingStatusDetails {
  status: EmbeddingStatus;
  started_at?: string;
  completed_at?: string;
  success_count?: number;
  error_count?: number;
  last_updated?: string;
  error?: string;
}

// Helper function to safely convert JSON to EmbeddingStatusDetails
const parseEmbeddingStatus = (jsonData: Json | null): EmbeddingStatusDetails => {
  if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    return { status: 'pending' };
  }
  
  const statusObj = jsonData as Record<string, any>;
  
  return {
    status: (statusObj.status as EmbeddingStatus) || 'pending',
    started_at: typeof statusObj.started_at === 'string' ? statusObj.started_at : undefined,
    completed_at: typeof statusObj.completed_at === 'string' ? statusObj.completed_at : undefined, 
    success_count: typeof statusObj.success_count === 'number' ? statusObj.success_count : undefined,
    error_count: typeof statusObj.error_count === 'number' ? statusObj.error_count : undefined,
    last_updated: typeof statusObj.last_updated === 'string' ? statusObj.last_updated : undefined,
    error: typeof statusObj.error === 'string' ? statusObj.error : undefined
  };
};

export function useDocumentEmbeddings() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<EmbeddingStatusDetails | null>(null);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Generate embeddings for a specific file
   */
  const generateEmbeddings = async (fileId: string) => {
    if (!fileId) {
      setError(new Error('File ID is required'));
      return false;
    }

    setIsGenerating(true);
    setProgress(0);
    setError(null);
    
    try {
      // Start the progress indicator
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 5;
        });
      }, 1000);

      // Call the embedding generation edge function
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: { fileId }
      });

      clearInterval(progressInterval);
      
      if (error) {
        logger.error('Error generating embeddings:', error);
        setError(error instanceof Error ? error : new Error('Failed to generate embeddings'));
        toast.error('Failed to generate embeddings', {
          description: error.message || 'An unknown error occurred'
        });
        setProgress(0);
        return false;
      }

      // Check for application-level errors in the response
      if (data.error) {
        setError(new Error(data.error));
        toast.error('Error generating embeddings', {
          description: data.error
        });
        setProgress(0);
        return false;
      }

      setProgress(100);
      
      // Get the latest embedding status
      const { data: statusData } = await supabase
        .from('files')
        .select('embedding_status')
        .eq('id', fileId)
        .single();
      
      // Parse the embedding status using our helper function
      if (statusData?.embedding_status) {
        const embeddingStatus = parseEmbeddingStatus(statusData.embedding_status);
        setStatus(embeddingStatus);
      }
        
      if (data.success) {
        toast.success('Embeddings generated successfully', {
          description: `Processed ${data.processed} text chunks`
        });
        return true;
      } else {
        toast.error('Failed to generate all embeddings', {
          description: data.message || 'Some chunks could not be processed'
        });
        return false;
      }
    } catch (err) {
      logger.error('Exception generating embeddings:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast.error('Error generating embeddings', {
        description: err instanceof Error ? err.message : 'An unknown error occurred'
      });
      setProgress(0);
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Get the embedding status for a file
   */
  const getEmbeddingStatus = async (fileId: string) => {
    if (!fileId) return null;
    
    try {
      const { data, error } = await supabase
        .from('files')
        .select('embedding_status')
        .eq('id', fileId)
        .single();
        
      if (error) {
        logger.error('Error fetching embedding status:', error);
        return null;
      }
      
      // Parse the embedding status using our helper function
      if (data?.embedding_status) {
        const embeddingStatus = parseEmbeddingStatus(data.embedding_status);
        setStatus(embeddingStatus);
        return embeddingStatus;
      }
      
      return null;
    } catch (err) {
      logger.error('Exception fetching embedding status:', err);
      return null;
    }
  };

  return {
    generateEmbeddings,
    getEmbeddingStatus,
    isGenerating,
    progress,
    status,
    error
  };
}
