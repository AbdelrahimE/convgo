
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import OpenAI from 'https://esm.sh/openai@4.11.1'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const openAIKey = Deno.env.get('OPENAI_API_KEY') || ''

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openAIKey
})

// Initialize Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const EMBEDDING_MODEL = 'text-embedding-3-small'

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { fileId } = await req.json()

    if (!fileId) {
      return new Response(
        JSON.stringify({
          error: 'File ID is required',
          success: false,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Update file status to processing
    await supabase
      .from('files')
      .update({
        embedding_status: {
          status: 'processing',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        },
      })
      .eq('id', fileId)

    // Get all text chunks for the file
    const { data: chunks, error: chunksError } = await supabase
      .from('text_chunks')
      .select('id, content')
      .eq('file_id', fileId)
      .order('chunk_order', { ascending: true })

    if (chunksError || !chunks || chunks.length === 0) {
      await updateFileStatus(fileId, 'error', 'No text chunks found for file')
      return new Response(
        JSON.stringify({
          error: 'No text chunks found',
          success: false,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    console.log(`Found ${chunks.length} text chunks for file ${fileId}`)

    // Process chunks and create embeddings
    let successCount = 0
    let errorCount = 0
    const errors = []

    for (const chunk of chunks) {
      try {
        // Skip empty content
        if (!chunk.content || chunk.content.trim() === '') {
          console.log(`Skipping empty chunk ${chunk.id}`)
          continue
        }

        // Generate embedding with OpenAI
        const embeddingResponse = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: chunk.content,
          encoding_format: 'float'
        })

        // Extract the embedding vector
        const embedding = embeddingResponse.data[0].embedding

        // Store the embedding in the database
        const { error: insertError } = await supabase
          .from('document_embeddings')
          .upsert({
            file_id: fileId,
            chunk_id: chunk.id,
            embedding,
            model_version: EMBEDDING_MODEL,
            status: 'complete',
            metadata: { 
              dimensions: embedding.length,
              processed_at: new Date().toISOString() 
            }
          })

        if (insertError) {
          console.error(`Error inserting embedding for chunk ${chunk.id}:`, insertError)
          errorCount++
          errors.push({ chunk_id: chunk.id, error: insertError.message })
        } else {
          successCount++
        }
      } catch (err) {
        console.error(`Error processing chunk ${chunk.id}:`, err)
        errorCount++
        errors.push({ 
          chunk_id: chunk.id, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        })
      }
    }

    // Update file status based on processing results
    let status: 'complete' | 'partial' | 'error' = 'complete'
    if (successCount === 0) {
      status = 'error'
    } else if (errorCount > 0) {
      status = 'partial'
    }

    await updateFileStatus(fileId, status, null, successCount, errorCount)

    return new Response(
      JSON.stringify({
        success: status !== 'error',
        processed: successCount,
        errors: errorCount,
        message: status === 'partial' ? 'Some chunks failed to process' : 'All chunks processed successfully',
        details: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in generate-embeddings function:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function updateFileStatus(
  fileId: string, 
  status: 'processing' | 'complete' | 'error' | 'partial',
  error?: string | null,
  successCount: number = 0,
  errorCount: number = 0
) {
  const statusUpdate: any = {
    status,
    last_updated: new Date().toISOString(),
  }

  if (status === 'complete' || status === 'partial' || status === 'error') {
    statusUpdate.completed_at = new Date().toISOString()
  }

  if (error) {
    statusUpdate.error = error
  }

  if (successCount > 0) {
    statusUpdate.success_count = successCount
  }

  if (errorCount > 0) {
    statusUpdate.error_count = errorCount
  }

  await supabase
    .from('files')
    .update({
      embedding_status: statusUpdate,
    })
    .eq('id', fileId)
}
