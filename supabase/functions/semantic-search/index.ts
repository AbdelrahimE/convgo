import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface SemanticSearchRequest {
  query: string;
  fileIds?: string[];
  limit?: number;
  threshold?: number;
  filterLanguage?: string;
  minContentLength?: number;
}

interface SearchResult {
  id: string;
  chunk_id: string;
  file_id: string;
  content: string;
  metadata: any;
  similarity: number;
  language: string;
}

interface SemanticSearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
  processingTime?: number;
}

const EMBEDDING_MODEL = 'text-embedding-3-small';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const {
      query,
      fileIds,
      limit = 5,
      threshold = 0.3,
      filterLanguage,
      minContentLength = 20
    } = await req.json() as SemanticSearchRequest;

    logger.log(`Starting semantic search for query: "${query?.substring(0, 50)}..."`);

    if (!query || typeof query !== 'string' || !query.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Query is required and must be a non-empty string'
        } as SemanticSearchResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Generate embedding for the query
    logger.log('Generating embedding for query...');
    const apiKey = getNextOpenAIKey();
    
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: query.trim(),
        model: EMBEDDING_MODEL,
        encoding_format: 'float',
      }),
    });

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json();
      logger.error('OpenAI API error:', errorData);
      throw new Error(`Failed to generate embedding: ${errorData.error?.message || 'Unknown error'}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    logger.log('Successfully generated embedding');

    // Step 2: Search for similar content using the database function
    logger.log(`Searching for similar content with threshold ${threshold}...`);
    
    const { data: matchesData, error: matchesError } = await supabase.rpc(
      'match_document_chunks_by_files',
      {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        min_content_length: minContentLength,
        filter_language: filterLanguage || null,
        file_ids: fileIds && fileIds.length > 0 ? fileIds : null
      }
    );

    if (matchesError) {
      logger.error('Database search error:', matchesError);
      throw new Error(`Database search failed: ${matchesError.message}`);
    }

    // Step 3: Transform and return results
    const results: SearchResult[] = (matchesData || []).map(item => ({
      id: item.id,
      chunk_id: item.chunk_id,
      file_id: item.file_id,
      content: item.content,
      metadata: item.metadata,
      similarity: item.similarity,
      language: item.language
    }));

    const processingTime = Date.now() - startTime;
    logger.log(`Semantic search completed in ${processingTime}ms, found ${results.length} results`);

    // Log the first result for debugging
    if (results.length > 0) {
      logger.log(`Top result similarity: ${results[0].similarity.toFixed(4)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        processingTime
      } as SemanticSearchResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error in semantic search function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      } as SemanticSearchResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});