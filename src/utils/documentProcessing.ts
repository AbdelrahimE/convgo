import logger from '@/utils/logger';

import { 
  chunkText, 
  preprocessText, 
  createChunkMetadata,
} from './textProcessing';

/**
 * Default chunking options matching backend settings
 */
export const DEFAULT_CHUNKING_OPTIONS = {
  chunkSize: 768,
  chunkOverlap: 80
} as const;

/**
 * Interface for a text chunk with metadata
 */
export interface TextChunk {
  text: string;
  metadata: Record<string, any>;
}

/**
 * Interface for document processing result
 */
export interface ProcessingResult {
  chunks: TextChunk[];
  stats: {
    originalLength: number;
    processedLength: number;
    chunkCount: number;
    averageChunkSize: number;
  };
}

/**
 * Process a document for chunking with custom options
 */
export async function processDocumentForChunking(
  text: string,
  documentId: string,
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS
): Promise<ProcessingResult> {
  // Log options
  logger.log(`Processing document ${documentId} with options:`, options);
  
  // 1. Preprocess the text
  const processedText = preprocessText(text);
  
  // 2. Split into chunks using provided options
  const textChunks = chunkText(processedText, options);
  
  logger.log(`Created ${textChunks.length} chunks with settings:`, 
    `chunk size: ${options.chunkSize}, overlap: ${options.chunkOverlap}`);
  
  // 3. Add metadata to chunks
  // The error was here - textChunks are strings, not objects with a text property
  const chunksWithMetadata = createChunkMetadata(processedText, textChunks, documentId);
  
  // 4. Calculate stats
  const stats = {
    originalLength: text.length,
    processedLength: processedText.length,
    chunkCount: textChunks.length,
    averageChunkSize: textChunks.length > 0 
      ? Math.round(textChunks.reduce((sum, chunk) => sum + chunk.length, 0) / textChunks.length) 
      : 0
  };
  
  return {
    chunks: chunksWithMetadata,
    stats
  };
}

/**
 * Configuration options for text chunking
 */
export interface ChunkingOptions {
  /**
   * Maximum size of each chunk in characters
   * Recommended range: 256-1024 characters for embedding models
   */
  chunkSize?: number;
  
  /**
   * Amount of overlap between chunks in characters
   * Helps maintain context between chunks
   */
  chunkOverlap?: number;
}
