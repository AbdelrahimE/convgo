
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'
import { corsHeaders } from '../_shared/cors.ts'

// Define the type for chunking settings
interface ChunkingSettings {
  chunkSize: number;
  chunkOverlap: number;
  splitBySentence?: boolean;
}

// Default settings to fall back on if none are provided
const DEFAULT_CHUNKING_SETTINGS: ChunkingSettings = {
  chunkSize: 768,
  chunkOverlap: 80,
  splitBySentence: true
}

console.log('Loading extract-text function')

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get request body
    const body = await req.json()
    const { fileId, chunkingSettings } = body

    console.log(`Received request to extract text from file ID: ${fileId}`)
    console.log(`Chunking settings received:`, chunkingSettings)

    // Validate input
    if (!fileId) {
      throw new Error('Missing required parameter: fileId')
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get file information from database
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !fileData) {
      throw new Error(`Failed to fetch file data: ${fileError?.message || 'File not found'}`)
    }

    // Get file content from storage
    const { data: fileContent, error: storageError } = await supabaseAdmin
      .storage
      .from('files')
      .download(fileData.path)

    if (storageError || !fileContent) {
      throw new Error(`Failed to download file: ${storageError?.message || 'No content found'}`)
    }

    // Process file text based on mime type
    let extractedText = ''
    
    // Handle different file types
    if (fileData.mime_type.includes('text/')) {
      // Plain text files
      extractedText = await fileContent.text()
    } else if (
      fileData.mime_type.includes('application/pdf') ||
      fileData.mime_type.includes('application/msword') ||
      fileData.mime_type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ) {
      // For PDF, DOC, and DOCX, we're using a simple text extraction here
      // In a production environment, you would use specific libraries for these formats
      extractedText = await fileContent.text()
    } else {
      throw new Error(`Unsupported file type: ${fileData.mime_type}`)
    }

    // Merge provided chunking settings with defaults
    const finalChunkingSettings: ChunkingSettings = {
      ...DEFAULT_CHUNKING_SETTINGS,
      ...chunkingSettings
    }

    console.log(`Applying chunking settings: chunkSize=${finalChunkingSettings.chunkSize}, overlap=${finalChunkingSettings.chunkOverlap}`)

    // Process the text by calling another Edge Function or sending to a text processing service
    // For this example, we'll simulate text chunking and store the chunks
    
    // Simple chunking function (in production, use a more sophisticated approach)
    const chunks = await processAndChunkText(extractedText, finalChunkingSettings)
    
    console.log(`Created ${chunks.length} chunks from text`)

    // Store chunks in the database
    for (const [index, chunk] of chunks.entries()) {
      const { error: chunkError } = await supabaseAdmin
        .from('text_chunks')
        .insert({
          file_id: fileId,
          content: chunk,
          sequence: index,
          chunk_metadata: {
            chunkSize: finalChunkingSettings.chunkSize,
            chunkOverlap: finalChunkingSettings.chunkOverlap,
            chunkNumber: index + 1,
            totalChunks: chunks.length
          }
        })

      if (chunkError) {
        console.error(`Error storing chunk ${index}:`, chunkError)
      }
    }

    // Update the file record to mark it as processed
    const { error: updateError } = await supabaseAdmin
      .from('files')
      .update({ status: 'processed', chunks_count: chunks.length })
      .eq('id', fileId)

    if (updateError) {
      throw new Error(`Failed to update file status: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Text extraction completed',
        chunks_count: chunks.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in extract-text function:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/**
 * Process and chunk text based on specified settings
 */
async function processAndChunkText(text: string, settings: ChunkingSettings): Promise<string[]> {
  console.log('Processing text with settings:', settings)
  
  if (!text || text.trim() === '') {
    return []
  }

  const { chunkSize, chunkOverlap } = settings
  
  // Basic preprocessing - normalize whitespace
  const preprocessedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
  
  const chunks: string[] = []
  let currentPosition = 0
  
  while (currentPosition < preprocessedText.length) {
    // Calculate end position for this chunk
    const endPosition = Math.min(
      currentPosition + chunkSize,
      preprocessedText.length
    )
    
    // Extract the chunk text
    const chunkText = preprocessedText.substring(currentPosition, endPosition)
    chunks.push(chunkText)
    
    // Move position forward, accounting for overlap
    currentPosition = endPosition - chunkOverlap
    
    // Ensure we make progress and don't get stuck
    if (currentPosition <= 0) {
      currentPosition = endPosition
    }
  }
  
  console.log(`Created ${chunks.length} chunks with size=${chunkSize}, overlap=${chunkOverlap}`)
  
  return chunks
}
