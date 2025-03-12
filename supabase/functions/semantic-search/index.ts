
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filterLanguage?: string;
  fileIds?: string[];
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const EMBEDDING_MODEL = 'text-embedding-3-small';

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse and validate request body
    const requestBody = await req.json().catch((error) => {
      console.error('Error parsing request body:', error);
      throw new Error('Invalid request body format');
    });

    const { query, limit = 5, threshold = 0.7, filterLanguage, fileIds } = requestBody as SearchRequest;

    if (!query) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Query is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Processing query: "${query}" (limit: ${limit}, threshold: ${threshold}, language: ${filterLanguage || 'any'}, fileIds: ${fileIds ? fileIds.join(',') : 'all'})`);

    // Generate embedding for the query using OpenAI API
    let embeddingData;
    try {
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: query,
          model: EMBEDDING_MODEL,
          encoding_format: 'float',
        }),
      });

      if (!embeddingResponse.ok) {
        const errorData = await embeddingResponse.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown OpenAI API error'}`);
      }

      embeddingData = await embeddingResponse.json();
    } catch (error) {
      console.error('Error generating embeddings:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to generate embeddings',
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    const queryEmbedding = embeddingData.data[0].embedding;

    // Build RPC parameters
    const rpcParams: Record<string, any> = {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      min_content_length: 20,
      filter_language: filterLanguage || null
    };

    // Add file IDs to filter if provided
    if (fileIds && fileIds.length > 0) {
      rpcParams.file_ids = fileIds;
    }

    // Execute SQL function to find similar chunks with optional file filtering
    let matchingChunks;
    try {
      const { data, error: matchError } = await supabase.rpc(
        fileIds && fileIds.length > 0 ? 'match_document_chunks_by_files' : 'match_document_chunks',
        rpcParams
      );

      if (matchError) {
        throw new Error(`Error searching for matching chunks: ${matchError.message}`);
      }

      matchingChunks = data;
    } catch (error) {
      console.error('Database query error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to search database',
          details: error instanceof Error ? error.message : 'Unknown database error'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    // Get language of the query for potential filtering
    let queryLanguage = null;
    if (!filterLanguage) {
      try {
        const { data: languageData, error: langError } = await supabase.rpc(
          'detect_language_simple',
          { text_input: query }
        );

        if (langError) {
          console.warn('Language detection failed:', langError);
        } else {
          queryLanguage = languageData;
          console.log(`Detected query language: ${queryLanguage}`);
        }
      } catch (langError) {
        console.warn("Error detecting query language:", langError);
        // Don't fail the whole request if language detection fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: matchingChunks || [],
        query: {
          text: query,
          detectedLanguage: queryLanguage
        },
        meta: {
          count: matchingChunks?.length || 0,
          threshold,
          limit
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Unhandled error in semantic-search function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
