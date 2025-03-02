
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
  chunkSize: 768,  // Updated from 512 to 768
  chunkOverlap: 80, // Updated from 50 to 80
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
 * Comprehensive list of Arabic stopwords and function words
 * This expanded list covers prepositions, pronouns, conjunctions, etc.
 */
const ARABIC_STOPWORDS = new Set([
  // Core prepositions
  'في', 'من', 'إلى', 'على', 'عن', 'مع', 'ب', 'ل', 'ك',
  // Variations of prepositions
  'فى', 'الى', 'علي', 'الي', 'إلي',
  // Combined prepositions with suffixes
  'فيه', 'فيها', 'منه', 'منها', 'إليه', 'إليها', 'عليه', 'عليها',
  'معه', 'معها', 'به', 'بها', 'له', 'لها', 'لك', 'لي', 'لنا', 'لهم', 'لكم',
  'عنه', 'عنها', 'منه', 'منها',
  // Conjunctions
  'و', 'أو', 'ثم', 'ف', 'أم', 'لكن', 'بل', 'حتى', 'إذ', 'إذا', 'إن', 'أن',
  // Pronouns
  'هو', 'هي', 'هم', 'هن', 'هما', 'أنت', 'أنتم', 'أنتن', 'أنا', 'نحن',
  'انت', 'انتم', 'انتن', 'انا',
  // Demonstratives
  'هذا', 'هذه', 'ذلك', 'تلك', 'هؤلاء', 'أولئك', 'هنا', 'هناك',
  // Relative pronouns
  'الذي', 'التي', 'الذين', 'اللذان', 'اللتان', 'اللواتي', 'اللائي',
  'الذى', 'التى',
  // Question words
  'من', 'ما', 'ماذا', 'أين', 'متى', 'كيف', 'لماذا', 'هل',
  // Verbal particles
  'قد', 'لقد', 'لم', 'لن', 'لا', 'ما', 'ليس',
  // Common verbs (to be, to have, etc.)
  'كان', 'كانت', 'كانوا', 'يكون', 'تكون', 'كنت', 'أصبح', 'صار', 'ليس',
  // Articles
  'ال',
  // Other function words
  'كل', 'بعض', 'غير', 'سوى', 'أي', 'جميع', 'عدة', 'خلال', 'ضمن', 'عبر',
  'قبل', 'بعد', 'تحت', 'فوق', 'بين', 'أمام', 'خلف', 'حول', 'دون', 'سوف',
  // Words specifically from your screenshots
  'أن', 'إن', 'ان', 'على', 'في', 'من', 'إلى', 'لك', 'علي',
  // Additional variations
  'انه', 'إنه', 'انها', 'إنها', 'انهم', 'إنهم'
]);

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
  arabic: ARABIC_STOPWORDS,
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
  
  // For Arabic text, we want to be extra certain
  if (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/)) {
    detectedLang = 'arabic';
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
 * Checks if a word is an Arabic function word that should be excluded from keywords
 * Uses multiple methods for reliable detection
 * @param word The word to check
 * @returns True if it's an Arabic function word to exclude
 */
function isArabicFunctionWord(word: string): boolean {
  if (!word) return false;
  
  // Normalize the word (remove diacritics, standardize alef/ya forms)
  const normalizedWord = word.normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, ''); // Remove Arabic diacritics
  
  // 1. Direct check against our comprehensive stopword list
  if (ARABIC_STOPWORDS.has(normalizedWord)) {
    return true;
  }
  
  // 2. Check for very short words (most meaningful Arabic words are 3+ letters)
  if (normalizedWord.length <= 2) {
    return true;
  }
  
  // 3. Check for common Arabic prefixes (و, ف, ب, ل, ال, etc.)
  // If removing the prefix makes it a stopword, it's likely a function word
  if (normalizedWord.startsWith('و') || 
      normalizedWord.startsWith('ف') || 
      normalizedWord.startsWith('ب') || 
      normalizedWord.startsWith('ل') || 
      normalizedWord.startsWith('ال')) {
    
    // Try removing the prefix and check if result is a stopword
    let withoutPrefix = normalizedWord;
    
    if (normalizedWord.startsWith('ال')) {
      withoutPrefix = normalizedWord.substring(2);
    } else if (normalizedWord.startsWith('و') || 
               normalizedWord.startsWith('ف') || 
               normalizedWord.startsWith('ب') || 
               normalizedWord.startsWith('ل')) {
      withoutPrefix = normalizedWord.substring(1);
    }
    
    // If the word without prefix is a stopword, the original is also a function word
    if (ARABIC_STOPWORDS.has(withoutPrefix) || withoutPrefix.length <= 2) {
      return true;
    }
  }
  
  // 4. Check for common preposition + pronoun combinations
  // These are patterns like "فيه" (in it), "له" (for him), etc.
  const prepositionPronounPattern = /^(في|من|إلى|على|عن|مع|ب|ل|ك)(ه|ها|هم|هن|ك|كم|كن|ي|نا)$/;
  if (prepositionPronounPattern.test(normalizedWord)) {
    return true;
  }
  
  return false;
}

/**
 * Patterns for Arabic Named Entity Recognition
 */
const ARABIC_NER_PATTERNS = {
  // Common titles and honorifics that often precede names
  personTitles: new Set([
    'الشيخ', 'الإمام', 'السلطان', 'الملك', 'الأمير', 'الرسول',
    'النبي', 'العلامة', 'القاضي', 'الدكتور', 'المهندس'
  ]),
  
  // Common place indicators
  locationIndicators: new Set([
    'مدينة', 'بلاد', 'دولة', 'مملكة', 'جمهورية', 'منطقة',
    'جبل', 'وادي', 'نهر', 'بحر', 'خليج', 'جزيرة'
  ]),
  
  // Organization indicators
  organizationIndicators: new Set([
    'جامعة', 'مؤسسة', 'شركة', 'مركز', 'معهد', 'وزارة',
    'هيئة', 'مجلس', 'جمعية', 'منظمة'
  ])
};

/**
 * Patterns for English Named Entity Recognition
 */
const ENGLISH_NER_PATTERNS = {
  // Common titles and honorifics that often precede names
  personTitles: new Set([
    'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sir', 'Lady', 'Lord', 'President',
    'King', 'Queen', 'Prince', 'Princess', 'Captain', 'General', 'Senator'
  ]),
  
  // Common place indicators
  locationIndicators: new Set([
    'City', 'State', 'Country', 'Street', 'Avenue', 'Boulevard', 'Road',
    'Mountain', 'Lake', 'River', 'Ocean', 'Sea', 'Island', 'Gulf', 
    'North', 'South', 'East', 'West', 'Downtown', 'Uptown'
  ]),
  
  // Organization indicators
  organizationIndicators: new Set([
    'Company', 'Corporation', 'Inc', 'Ltd', 'LLC', 'Organization',
    'University', 'College', 'School', 'Institute', 'Agency', 'Department',
    'Ministry', 'Association', 'Foundation', 'Society', 'Council', 'Committee'
  ])
};

/**
 * Patterns for French Named Entity Recognition
 */
const FRENCH_NER_PATTERNS = {
  // Common titles and honorifics that often precede names
  personTitles: new Set([
    'M', 'Mme', 'Mlle', 'Dr', 'Prof', 'Docteur', 'Professeur', 'Président',
    'Roi', 'Reine', 'Prince', 'Princesse', 'Capitaine', 'Général', 'Sénateur'
  ]),
  
  // Common place indicators
  locationIndicators: new Set([
    'Ville', 'État', 'Pays', 'Rue', 'Avenue', 'Boulevard', 'Route',
    'Montagne', 'Lac', 'Rivière', 'Océan', 'Mer', 'Île', 'Golfe',
    'Nord', 'Sud', 'Est', 'Ouest', 'Centre-ville'
  ]),
  
  // Organization indicators
  organizationIndicators: new Set([
    'Société', 'Entreprise', 'SARL', 'SA', 'Organisation',
    'Université', 'Collège', 'École', 'Institut', 'Agence', 'Département',
    'Ministère', 'Association', 'Fondation', 'Conseil', 'Comité'
  ])
};

/**
 * Calculates TF-IDF score for a word in the current document context
 * @param word The word to score
 * @param frequency Word frequency in current document
 * @param totalWords Total words in document
 * @param documentsWithWord Number of documents containing this word (estimated)
 * @param totalDocuments Total number of documents in corpus (estimated)
 */
function calculateTfIdf(
  word: string,
  frequency: number,
  totalWords: number,
  documentsWithWord: number = 1,
  totalDocuments: number = 2
): number {
  // Term Frequency (TF) = frequency of word / total words in document
  const tf = frequency / totalWords;
  
  // Inverse Document Frequency (IDF) = log(total documents / documents containing word)
  const idf = Math.log(totalDocuments / Math.max(1, documentsWithWord));
  
  return tf * idf;
}

/**
 * Detects if a word might be a named entity in Arabic
 * @param word The word to check
 * @param context The surrounding words (for pattern matching)
 */
function detectArabicNamedEntity(word: string, context: string[] = []): {
  isEntity: boolean;
  type?: 'person' | 'location' | 'organization';
  confidence: number;
} {
  // Normalize the word
  const normalizedWord = word.normalize('NFKD').replace(/[\u064B-\u065F]/g, '');
  
  // Check if word has 'Al' prefix (definite article)
  const hasAl = normalizedWord.startsWith('ال');
  
  // Initialize result
  let result = {
    isEntity: false,
    type: undefined as 'person' | 'location' | 'organization' | undefined,
    confidence: 0
  };
  
  // Check context for title indicators
  for (let i = 0; i < context.length; i++) {
    const contextWord = context[i].normalize('NFKD').replace(/[\u064B-\u065F]/g, '');
    
    // Check for person titles
    if (ARABIC_NER_PATTERNS.personTitles.has(contextWord)) {
      result = { isEntity: true, type: 'person', confidence: 0.8 };
      break;
    }
    
    // Check for location indicators
    if (ARABIC_NER_PATTERNS.locationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'location', confidence: 0.7 };
      break;
    }
    
    // Check for organization indicators
    if (ARABIC_NER_PATTERNS.organizationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'organization', confidence: 0.7 };
      break;
    }
  }
  
  // Additional heuristics for named entities
  if (!result.isEntity) {
    // Most Arabic names and places start with Al- (ال)
    if (hasAl && normalizedWord.length > 4) {
      result = { isEntity: true, type: undefined, confidence: 0.4 };
    }
    
    // Check for common word patterns that indicate proper nouns
    if (normalizedWord.match(/^[A-Z\u0600-\u06FF]{4,}$/)) {
      result.confidence += 0.2;
    }
  }
  
  return result;
}

/**
 * Detects if a word might be a named entity in English
 * @param word The word to check
 * @param context The surrounding words (for pattern matching)
 */
function detectEnglishNamedEntity(word: string, context: string[] = []): {
  isEntity: boolean;
  type?: 'person' | 'location' | 'organization';
  confidence: number;
} {
  // Normalize the word
  const normalizedWord = word.trim();
  
  // Initialize result
  let result = {
    isEntity: false,
    type: undefined as 'person' | 'location' | 'organization' | undefined,
    confidence: 0
  };
  
  // Basic capitalization check - proper nouns in English are usually capitalized
  const isCapitalized = /^[A-Z][a-z]+$/.test(normalizedWord);
  if (isCapitalized) {
    result.isEntity = true;
    result.confidence = 0.3;
  }
  
  // All caps might be an organization or acronym
  const isAllCaps = /^[A-Z]{2,}$/.test(normalizedWord);
  if (isAllCaps) {
    result.isEntity = true;
    result.type = 'organization';
    result.confidence = 0.5;
  }
  
  // Check context for NER indicators
  for (let i = 0; i < context.length; i++) {
    const contextWord = context[i];
    
    // Check for person titles
    if (ENGLISH_NER_PATTERNS.personTitles.has(contextWord)) {
      result = { isEntity: true, type: 'person', confidence: 0.8 };
      break;
    }
    
    // Check for location indicators
    if (ENGLISH_NER_PATTERNS.locationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'location', confidence: 0.7 };
      break;
    }
    
    // Check for organization indicators
    if (ENGLISH_NER_PATTERNS.organizationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'organization', confidence: 0.7 };
      break;
    }
    
    // Check for "of" pattern which often indicates organizations (University of X)
    if (i > 0 && i < context.length - 1 && 
        contextWord.toLowerCase() === 'of' && 
        isCapitalized && 
        /^[A-Z][a-z]+$/.test(context[i-1])) {
      result = { isEntity: true, type: 'organization', confidence: 0.6 };
      break;
    }
  }
  
  return result;
}

/**
 * Detects if a word might be a named entity in French
 * @param word The word to check
 * @param context The surrounding words (for pattern matching)
 */
function detectFrenchNamedEntity(word: string, context: string[] = []): {
  isEntity: boolean;
  type?: 'person' | 'location' | 'organization';
  confidence: number;
} {
  // Normalize the word
  const normalizedWord = word.trim();
  
  // Initialize result
  let result = {
    isEntity: false,
    type: undefined as 'person' | 'location' | 'organization' | undefined,
    confidence: 0
  };
  
  // Basic capitalization check - proper nouns in French are usually capitalized
  const isCapitalized = /^[A-Z][a-zàáâäæçèéêëìíîïòóôöùúûüÿ]+$/.test(normalizedWord);
  if (isCapitalized) {
    result.isEntity = true;
    result.confidence = 0.3;
  }
  
  // Check context for NER indicators
  for (let i = 0; i < context.length; i++) {
    const contextWord = context[i];
    
    // Check for person titles
    if (FRENCH_NER_PATTERNS.personTitles.has(contextWord)) {
      result = { isEntity: true, type: 'person', confidence: 0.8 };
      break;
    }
    
    // Check for location indicators
    if (FRENCH_NER_PATTERNS.locationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'location', confidence: 0.7 };
      break;
    }
    
    // Check for organization indicators
    if (FRENCH_NER_PATTERNS.organizationIndicators.has(contextWord)) {
      result = { isEntity: true, type: 'organization', confidence: 0.7 };
      break;
    }
    
    // Check for "de" pattern which often indicates organizations (Université de X)
    if (i > 0 && i < context.length - 1 && 
        (contextWord.toLowerCase() === 'de' || contextWord.toLowerCase() === 'du' || contextWord.toLowerCase() === 'des') && 
        isCapitalized && 
        /^[A-Z][a-zàáâäæçèéêëìíîïòóôöùúûüÿ]+$/.test(context[i-1])) {
      result = { isEntity: true, type: 'organization', confidence: 0.6 };
      break;
    }
  }
  
  return result;
}

/**
 * Enhanced scoring for Arabic keywords considering both statistical and semantic factors
 */
function scoreArabicWord(
  word: string,
  frequency: number,
  totalWords: number,
  context: string[]
): number {
  // Base TF-IDF score
  const tfIdfScore = calculateTfIdf(word, frequency, totalWords);
  
  // Named entity detection
  const nerResult = detectArabicNamedEntity(word, context);
  
  // Calculate final score
  let finalScore = tfIdfScore;
  
  // Boost score for named entities
  if (nerResult.isEntity) {
    finalScore *= (1 + nerResult.confidence);
    
    // Additional boost for specific entity types
    switch (nerResult.type) {
      case 'person':
        finalScore *= 1.3;
        break;
      case 'location':
        finalScore *= 1.2;
        break;
      case 'organization':
        finalScore *= 1.2;
        break;
    }
  }
  
  // Length bonus (longer words often carry more meaning in Arabic)
  const lengthBonus = Math.min(1.2, word.length / 5);
  finalScore *= lengthBonus;
  
  return finalScore;
}

/**
 * Enhanced scoring for English keywords considering both statistical and semantic factors
 */
function scoreEnglishWord(
  word: string,
  frequency: number,
  totalWords: number,
  context: string[]
): number {
  // Base TF-IDF score
  const tfIdfScore = calculateTfIdf(word, frequency, totalWords);
  
  // Named entity detection
  const nerResult = detectEnglishNamedEntity(word, context);
  
  // Calculate final score
  let finalScore = tfIdfScore;
  
  // Boost score for named entities
  if (nerResult.isEntity) {
    finalScore *= (1 + nerResult.confidence);
    
    // Additional boost for specific entity types
    switch (nerResult.type) {
      case 'person':
        finalScore *= 1.3;
        break;
      case 'location':
        finalScore *= 1.2;
        break;
      case 'organization':
        finalScore *= 1.2;
        break;
    }
  }
  
  // Length bonus (longer words often carry more meaning)
  const lengthBonus = Math.min(1.1, word.length / 7);
  finalScore *= lengthBonus;
  
  return finalScore;
}

/**
 * Enhanced scoring for French keywords considering both statistical and semantic factors
 */
function scoreFrenchWord(
  word: string,
  frequency: number,
  totalWords: number,
  context: string[]
): number {
  // Base TF-IDF score
  const tfIdfScore = calculateTfIdf(word, frequency, totalWords);
  
  // Named entity detection
  const nerResult = detectFrenchNamedEntity(word, context);
  
  // Calculate final score
  let finalScore = tfIdfScore;
  
  // Boost score for named entities
  if (nerResult.isEntity) {
    finalScore *= (1 + nerResult.confidence);
    
    // Additional boost for specific entity types
    switch (nerResult.type) {
      case 'person':
        finalScore *= 1.3;
        break;
      case 'location':
        finalScore *= 1.2;
        break;
      case 'organization':
        finalScore *= 1.2;
        break;
    }
  }
  
  // Length bonus (longer words often carry more meaning)
  const lengthBonus = Math.min(1.1, word.length / 6);
  finalScore *= lengthBonus;
  
  return finalScore;
}

/**
 * Enhanced keyword extraction using TF-IDF and NER
 */
export function extractKeywords(text: string, maxKeywords: number = 20): string[] {
  if (!text) return [];
  
  const detectedLang = detectLanguage(text);
  console.log("Detected language:", detectedLang);
  
  // Extract all words using Unicode property escapes to support all scripts
  const allWords = text.match(/\p{L}+/gu) || [];
  
  // Create context windows (5 words before and after each word)
  const contextWindows: string[][] = [];
  for (let i = 0; i < allWords.length; i++) {
    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(allWords.length, i + 6);
    contextWindows.push(allWords.slice(windowStart, windowEnd));
  }
  
  if (detectedLang === 'arabic') {
    // Filter out function words
    const contentWords = allWords.filter(word => !isArabicFunctionWord(word));
    
    if (contentWords.length >= 5) {
      // Count frequencies
      const wordFreq: Record<string, number> = {};
      contentWords.forEach(word => {
        const normalized = word.toLowerCase();
        wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
      });
      
      // Calculate scores using enhanced scoring function
      const scores: Record<string, number> = {};
      Object.entries(wordFreq).forEach(([word, freq]) => {
        // Find the original index of this word to get its context
        const originalIndexes: number[] = [];
        for (let i = 0; i < allWords.length; i++) {
          if (allWords[i].toLowerCase() === word) {
            originalIndexes.push(i);
          }
        }
        
        // Use the first occurrence's context, or empty if not found
        const context = originalIndexes.length > 0 
          ? contextWindows[originalIndexes[0]] 
          : [];
        
        scores[word] = scoreArabicWord(word, freq, contentWords.length, context);
      });
      
      // Sort by score and return top keywords
      return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([word]) => word);
    }
    
    return [...new Set(contentWords)].slice(0, maxKeywords);
  } else if (detectedLang === 'english') {
    // For English language, use the standard approach with NER
    const stopWords = getStopWords(detectedLang);
    
    // Filter out stopwords
    const filteredWords = allWords.filter(word => {
      const normalized = word.toLowerCase();
      return !stopWords.has(normalized) && normalized.length > 1;
    });
    
    // If we have very few words after filtering, return them all
    if (filteredWords.length < 5) {
      return [...new Set(filteredWords)].slice(0, maxKeywords);
    }
    
    // Calculate word frequencies
    const wordFrequency: Record<string, number> = {};
    filteredWords.forEach(word => {
      const normalized = word.toLowerCase();
      wordFrequency[normalized] = (wordFrequency[normalized] || 0) + 1;
    });
    
    // Calculate scores using English NER enhanced scoring
    const scores: Record<string, number> = {};
    const wordCount = filteredWords.length;
    
    Object.entries(wordFrequency).forEach(([word, freq]) => {
      // Find context for this word
      const originalIndexes: number[] = [];
      for (let i = 0; i < allWords.length; i++) {
        if (allWords[i].toLowerCase() === word) {
          originalIndexes.push(i);
        }
      }
      
      // Use the first occurrence's context
      const context = originalIndexes.length > 0 
        ? contextWindows[originalIndexes[0]] 
        : [];
      
      scores[word] = scoreEnglishWord(word, freq, wordCount, context);
    });
    
    // Sort by score and take top N
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  } else if (detectedLang === 'french') {
    // For French language, use the standard approach with NER
    const stopWords = getStopWords(detectedLang);
    
    // Filter out stopwords
    const filteredWords = allWords.filter(word => {
      const normalized = word.toLowerCase();
      return !stopWords.has(normalized) && normalized.length > 1;
    });
    
    // If we have very few words after filtering, return them all
    if (filteredWords.length < 5) {
      return [...new Set(filteredWords)].slice(0, maxKeywords);
    }
    
    // Calculate word frequencies
    const wordFrequency: Record<string, number> = {};
    filteredWords.forEach(word => {
      const normalized = word.toLowerCase();
      wordFrequency[normalized] = (wordFrequency[normalized] || 0) + 1;
    });
    
    // Calculate scores using French NER enhanced scoring
    const scores: Record<string, number> = {};
    const wordCount = filteredWords.length;
    
    Object.entries(wordFrequency).forEach(([word, freq]) => {
      // Find context for this word
      const originalIndexes: number[] = [];
      for (let i = 0; i < allWords.length; i++) {
        if (allWords[i].toLowerCase() === word) {
          originalIndexes.push(i);
        }
      }
      
      // Use the first occurrence's context
      const context = originalIndexes.length > 0 
        ? contextWindows[originalIndexes[0]] 
        : [];
      
      scores[word] = scoreFrenchWord(word, freq, wordCount, context);
    });
    
    // Sort by score and take top N
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  } else {
    // For non-Arabic/English/French languages, use the standard approach
    const stopWords = getStopWords(detectedLang);
    
    // First filter out stopwords
    const filteredWords = allWords.filter(word => {
      const normalized = word.toLowerCase();
      return !stopWords.has(normalized) && normalized.length > 1;
    });
    
    // If we have very few words after filtering, return them all
    if (filteredWords.length < 5) {
      return [...new Set(filteredWords)].slice(0, maxKeywords);
    }
    
    // Calculate word frequencies (Term Frequency)
    const wordFrequency: Record<string, number> = {};
    filteredWords.forEach(word => {
      const normalized = word.toLowerCase();
      wordFrequency[normalized] = (wordFrequency[normalized] || 0) + 1;
    });
    
    // Calculate scores with TF-IDF inspired approach
    const scores: Record<string, number> = {};
    const wordCount = filteredWords.length;
    
    Object.entries(wordFrequency).forEach(([word, freq]) => {
      // TF component (frequency in this document)
      const tf = freq / wordCount;
      
      // IDF-like component (boost longer words and penalize very common words)
      const lengthBoost = Math.min(1.0, word.length / 5); // Boost for longer words
      const commonnessPenalty = Math.max(0.5, 1.0 - (freq / wordCount) * 10); // Penalize very common words
      
      scores[word] = tf * lengthBoost * commonnessPenalty;
    });
    
    // Sort words by score and take top N
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }
}
