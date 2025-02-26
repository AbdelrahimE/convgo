
/**
 * Text processing utilities for RAG implementation
 * Handles document chunking and preprocessing for embeddings
 */

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
  
  /**
   * Whether to split only at sentence boundaries
   */
  splitBySentence?: boolean;
}

/**
 * Default chunking options
 */
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 512,
  chunkOverlap: 50,
  splitBySentence: true
};

/**
 * Splits text into chunks suitable for embedding models
 * @param text - Full document text to be chunked
 * @param options - Chunking configuration options
 * @returns Array of text chunks
 */
export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  // Merge provided options with defaults
  const { chunkSize, chunkOverlap, splitBySentence } = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options
  };

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
    // Simple sentence splitting - can be improved with more complex regex
    const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];
    
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
        currentChunk += ' ' + sentence;
      }
    }
    
    // Add the last chunk if there's anything left
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Simple size-based splitting without respecting sentence boundaries
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
 * @param text - Text to preprocess
 * @returns Cleaned and normalized text
 */
export function preprocessText(text: string): string {
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
    // Remove special characters except punctuation needed for sentence boundaries
    .replace(/[^\w\s.,!?;:]/g, '')
    // Replace multiple punctuation
    .replace(/([.,!?;:])\1+/g, '$1')
    .trim();
}

/**
 * Creates metadata for text chunks
 * @param text - Original text
 * @param chunks - Array of text chunks
 * @param documentId - ID of the parent document
 * @returns Array of chunk objects with metadata
 */
export function createChunkMetadata(
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
 * Extracts potential keywords/entities from text
 * Simple implementation - for production, consider NLP libraries
 * @param text - Text to analyze
 * @returns Array of potential keywords
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Remove common stop words (simplified list)
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
    'at', 'from', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'of', 'in',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'this', 'that',
    'these', 'those', 'am', 'on', 'your', 'my', 'its'
  ]);
  
  // Extract words, convert to lowercase, filter out stop words and short words
  const words = text
    .toLowerCase()
    .match(/\b[a-z\d]{3,}\b/g) || [];
  
  const filteredWords = words
    .filter(word => !stopWords.has(word));
  
  // Count frequency of each word
  const wordFrequency: Record<string, number> = {};
  filteredWords.forEach(word => {
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });
  
  // Convert to array, sort by frequency, and take top 20
  return Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
