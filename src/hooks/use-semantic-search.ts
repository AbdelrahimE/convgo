
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  id: string;
  chunk_id: string;
  file_id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
  language: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filterLanguage?: boolean;
  metadataFilters?: Record<string, any>;
}

export function useSemanticSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState<string>('');

  const search = async (
    searchQuery: string,
    options: SearchOptions = {}
  ) => {
    if (!searchQuery || searchQuery.trim() === '') {
      setError(new Error('Search query cannot be empty'));
      return;
    }

    setQuery(searchQuery);
    setIsSearching(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: {
          query: searchQuery,
          limit: options.limit || 5,
          threshold: options.threshold || 0.6,
          filterLanguage: options.filterLanguage !== undefined ? options.filterLanguage : true,
          metadataFilters: options.metadataFilters || {}
        }
      });
      
      if (error) {
        console.error('Error performing semantic search:', error);
        setError(error);
        return;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to perform semantic search');
      }

      setResults(data.results);
    } catch (err) {
      console.error('Exception during semantic search:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      setIsSearching(false);
    }
  };

  const clearResults = () => {
    setResults(null);
    setError(null);
    setQuery('');
  };

  return {
    search,
    clearResults,
    isSearching,
    results,
    error,
    query,
  };
}
