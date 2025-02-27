
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
    // Instead of removing non-Latin characters, only remove truly unsafe characters
    // This preserves Arabic, Chinese, Cyrillic, and other scripts
    .replace(/[\u0000-\u001F\u007F-\u009F\u2000-\u200F\uFEFF]/g, '')
    // Keep parentheses which are common in many languages
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{Sc}\p{Emoji}]/gu, '')
    // Replace multiple punctuation (keep Arabic punctuation like ؟،)
    .replace(/([.,!?;:؟،])\1+/g, '$1')
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
 * Multilingual stop words for common languages
 * These are high-frequency words that typically don't add much semantic value
 */
const STOP_WORDS: Record<string, Set<string>> = {
  english: new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
    'at', 'from', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'of', 'in',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'this', 'that',
    'these', 'those', 'am', 'on', 'your', 'my', 'its', 'me', 'him', 'her', 'us', 
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't'
  ]),
  arabic: new Set([
    // Common Arabic stop words - expanded list
    'من', 'إلى', 'عن', 'على', 'في', 'مع', 'هذا', 'هذه', 'تلك', 'ذلك',
    'أنا', 'أنت', 'هو', 'هي', 'نحن', 'أنتم', 'هم', 'كان', 'كانت', 'كانوا',
    'يكون', 'تكون', 'أو', 'و', 'ثم', 'لكن', 'إذا', 'إلا', 'حتى', 'عندما',
    'قد', 'قبل', 'بعد', 'خلال', 'مثل', 'أن', 'لا', 'ما', 'لم', 'لن',
    'كل', 'بعض', 'أي', 'التي', 'الذي', 'الذين', 'اللذان', 'اللتان', 'أحد', 'أكثر',
    'فقط', 'ليس', 'هناك', 'منذ', 'عند', 'عندها', 'حيث', 'كيف', 'لماذا', 'متى',
    
    // Additional Arabic stop words based on your examples
    'التى', 'الذى', 'فى', 'عنها', 'منها', 'تلك', 'ذلك', 'فيها', 'منه', 'له', 'إنه',
    'به', 'لها', 'إنها', 'منهم', 'لهم', 'إنهم', 'إذا', 'إن', 'ان', 'عنه',
    'هذه', 'هذا', 'تلك', 'ذلك', 'هؤلاء', 'هناك', 'هنا', 'أنت', 'انت', 'انا', 'أنا',
    'نحن', 'انتم', 'أنتم', 'انتن', 'أنتن', 'هم', 'هن', 'هما', 'هو', 'هي',
    'كان', 'كانت', 'كانوا', 'يكون', 'تكون', 'كنت', 'إلى', 'الى', 'على', 'عليه', 'عليها',
    'إليه', 'اليه', 'إليها', 'اليها', 'الي', 'إلي', 'عن', 'لي', 'لى', 'لك', 'لكم',
    'الى', 'إلى', 'في', 'فى', 'مع', 'ومع', 'علي', 'على', 'عليه', 'عليها', 'عليهم',
    'الذي', 'الذى', 'التي', 'التى', 'الذين', 'اللذان', 'اللتان',
    
    // Arabic pronouns, conjunctions, prepositions and articles
    'أنا', 'نحن', 'أنت', 'أنتِ', 'أنتما', 'أنتم', 'أنتن', 'هو', 'هي', 'هما', 'هم', 'هن',
    'إياي', 'إيانا', 'إياك', 'إياكِ', 'إياكما', 'إياكم', 'إياكن', 'إياه', 'إياها', 'إياهما', 'إياهم', 'إياهن',
    'و', 'ف', 'ثم', 'أو', 'أم', 'لكن', 'بل', 'لا', 'حتى',
    'في', 'من', 'إلى', 'على', 'عن', 'مع', 'ك', 'ل', 'ب',
    'ال', 'ذا', 'ذو', 'ذي',
    
    // Negations and question words
    'لا', 'لم', 'لن', 'ما', 'ليس', 'هل', 'أين', 'كيف', 'متى', 'لماذا', 'من', 'ماذا',
    
    // Common short verbs or forms
    'كان', 'يكون', 'صار', 'يصير', 'ظل', 'أصبح', 'أضحى', 'أمسى', 'بات', 'مازال', 'مادام',
    
    // Additional connectors
    'إذ', 'إذا', 'إن', 'أن', 'كي', 'لكي', 'لو', 'لولا', 'حتى'
  ]),
  spanish: new Set([
    'de', 'la', 'el', 'en', 'y', 'a', 'que', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
    'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o',
    'este', 'si', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también',
    'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos',
    'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto',
    'mi', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras'
  ]),
  french: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'à', 'au', 'aux', 'et', 'ou', 'en',
    'dans', 'sur', 'pour', 'par', 'ce', 'cette', 'ces', 'est', 'il', 'elle', 'ils', 'elles',
    'nous', 'vous', 'je', 'tu', 'qui', 'que', 'quoi', 'dont', 'où', 'comment', 'pourquoi',
    'quand', 'plus', 'moins', 'sans', 'avec', 'même', 'autre', 'autres', 'son', 'sa', 'ses'
  ]),
  // Add more languages as needed
};

/**
 * Detects the most likely language of a text
 * Simple implementation based on stop word frequency
 * @param text The text to analyze
 * @returns The detected language code or 'unknown'
 */
function detectLanguage(text: string): string {
  if (!text || text.trim() === '') return 'unknown';
  
  // Convert to lowercase for better matching
  const lowerText = text.toLowerCase();
  
  // Count occurrences of stop words from each language
  const langScores: Record<string, number> = {};
  
  for (const [lang, stopWords] of Object.entries(STOP_WORDS)) {
    let score = 0;
    for (const word of stopWords) {
      // Count occurrences of this stop word
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      const matches = lowerText.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    langScores[lang] = score;
  }
  
  // Find language with highest score
  let maxScore = 0;
  let detectedLang = 'unknown';
  
  for (const [lang, score] of Object.entries(langScores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }
  
  return detectedLang;
}

/**
 * Gets stop words for a specific language
 * @param lang Language code
 * @returns Set of stop words
 */
function getStopWords(lang: string): Set<string> {
  return STOP_WORDS[lang] || new Set();
}

/**
 * Extracts potential keywords/entities from text using a TF-IDF inspired approach
 * @param text - Text to analyze
 * @param maxKeywords - Maximum number of keywords to return
 * @returns Array of potential keywords
 */
export function extractKeywords(text: string, maxKeywords: number = 20): string[] {
  if (!text) return [];
  
  // Detect language to use appropriate stop words
  const detectedLang = detectLanguage(text);
  const stopWords = getStopWords(detectedLang);
  
  // Extract all words using Unicode property escapes to support all scripts
  // This matches any sequence of letters (works for all languages including Arabic)
  const words = text.match(/\p{L}+/gu) || [];
  
  // If we have very few words, return all of them (except stop words)
  if (words.length < 5) {
    return words
      .filter(word => !stopWords.has(word.toLowerCase()))
      .slice(0, maxKeywords);
  }
  
  // Calculate word frequencies (Term Frequency)
  const wordFrequency: Record<string, number> = {};
  const wordCount = words.length;
  
  words.forEach(word => {
    // Convert to lowercase for better matching (don't do this for languages where case matters differently)
    const normalized = word.toLowerCase();
    if (!stopWords.has(normalized) && normalized.length > 1) {
      wordFrequency[normalized] = (wordFrequency[normalized] || 0) + 1;
    }
  });
  
  // Calculate TF scores with a simple form of IDF-inspired weighting
  // Longer words often carry more semantic meaning in many languages
  const scores: Record<string, number> = {};
  
  Object.entries(wordFrequency).forEach(([word, freq]) => {
    // TF component (frequency in this document)
    const tf = freq / wordCount;
    
    // IDF-like component (boost longer words and penalize very common words)
    // This is a very simplified approximation without a corpus
    const lengthBoost = Math.min(1.0, word.length / 5); // Boost for longer words
    const commonnessPenalty = Math.max(0.5, 1.0 - (freq / wordCount) * 10); // Penalize very common words
    
    // Additional Arabic-specific filtering for common short prepositions and pronouns
    // Even if they're not in the stopwords list
    let totalScore = tf * lengthBoost * commonnessPenalty;
    
    // Extra penalty for single and two-letter words in Arabic (typically prepositions)
    if (detectedLang === 'arabic' && word.length <= 2) {
      totalScore *= 0.3; // Apply a strong penalty
    }
    
    // Store score if it's above a minimal threshold
    if (totalScore > 0.001) {
      scores[word] = totalScore;
    }
  });
  
  // Sort words by score and take top N
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
