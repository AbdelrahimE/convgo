
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
   */
  const processDocument = async (
    text: string,
    documentId: string,
    options?: ChunkingOptions
  ): Promise<ProcessingResult> => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // 1. Preprocess the text
      const processedText = preprocessText(text);
      
      // 2. Split into chunks
      const chunks = chunkText(processedText, options);
      
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
