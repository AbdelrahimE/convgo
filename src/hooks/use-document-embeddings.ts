
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
        console.error('Error generating embeddings:', error);
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
      
      // Parse the embedding status from JSON to our expected type
      let embeddingStatus: EmbeddingStatusDetails;
      
      if (statusData?.embedding_status) {
        // Convert from JSON to our expected type structure
        embeddingStatus = {
          status: statusData.embedding_status.status as EmbeddingStatus || 'error',
          success_count: statusData.embedding_status.success_count,
          error_count: statusData.embedding_status.error_count,
          started_at: statusData.embedding_status.started_at,
          completed_at: statusData.embedding_status.completed_at,
          last_updated: statusData.embedding_status.last_updated,
          error: statusData.embedding_status.error
        };
      } else {
        // Fallback if data doesn't exist or has unexpected format
        embeddingStatus = {
          status: data.success ? 'complete' : 'error',
          success_count: data.processed,
          error_count: data.errors || 0
        };
      }
      
      setStatus(embeddingStatus);
        
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
      console.error('Exception generating embeddings:', err);
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
        console.error('Error fetching embedding status:', error);
        return null;
      }
      
      // Parse the embedding status from JSON to our expected type
      if (data?.embedding_status) {
        // Convert from JSON to our expected type structure
        const embeddingStatus: EmbeddingStatusDetails = {
          status: data.embedding_status.status as EmbeddingStatus || 'pending',
          success_count: data.embedding_status.success_count,
          error_count: data.embedding_status.error_count,
          started_at: data.embedding_status.started_at,
          completed_at: data.embedding_status.completed_at,
          last_updated: data.embedding_status.last_updated,
          error: data.embedding_status.error
        };
        
        setStatus(embeddingStatus);
        return embeddingStatus;
      }
      
      return null;
    } catch (err) {
      console.error('Exception fetching embedding status:', err);
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
