
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
    
    // Use updated default values (768 for chunk size, 80 for overlap)
    const defaultOptions = {
      chunkSize: 768,
      chunkOverlap: 80,
      splitBySentence: true,
      structureAware: true,
      preserveTables: true,
      cleanRedundantData: true
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
      
      // 2. Split into chunks using provided options
      const chunks = chunkText(processedText, mergedOptions);
      
      console.log(`Created ${chunks.length} chunks with settings:`, 
        `chunk size: ${mergedOptions.chunkSize}, overlap: ${mergedOptions.chunkOverlap}, preserveTables: ${mergedOptions.preserveTables}`);
      
      // 3. Add metadata to chunks
      const chunksWithMetadata = createChunkMetadata(processedText, chunks, documentId);
      
      // 4. Extract keywords
      const keywords = extractKeywords(processedText);
      
      // 5. Calculate stats
      const stats = {
        originalLength: text.length,
        processedLength: processedText.length,
        chunkCount: chunks.length,
        averageChunkSize: chunks.length > 0 
          ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length) 
          : 0
      };
      
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
