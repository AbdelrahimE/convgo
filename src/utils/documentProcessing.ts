
import { chunkText, preprocessText, createChunkMetadata } from './textProcessing';

/**
 * Type definition for chunking options
 */
export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  splitBySentence?: boolean;
}

/**
 * Default chunking options matching backend settings
 */
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 768,
  chunkOverlap: 80,
  splitBySentence: true
};

/**
 * Process a document for chunking with custom options
 */
export async function processDocumentForChunking(
  text: string,
  documentId: string,
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS
) {
  // Log options
  console.log(`Processing document ${documentId} with options:`, options);
  
  // 1. Preprocess the text
  const processedText = preprocessText(text);
  
  // 2. Split into chunks using provided options
  const chunks = chunkText(processedText, options);
  
  console.log(`Created ${chunks.length} chunks with settings:`, 
    `chunk size: ${options.chunkSize}, overlap: ${options.chunkOverlap}`);
  
  // 3. Add metadata to chunks
  const chunksWithMetadata = createChunkMetadata(processedText, chunks, documentId);
  
  return {
    chunks: chunksWithMetadata,
    stats: {
      originalLength: text.length,
      processedLength: processedText.length,
      chunkCount: chunks.length,
      averageChunkSize: chunks.length > 0 
        ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length) 
        : 0
    }
  };
}
