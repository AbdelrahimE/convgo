import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { corsHeaders } from '../_shared/cors.ts'
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface RequestBody {
  fileId: string;
}

interface ChunkData {
  id: string;
  content: string;
  metadata?: any;
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileId } = await req.json() as RequestBody;

    if (!fileId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'fileId is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    await supabase
      .from('files')
      .update({
        embedding_status: {
          status: 'processing',
          started_at: new Date().toISOString(),
          error: null
        }
      })
      .eq('id', fileId);

    const { data: chunks, error: chunksError } = await supabase
      .from('text_chunks')
      .select('id, content, metadata')
      .eq('file_id', fileId)
      .order('chunk_order', { ascending: true });

    if (chunksError) {
      throw new Error(`Error fetching text chunks: ${chunksError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      await supabase
        .from('files')
        .update({
          embedding_status: {
            status: 'error',
            error: 'No text chunks found for this file',
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No text chunks found for this file' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    let processedCount = 0;
    let errorCount = 0;
    
    const batchSize = 20;
    const totalBatches = Math.ceil(chunks.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min((batchIndex + 1) * batchSize, chunks.length);
      const batchChunks = chunks.slice(batchStart, batchEnd);
      
      const batchPromises = batchChunks.map(async (chunk: ChunkData) => {
        try {
          const apiKey = getNextOpenAIKey();
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: chunk.content,
              model: EMBEDDING_MODEL,
              encoding_format: 'float',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
          }

          const data = await response.json();
          const embedding = data.data[0].embedding;

          const { error: insertError } = await supabase
            .from('document_embeddings')
            .insert({
              file_id: fileId,
              chunk_id: chunk.id,
              embedding: JSON.stringify(embedding),
              model_version: EMBEDDING_MODEL,
              status: 'complete',
              metadata: chunk.metadata
            });

          if (insertError) {
            throw new Error(`Error storing embedding: ${insertError.message}`);
          }

          processedCount++;
          return { success: true, chunkId: chunk.id };
        } catch (error) {
          logger.error(`Error processing chunk ${chunk.id}:`, error);
          errorCount++;
          
          await supabase
            .from('document_embeddings')
            .insert({
              file_id: fileId,
              chunk_id: chunk.id,
              status: 'error',
              model_version: EMBEDDING_MODEL,
              error_details: { 
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
              }
            });
            
          return { success: false, chunkId: chunk.id, error };
        }
      });
      
      await Promise.all(batchPromises);
      
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const finalStatus = errorCount === 0 ? 'complete' : 
                         processedCount > 0 ? 'partial' : 'error';
                         
    await supabase
      .from('files')
      .update({
        embedding_status: {
          status: finalStatus,
          completed_at: new Date().toISOString(),
          success_count: processedCount,
          error_count: errorCount,
          last_updated: new Date().toISOString(),
          error: errorCount > 0 ? `Failed to process ${errorCount} chunks` : null
        }
      })
      .eq('id', fileId);

    return new Response(
      JSON.stringify({
        success: finalStatus !== 'error',
        status: finalStatus,
        processed: processedCount,
        errors: errorCount,
        message: errorCount > 0 ? `Failed to process ${errorCount} chunks` : 'All chunks processed successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in generate-embeddings function:', error);
    
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
