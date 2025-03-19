
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
      // Use our new generate-query-embedding function specifically for search queries
      const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-query-embedding', {
        body: { text: options.query }
      });
      
      if (embeddingError) {
        throw embeddingError;
      }
      
      if (!embeddingData.success || !embeddingData.embedding) {
        console.log('No embedding generated, returning empty results');
        return [];
      }
      
      // Now use the embedding to search for similar content using the match_document_chunks_by_files database function
      const { data: matchesData, error: matchesError } = await supabase.rpc(
        'match_document_chunks_by_files',
        {
          query_embedding: embeddingData.embedding,
          match_threshold: 0.5,
          match_count: options.limit || 5,
          min_content_length: 20,
          file_ids: options.fileIds
        }
      );
      
      if (matchesError) {
        throw matchesError;
      }
      
      // Transform results to match the expected SearchResult format
      const searchResults = (matchesData || []).map(item => ({
        file_id: item.file_id,
        content: item.content,
        similarity: item.similarity
      }));
      
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
