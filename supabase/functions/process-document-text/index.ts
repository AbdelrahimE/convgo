
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const CHUNK_SIZE = 1000; // Target size for each chunk in characters
const CHUNK_OVERLAP = 200; // Overlap between chunks to maintain context
const MAX_CHUNKS_PER_FILE = 100; // Safety limit for very large files

interface ChunkResult {
  chunks: string[];
  totalChunks: number;
  averageChunkSize: number;
  metadata: {
    originalSize: number;
    processedSize: number;
    processingTime: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get the Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { fileId } = await req.json();

    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'File ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing document with file ID: ${fileId}`);

    // Fetch the file content from the database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('id, text_content, original_name, mime_type, size_bytes')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file:', fileError);
      return new Response(
        JSON.stringify({ error: 'File not found or error fetching file data' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!fileData.text_content) {
      console.error('No text content available for file');
      return new Response(
        JSON.stringify({ error: 'No text content available for processing' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Process the document text
    console.log(`Starting text processing for ${fileData.original_name}`);
    const startTime = performance.now();
    
    // Pre-process text: normalize whitespace, remove excessive newlines, etc.
    const processedText = preProcessText(fileData.text_content);
    
    // Chunk the text
    const chunkResult = chunkText(processedText, CHUNK_SIZE, CHUNK_OVERLAP);
    
    const processingTime = performance.now() - startTime;
    console.log(`Text processing completed in ${processingTime.toFixed(2)}ms. Generated ${chunkResult.chunks.length} chunks.`);

    // Store the chunks in the database
    await storeTextChunks(supabase, fileId, chunkResult.chunks);

    // Update the file status
    await updateFileProcessingStatus(supabase, fileId, 'processed', chunkResult.totalChunks);

    return new Response(
      JSON.stringify({
        success: true,
        fileId,
        stats: {
          chunks: chunkResult.totalChunks,
          averageChunkSize: chunkResult.averageChunkSize,
          processingTime: processingTime.toFixed(2),
          originalSize: fileData.text_content.length,
          processedSize: processedText.length,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in process-document-text function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Pre-process text to normalize and clean it before chunking
 */
function preProcessText(text: string): string {
  // Step 1: Normalize whitespace
  let processed = text.replace(/\s+/g, ' ');
  
  // Step 2: Remove excessive punctuation repetition
  processed = processed.replace(/([.,!?;:]){3,}/g, '$1');
  
  // Step 3: Fix common encoding issues
  processed = processed
    .replace(/â€™/g, "'") // Fix apostrophes
    .replace(/â€œ|â€/g, '"') // Fix quotes
    .replace(/â€"|â€"/g, '-') // Fix dashes
    
  // Step 4: Preserve paragraph breaks but remove excessive newlines
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Step 5: Trim leading/trailing whitespace
  processed = processed.trim();
  
  return processed;
}

/**
 * Chunk text into manageable pieces for processing
 */
function chunkText(text: string, targetSize: number, overlap: number): ChunkResult {
  const chunks: string[] = [];
  let currentPos = 0;
  
  // Safety check for extremely large files
  const totalLength = text.length;
  
  if (totalLength === 0) {
    return {
      chunks: [],
      totalChunks: 0,
      averageChunkSize: 0,
      metadata: {
        originalSize: 0,
        processedSize: 0,
        processingTime: 0,
      }
    };
  }
  
  // Use paragraphs and sentences as natural breaking points
  while (currentPos < totalLength && chunks.length < MAX_CHUNKS_PER_FILE) {
    // Determine the end of this chunk (target size or end of text)
    let chunkEnd = Math.min(currentPos + targetSize, totalLength);
    
    // Don't break in the middle of a paragraph if possible
    if (chunkEnd < totalLength) {
      // Look for paragraph breaks first (they're the most natural)
      const nextParagraph = text.indexOf('\n\n', chunkEnd - 50);
      if (nextParagraph !== -1 && nextParagraph < chunkEnd + 200) {
        chunkEnd = nextParagraph;
      } else {
        // Then try to break at sentence boundaries
        const nextSentence = findNextSentenceBoundary(text, chunkEnd);
        if (nextSentence !== -1 && nextSentence < chunkEnd + 100) {
          chunkEnd = nextSentence;
        } else {
          // If nothing else, break at the next space
          const nextSpace = text.indexOf(' ', chunkEnd);
          if (nextSpace !== -1 && nextSpace < chunkEnd + 20) {
            chunkEnd = nextSpace;
          }
        }
      }
    }
    
    // Extract the chunk and add to our list
    const chunk = text.substring(currentPos, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move position for next chunk, accounting for overlap
    currentPos = chunkEnd - overlap;
    // Ensure we're making forward progress even if no good break point was found
    if (currentPos <= 0 || currentPos >= chunkEnd) {
      currentPos = chunkEnd;
    }
  }
  
  // Calculate average chunk size
  const totalChunks = chunks.length;
  const averageChunkSize = totalChunks > 0
    ? chunks.reduce((sum, chunk) => sum + chunk.length, 0) / totalChunks
    : 0;
  
  return {
    chunks,
    totalChunks,
    averageChunkSize,
    metadata: {
      originalSize: text.length,
      processedSize: text.length,
      processingTime: 0 // This will be filled in by the calling code
    }
  };
}

/**
 * Find the next sentence boundary after a given position
 */
function findNextSentenceBoundary(text: string, startPos: number): number {
  // Look for common sentence ending patterns
  const sentenceEndPatterns = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  
  let closestEnd = -1;
  
  for (const pattern of sentenceEndPatterns) {
    const endPos = text.indexOf(pattern, startPos - 5);
    if (endPos !== -1 && (closestEnd === -1 || endPos < closestEnd)) {
      // Add the length of the pattern, so we include the punctuation
      closestEnd = endPos + pattern.length;
    }
  }
  
  return closestEnd;
}

/**
 * Store processed text chunks in the database
 */
async function storeTextChunks(supabase: any, fileId: string, chunks: string[]) {
  console.log(`Storing ${chunks.length} text chunks for file ${fileId}`);
  
  // Delete any existing chunks for this file first
  await supabase
    .from('text_chunks')
    .delete()
    .eq('file_id', fileId);
  
  // Insert new chunks
  const chunkRecords = chunks.map((content, index) => ({
    file_id: fileId,
    content,
    chunk_order: index + 1,
    metadata: {
      chunkIndex: index,
      totalChunks: chunks.length,
      chunkLength: content.length
    }
  }));
  
  // Split into batches if we have a lot of chunks (to avoid payload size limits)
  const BATCH_SIZE = 20;
  for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
    const batch = chunkRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('text_chunks')
      .insert(batch);
    
    if (error) {
      console.error(`Error storing text chunks (batch ${i}-${i+BATCH_SIZE}):`, error);
      throw error;
    }
  }
  
  console.log(`Successfully stored all text chunks for file ${fileId}`);
}

/**
 * Update the file's processing status
 */
async function updateFileProcessingStatus(
  supabase: any, 
  fileId: string, 
  status: 'processing' | 'processed' | 'error',
  totalChunks?: number
) {
  const updateData: any = {
    text_extraction_status: {
      status,
      last_updated: new Date().toISOString(),
      error: status === 'error' ? 'Error processing text' : null
    }
  };
  
  if (totalChunks !== undefined) {
    updateData.text_extraction_status.chunks_count = totalChunks;
  }
  
  const { error } = await supabase
    .from('files')
    .update(updateData)
    .eq('id', fileId);
  
  if (error) {
    console.error('Error updating file processing status:', error);
  }
}
