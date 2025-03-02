
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Text processing utilities
interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  splitBySentence?: boolean;
}

// Default chunking options matching the frontend
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 768,
  chunkOverlap: 80,
  splitBySentence: true
};

/**
 * Splits text into chunks suitable for embedding models
 */
function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  // Merge provided options with defaults
  const chunkSize = options.chunkSize || DEFAULT_CHUNKING_OPTIONS.chunkSize;
  const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNKING_OPTIONS.chunkOverlap;
  const splitBySentence = options.splitBySentence !== undefined ? options.splitBySentence : DEFAULT_CHUNKING_OPTIONS.splitBySentence;

  console.log(`Chunking text with size: ${chunkSize}, overlap: ${chunkOverlap}, splitBySentence: ${splitBySentence}`);

  // Handle empty text
  if (!text || text.trim() === '') {
    return [];
  }

  // Clean the text - remove multiple spaces, normalize line breaks
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  // If text is smaller than chunk size, return it as a single chunk
  if (cleanedText.length <= chunkSize) {
    return [cleanedText];
  }

  const chunks: string[] = [];
  
  // If splitting by sentence, we'll try to respect sentence boundaries
  if (splitBySentence) {
    // Enhanced sentence splitting regex that works with Arabic and other scripts
    // This pattern looks for sentence-ending punctuation followed by a space or end of string
    const sentences = cleanedText.match(/[^.!?؟،]+[.!?؟،]+(\s|$)/g) || [cleanedText];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size, save the current chunk and start a new one
      if (currentChunk.length + sentence.length > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        
        // If the sentence itself is longer than chunk size, we need to split it
        if (sentence.length > chunkSize) {
          const sentenceChunks = splitTextBySize(sentence, chunkSize, chunkOverlap);
          chunks.push(...sentenceChunks);
          currentChunk = '';
          continue;
        }
        
        // Start a new chunk with this sentence
        currentChunk = sentence;
      } else {
        // Add sentence to current chunk
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    // Add the last chunk if there's anything left
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Simple size-based splitting without respecting semantic boundaries
    return splitTextBySize(cleanedText, chunkSize, chunkOverlap);
  }

  return chunks;
}

/**
 * Helper function to split text by size without respecting semantic boundaries
 */
function splitTextBySize(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  
  while (i < text.length) {
    // Extract chunk of text
    const chunk = text.substring(i, i + chunkSize);
    chunks.push(chunk.trim());
    
    // Move to next position, accounting for overlap
    i += (chunkSize - overlap);
  }
  
  return chunks;
}

/**
 * Preprocesses text for embedding models by cleaning and normalizing
 */
function preprocessText(text: string): string {
  if (!text) return '';
  
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove email addresses
    .replace(/\S+@\S+\.\S+/g, '')
    // Remove unsafe characters
    .replace(/[\u0000-\u001F\u007F-\u009F\u2000-\u200F\uFEFF]/g, '')
    // Keep parentheses which are common in many languages
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{Sc}\p{Emoji}]/gu, '')
    // Replace multiple punctuation (keep Arabic punctuation like ؟،)
    .replace(/([.,!?;:؟،])\1+/g, '$1')
    .trim();
}

/**
 * Creates metadata for text chunks
 */
function createChunkMetadata(
  text: string,
  chunks: string[],
  documentId: string
): Array<{ text: string; metadata: Record<string, any> }> {
  return chunks.map((chunk, index) => {
    // Calculate position of chunk in original document
    const position = text.indexOf(chunk);
    
    return {
      text: chunk,
      metadata: {
        document_id: documentId,
        chunk_index: index,
        chunk_count: chunks.length,
        position: position >= 0 ? position : undefined,
        character_count: chunk.length,
        word_count: chunk.split(/\s+/).filter(Boolean).length
      }
    };
  });
}

/**
 * Extracts text from a file using the Tika server
 */
async function extractTextFromFile(fileUrl: string, mimeType: string): Promise<string> {
  console.log(`Extracting text from file using Tika: ${fileUrl}`);
  
  try {
    // Download the file
    const fileResponse = await fetch(fileUrl);
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
    }
    
    // Get file buffer
    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Call Tika server to extract text
    const tikaUrl = 'https://tika.convgo.com/tika';
    console.log(`Calling Tika server at ${tikaUrl}`);
    
    const tikaResponse = await fetch(tikaUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Accept': 'text/plain'
      },
      body: fileBuffer
    });
    
    if (!tikaResponse.ok) {
      throw new Error(`Tika extraction failed: ${tikaResponse.status} ${tikaResponse.statusText}`);
    }
    
    // Get extracted text
    const extractedText = await tikaResponse.text();
    console.log(`Successfully extracted ${extractedText.length} characters of text`);
    
    return extractedText || 'No text content could be extracted from this file.';
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the fileId from the request
    const { fileId, chunkingSettings } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'Missing fileId parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the request with chunking settings if provided
    console.log('Text extraction request for file:', fileId);
    if (chunkingSettings) {
      console.log('With custom chunking settings:', chunkingSettings);
    } else {
      console.log('Using default chunking settings');
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file info from the database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      console.error('Error fetching file:', fileError);
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('files')
      .update({
        text_extraction_status: {
          status: 'processing',
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    // Generate a signed URL for the file
    const { data: signedUrl, error: signedUrlError } = await supabase
      .storage
      .from('files')
      .createSignedUrl(fileData.path, 60); // 60 seconds expiry

    if (signedUrlError || !signedUrl?.signedUrl) {
      console.error('Error creating signed URL:', signedUrlError);
      
      // Update file status to error
      await supabase
        .from('files')
        .update({
          text_extraction_status: {
            status: 'error',
            error: 'Failed to create signed URL for file',
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
        
      return new Response(
        JSON.stringify({ error: 'Failed to create signed URL for file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract text from file using Tika
    let extractedText;
    try {
      extractedText = await extractTextFromFile(signedUrl.signedUrl, fileData.mime_type);
    } catch (error) {
      console.error('Error in text extraction:', error);
      
      // Update file status to error
      await supabase
        .from('files')
        .update({
          text_extraction_status: {
            status: 'error',
            error: error.message,
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
        
      return new Response(
        JSON.stringify({ error: `Text extraction failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply text chunking with provided settings or default
    const chunkOptions = chunkingSettings || DEFAULT_CHUNKING_OPTIONS;
    const processedText = preprocessText(extractedText);
    const chunks = chunkText(processedText, chunkOptions);
    const chunksWithMetadata = createChunkMetadata(processedText, chunks, fileId);
    
    console.log(`Created ${chunks.length} chunks with settings:`, 
      `chunk size: ${chunkOptions.chunkSize}, overlap: ${chunkOptions.chunkOverlap}`);

    // Store chunks in the text_chunks table
    for (let i = 0; i < chunksWithMetadata.length; i++) {
      const chunk = chunksWithMetadata[i];
      const { error: chunkError } = await supabase
        .from('text_chunks')
        .insert({
          file_id: fileId,
          content: chunk.text,
          metadata: chunk.metadata,
          chunk_order: i
        });

      if (chunkError) {
        console.error('Error storing text chunk:', chunkError);
      }
    }

    // Update file with extracted text and set status to complete
    const { error: updateError } = await supabase
      .from('files')
      .update({
        text_content: extractedText,
        text_extraction_status: {
          status: 'complete',
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    if (updateError) {
      console.error('Error updating file with extracted text:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update file with extracted text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trigger language detection
    try {
      const { error: langDetectError } = await supabase.functions.invoke('detect-language', {
        body: { fileId }
      });

      if (langDetectError) {
        console.error('Error triggering language detection:', langDetectError);
        // Continue execution - language detection failure shouldn't fail the whole process
      }
    } catch (e) {
      console.error('Exception triggering language detection:', e);
      // Continue execution - language detection failure shouldn't fail the whole process
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Text extracted and chunked successfully',
        chunkCount: chunks.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
