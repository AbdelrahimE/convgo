
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
  console.log("=== Semantic Search Function Started ===");
  console.log(`Request method: ${req.method}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log("Attempting to parse request body");
    // Parse and validate request body
    const requestBody = await req.json().catch((error) => {
      console.error('Error parsing request body:', error);
      throw new Error('Invalid request body format');
    });

    const { query, limit = 5, threshold = 0.7, filterLanguage, fileIds } = requestBody as SearchRequest;

    if (!query) {
      console.error('Missing required field: query');
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
    console.log(`OPENAI_API_KEY available: ${!!OPENAI_API_KEY}`);
    console.log(`Supabase URL available: ${!!supabaseUrl}`);
    console.log(`Supabase key available: ${!!supabaseKey}`);

    // Generate embedding for the query using OpenAI API
    let embeddingData;
    try {
      console.log("Calling OpenAI API to generate embeddings");
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

      console.log(`OpenAI API response status: ${embeddingResponse.status}`);
      
      if (!embeddingResponse.ok) {
        const errorText = await embeddingResponse.text();
        console.error('OpenAI API error response:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.error('Failed to parse OpenAI error response as JSON:', parseError);
          errorData = { error: { message: errorText } };
        }
        
        throw new Error(`OpenAI API error (${embeddingResponse.status}): ${errorData.error?.message || errorText || 'Unknown OpenAI API error'}`);
      }

      embeddingData = await embeddingResponse.json();
      console.log("Successfully received embedding data from OpenAI");
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
    console.log(`Embedding vector generated with length: ${queryEmbedding.length}`);

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
      console.log(`Filtering by ${fileIds.length} file IDs`);
    }

    // Execute SQL function to find similar chunks with optional file filtering
    let matchingChunks;
    try {
      const rpcFunction = fileIds && fileIds.length > 0 ? 'match_document_chunks_by_files' : 'match_document_chunks';
      console.log(`Calling Supabase RPC function: ${rpcFunction}`);
      
      const { data, error: matchError } = await supabase.rpc(
        rpcFunction,
        rpcParams
      );

      if (matchError) {
        console.error(`Database RPC error for ${rpcFunction}:`, matchError);
        throw new Error(`Error searching for matching chunks: ${matchError.message}`);
      }

      matchingChunks = data;
      console.log(`Found ${matchingChunks?.length || 0} matching chunks`);
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
        console.log("Attempting to detect query language");
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

    console.log("Preparing final response");
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
    console.error('Error stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
