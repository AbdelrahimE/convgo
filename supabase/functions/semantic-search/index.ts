
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filterLanguage?: boolean;
  metadataFilters?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { 
      query, 
      limit = 5, 
      threshold = 0.6, 
      filterLanguage = true,
      metadataFilters = {}
    } = await req.json() as SearchRequest;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Valid query is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Processing search query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    console.log(`Search parameters: limit=${limit}, threshold=${threshold}, filterLanguage=${filterLanguage}`);
    
    // Step 1: Get query embedding from OpenAI
    console.log("Generating embedding for query...");
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
      console.error("OpenAI embedding generation failed:", errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    console.log("Successfully generated embedding vector");

    // Step 2: Detect language for filtering (if enabled)
    let languageFilter = null;
    if (filterLanguage) {
      // Call the detect_language_simple function
      const { data: languageData, error: langError } = await supabase.rpc(
        'detect_language_simple',
        { text_input: query }
      );
      
      if (!langError && languageData && languageData !== 'unknown') {
        languageFilter = languageData;
        console.log(`Detected query language: ${languageFilter}`);
      } else {
        console.log(`Language detection failed or returned 'unknown'. No language filtering will be applied.`);
      }
    }

    // Step 3: Perform vector similarity search
    console.log("Performing vector similarity search...");
    const { data: chunks, error: searchError } = await supabase.rpc(
      'match_document_chunks',
      { 
        query_embedding: queryEmbedding, 
        match_threshold: threshold,
        match_count: limit,
        filter_language: languageFilter
      }
    );

    if (searchError) {
      console.error("Vector search failed:", searchError);
      throw new Error(`Vector search error: ${searchError.message}`);
    }

    console.log(`Found ${chunks?.length || 0} matching chunks`);

    // Step 4: Apply any metadata filters
    let filteredChunks = chunks || [];
    if (Object.keys(metadataFilters).length > 0 && filteredChunks.length > 0) {
      console.log("Applying metadata filters:", metadataFilters);
      
      filteredChunks = filteredChunks.filter(chunk => {
        if (!chunk.metadata) return false;
        
        // Check if all metadata filters match
        return Object.entries(metadataFilters).every(([key, value]) => {
          // Handle case where metadata might be stored as a string
          const metadata = typeof chunk.metadata === 'string' 
            ? JSON.parse(chunk.metadata) 
            : chunk.metadata;
            
          return metadata[key] === value;
        });
      });
      
      console.log(`After metadata filtering: ${filteredChunks.length} chunks remaining`);
    }

    // Step 5: Return only chunks that meet the minimum threshold
    const thresholdedChunks = filteredChunks
      .filter(chunk => chunk.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);

    console.log(`After applying similarity threshold: ${thresholdedChunks.length} chunks remaining`);

    // Return the results
    return new Response(
      JSON.stringify({
        success: true,
        query,
        results: thresholdedChunks,
        queryEmbedding: queryEmbedding.slice(0, 5) + '...' // Only return a preview of the embedding
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in semantic-search function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
})
