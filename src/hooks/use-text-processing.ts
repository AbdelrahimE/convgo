
import { useState } from 'react';
import {
  chunkText,
  preprocessText,
  createChunkMetadata,
  extractKeywords,
  ChunkingOptions
} from '@/utils/textProcessing';

interface TextChunk {
  text: string;
  metadata: Record<string, any>;
}

interface ProcessingResult {
  chunks: TextChunk[];
  keywords: string[];
  stats: {
    originalLength: number;
    processedLength: number;
    chunkCount: number;
    averageChunkSize: number;
    isCSV?: boolean;
    productCount?: number;
  };
}

export function useTextProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Process text document for RAG system
   * @param text The text content to process
   * @param documentId Unique identifier for the document
   * @param options Optional chunking configuration
   */
  const processDocument = async (
    text: string,
    documentId: string,
    options?: ChunkingOptions
  ): Promise<ProcessingResult> => {
    setIsProcessing(true);
    setError(null);
    
    // Adjusted defaults: using consistent 1024 chunk size to better handle product entries
    const defaultOptions = {
      chunkSize: 1024, // Standardized to 1024 consistently across the application
      chunkOverlap: 120, // Increased from 80 to provide more context between chunks
      splitBySentence: true,
      structureAware: true,
      preserveTables: true,
      cleanRedundantData: true,
      ensureHeaderInChunks: true // Explicitly set to true to include header row in each chunk
    };
    
    // Merge with provided options (if any)
    const mergedOptions = {
      ...defaultOptions,
      ...options
    };
    
    console.log("Processing document with options:", mergedOptions);
    
    try {
      // 1. Preprocess the text
      const processedText = preprocessText(text);
      
      // 2. Split into chunks using provided options (including ensureHeaderInChunks)
      const chunks = chunkText(processedText, mergedOptions);
      
      // 3. Add metadata to chunks
      const chunksWithMetadata = createChunkMetadata(processedText, chunks, documentId);
      
      // 4. Extract keywords
      const keywords = extractKeywords(processedText);
      
      // 5. Calculate stats
      // Check if any chunk has CSV metadata to determine if content is CSV
      const hasCSVMetadata = chunksWithMetadata.some(chunk => 
        chunk.metadata && chunk.metadata.is_csv === true
      );
      
      // Get product count if this is CSV product data
      const productCount = hasCSVMetadata 
        ? chunksWithMetadata.reduce((count, chunk) => 
            count + (chunk.metadata?.product_count || 0), 0)
        : undefined;
      
      const stats = {
        originalLength: text.length,
        processedLength: processedText.length,
        chunkCount: chunks.length,
        averageChunkSize: chunks.length > 0 
          ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length) 
          : 0,
        isCSV: hasCSVMetadata,
        productCount
      };
      
      console.log(`Created ${chunks.length} chunks. CSV content: ${hasCSVMetadata}`);
      if (hasCSVMetadata) {
        console.log(`Detected approximately ${productCount} products`);
      }
      
      const result = {
        chunks: chunksWithMetadata,
        keywords,
        stats
      };
      
      setResult(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unknown error occurred');
      console.error("Error processing document:", error);
      setError(error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    processDocument,
    isProcessing,
    result,
    error
  };
}
