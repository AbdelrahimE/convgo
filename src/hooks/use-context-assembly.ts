
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SearchResult } from './use-semantic-search';

export interface AssembledContext {
  context: string;
  sources: {
    file_id: string;
    chunk_ids: string[];
  }[];
  stats: {
    originalChunks: number;
    assembledChunks: number;
    totalTokenEstimate: number;
  };
}

interface AssemblyOptions {
  maxContextLength?: number;
}

export function useContextAssembly() {
  const [isAssembling, setIsAssembling] = useState(false);
  const [assembledContext, setAssembledContext] = useState<AssembledContext | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const assembleContext = async (
    searchResults: SearchResult[], 
    options?: AssemblyOptions
  ) => {
    if (!searchResults?.length) {
      setError(new Error('No search results to assemble'));
      return null;
    }

    setIsAssembling(true);
    setError(null);
    
    try {
      // Call the assemble-context edge function
      const { data, error } = await supabase.functions.invoke('assemble-context', {
        body: {
          results: searchResults,
          maxContextLength: options?.maxContextLength || 8000
        }
      });
      
      if (error) {
        console.error('Error assembling context:', error);
        setError(error instanceof Error ? error : new Error('Failed to assemble context'));
        toast.error('Context assembly failed', {
          description: error.message || 'An unknown error occurred'
        });
        setAssembledContext(null);
        return null;
      }

      if (!data.success) {
        setError(new Error(data.error || 'Context assembly failed'));
        toast.error('Context assembly failed', {
          description: data.error || 'An unknown error occurred'
        });
        setAssembledContext(null);
        return null;
      }

      setAssembledContext(data.assembled);
      return data.assembled;
    } catch (err) {
      console.error('Exception during context assembly:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast.error('Context assembly error', {
        description: err instanceof Error ? err.message : 'An unknown error occurred'
      });
      setAssembledContext(null);
      return null;
    } finally {
      setIsAssembling(false);
    }
  };

  const reset = () => {
    setAssembledContext(null);
    setError(null);
  };

  return {
    assembleContext,
    reset,
    isAssembling,
    assembledContext,
    error,
    hasAssembledContext: !!assembledContext
  };
}
