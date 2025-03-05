
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SearchResult {
  id: string;
  chunk_id: string;
  file_id: string;
  content: string;
  metadata: any;
  similarity: number;
  language: string;
}

export interface SearchQueryParams {
  query: string;
  limit?: number;
  threshold?: number;
  filterLanguage?: string;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: {
    text: string;
    detectedLanguage: string | null;
  };
  meta: {
    count: number;
    threshold: number;
    limit: number;
  };
  error?: string;
}

export function useSemanticSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [queryInfo, setQueryInfo] = useState<{
    text: string;
    detectedLanguage: string | null;
  } | null>(null);
  const [meta, setMeta] = useState<{
    count: number;
    threshold: number;
    limit: number;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const search = async (params: SearchQueryParams) => {
    if (!params.query?.trim()) {
      setError(new Error('Search query is required'));
      return [];
    }

    setIsSearching(true);
    setError(null);
    
    try {
      // Call the semantic-search edge function
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: params
      });
      
      if (error) {
        console.error('Error performing semantic search:', error);
        setError(error instanceof Error ? error : new Error('Failed to perform search'));
        toast.error('Search failed', {
          description: error.message || 'An unknown error occurred'
        });
        setResults([]);
        return [];
      }

      const response = data as SearchResponse;
      
      // Check for application-level errors in the response
      if (!response.success) {
        setError(new Error(response.error || 'Search failed'));
        toast.error('Search failed', {
          description: response.error || 'An unknown error occurred'
        });
        setResults([]);
        return [];
      }

      setResults(response.results);
      setQueryInfo(response.query);
      setMeta(response.meta);
      
      return response.results;
    } catch (err) {
      console.error('Exception during semantic search:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast.error('Search error', {
        description: err instanceof Error ? err.message : 'An unknown error occurred'
      });
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  const reset = () => {
    setResults([]);
    setQueryInfo(null);
    setMeta(null);
    setError(null);
  };

  return {
    search,
    reset,
    isSearching,
    results,
    queryInfo,
    meta,
    error,
    hasResults: results.length > 0
  };
}
