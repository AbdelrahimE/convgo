
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SearchResult {
  file_id: string;
  content: string;
  similarity: number;
}

interface SearchOptions {
  query: string;
  fileIds: string[];
  limit?: number;
}

export function useSimpleSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const search = async (options: SearchOptions): Promise<SearchResult[]> => {
    if (!options.query.trim() || !options.fileIds || options.fileIds.length === 0) {
      return [];
    }

    setIsSearching(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('match-document-chunks', {
        body: {
          query: options.query,
          file_ids: options.fileIds,
          limit: options.limit || 5
        }
      });
      
      if (error) {
        throw error;
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      const searchResults = data.matches || [];
      setResults(searchResults);
      return searchResults;
    } catch (err) {
      console.error('Error performing search:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  return {
    search,
    isSearching,
    results,
    error
  };
}
