
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.2";

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const openAIApiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

// Constants
const OPENAI_EMBEDDINGS_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100; // Maximum number of texts to embed in a single request
const MAX_RETRIES = 3;
const DELAY_MS = 1000;

// Create Supabase client with the service role key for admin access to the database
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to wait between retries
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate embeddings for text using OpenAI API
 */
async function generateEmbeddings(texts: string[], retryCount = 0): Promise<number[][] | null> {
  try {
    console.log(`Generating embeddings for ${texts.length} text chunks`);
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDINGS_MODEL,
        input: texts,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      
      // Handle rate limiting with retries
      if (response.status === 429 && retryCount < MAX_RETRIES) {
        console.log(`Rate limited, retrying after delay (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(DELAY_MS * Math.pow(2, retryCount));
        return generateEmbeddings(texts, retryCount + 1);
      }
      
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`);
    }

    const result = await response.json();
    return result.data.map((item: any) => item.embedding);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    
    // Retry on network errors
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying after error (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(DELAY_MS * Math.pow(2, retryCount));
      return generateEmbeddings(texts, retryCount + 1);
    }
    
    return null;
  }
}

/**
 * Process text chunks and generate embeddings for a file
 */
async function processFileChunks(fileId: string) {
  try {
    console.log(`Processing chunks for file: ${fileId}`);
    
    // Get all text chunks for this file that don't have embeddings yet
    const { data: chunks, error: chunksError } = await supabase
      .from('text_chunks')
      .select('id, content')
      .eq('file_id', fileId)
      .order('chunk_order', { ascending: true });
    
    if (chunksError) {
      throw new Error(`Failed to fetch text chunks: ${chunksError.message}`);
    }
    
    console.log(`Found ${chunks.length} chunks to process`);
    
    if (chunks.length === 0) {
      return { success: true, processed: 0, message: "No chunks found to process" };
    }
    
    // Check existing embeddings to avoid duplicates
    const { data: existingEmbeddings, error: embeddingsError } = await supabase
      .from('document_embeddings')
      .select('chunk_id')
      .eq('file_id', fileId);
      
    if (embeddingsError) {
      throw new Error(`Failed to check existing embeddings: ${embeddingsError.message}`);
    }
    
    // Filter out chunks that already have embeddings
    const existingChunkIds = new Set(existingEmbeddings?.map(e => e.chunk_id) || []);
    const chunksToProcess = chunks.filter(chunk => !existingChunkIds.has(chunk.id));
    
    console.log(`${chunksToProcess.length} chunks need embeddings (${existingChunkIds.size} already processed)`);
    
    if (chunksToProcess.length === 0) {
      return { success: true, processed: 0, message: "All chunks already have embeddings" };
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process in batches to avoid rate limits and memory issues
    for (let i = 0; i < chunksToProcess.length; i += MAX_BATCH_SIZE) {
      const batch = chunksToProcess.slice(i, i + MAX_BATCH_SIZE);
      console.log(`Processing batch ${i/MAX_BATCH_SIZE + 1} with ${batch.length} chunks`);
      
      const texts = batch.map(chunk => chunk.content);
      const embeddings = await generateEmbeddings(texts);
      
      if (!embeddings) {
        console.error(`Failed to generate embeddings for batch starting at index ${i}`);
        errorCount += batch.length;
        continue;
      }
      
      // Prepare embeddings for database insertion
      const embeddingsData = batch.map((chunk, index) => ({
        file_id: fileId,
        chunk_id: chunk.id,
        embedding: embeddings[index],
        model_version: OPENAI_EMBEDDINGS_MODEL,
        status: 'complete',
        metadata: { 
          chunk_index: i + index,
          embedding_dimensions: embeddings[index].length,
          timestamp: new Date().toISOString()
        }
      }));
      
      // Insert embeddings into database
      const { error: insertError } = await supabase
        .from('document_embeddings')
        .insert(embeddingsData);
      
      if (insertError) {
        console.error(`Failed to insert embeddings: ${insertError.message}`);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
        console.log(`Successfully inserted ${batch.length} embeddings`);
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (i + MAX_BATCH_SIZE < chunksToProcess.length) {
        await sleep(500);
      }
    }
    
    // Update the file record to mark embedding generation as complete
    const { error: updateError } = await supabase
      .from('files')
      .update({ 
        embedding_status: {
          status: errorCount > 0 ? 'partial' : 'complete',
          success_count: successCount,
          error_count: errorCount,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);
    
    if (updateError) {
      console.error(`Failed to update file embedding status: ${updateError.message}`);
    }
    
    return {
      success: successCount > 0,
      processed: successCount,
      errors: errorCount,
      message: `Processed ${successCount} chunks with ${errorCount} errors`
    };
  } catch (error) {
    console.error('Error processing file chunks:', error);
    return { success: false, processed: 0, error: error.message };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing fileId parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Update file status to show embedding generation is in progress
    const { error: updateError } = await supabase
      .from('files')
      .update({ 
        embedding_status: {
          status: 'processing',
          started_at: new Date().toISOString()
        }
      })
      .eq('id', fileId);
    
    if (updateError) {
      console.error(`Failed to update file status: ${updateError.message}`);
    }
    
    // Process the file and generate embeddings
    // This could be wrapped in waitUntil() for long files
    const result = await processFileChunks(fileId);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-embeddings function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
