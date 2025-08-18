/**
 * Simple language detection utility
 * Detects Arabic vs non-Arabic text for WhatsApp AI responses
 * This is a lightweight implementation that doesn't affect RAG performance
 */

export type DetectedLanguage = 'ar' | 'en' | 'auto';

/**
 * Detects the primary language of a text message
 * Uses simple Unicode character detection for accuracy and speed
 * 
 * @param text The message text to analyze
 * @returns 'ar' for Arabic, 'en' for English/other, 'auto' for empty text
 */
export function detectMessageLanguage(text: string): DetectedLanguage {
  // Handle empty or whitespace-only text
  if (!text || text.trim() === '') {
    return 'auto';
  }

  // Arabic Unicode ranges - comprehensive detection
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  
  // Count Arabic characters
  const arabicMatches = text.match(arabicPattern);
  const arabicCharCount = arabicMatches ? arabicMatches.length : 0;
  
  // Get total meaningful characters (excluding spaces, numbers, punctuation)
  const meaningfulChars = text.replace(/[\s\d\p{P}]/gu, '');
  const totalMeaningfulChars = meaningfulChars.length;
  
  // If no meaningful characters, return auto
  if (totalMeaningfulChars === 0) {
    return 'auto';
  }
  
  // Calculate Arabic percentage
  const arabicPercentage = arabicCharCount / totalMeaningfulChars;
  
  // If more than 30% Arabic characters, consider it Arabic
  // This threshold handles mixed language content gracefully
  if (arabicPercentage > 0.3) {
    return 'ar';
  }
  
  // Otherwise, treat as English/other language
  return 'en';
}

/**
 * Gets language-appropriate system prompt instruction
 * Simple addition to existing prompts without complex logic
 * 
 * @param detectedLanguage The detected language
 * @returns Language instruction to append to system prompt
 */
export function getLanguageInstruction(detectedLanguage: DetectedLanguage): string {
  switch (detectedLanguage) {
    case 'ar':
      return '\n\nIMPORTANT: The user wrote in Arabic. Please respond in Arabic only.';
    case 'en':
      return '\n\nIMPORTANT: The user wrote in English. Please respond in English only.';
    case 'auto':
    default:
      return '\n\nIMPORTANT: Please respond in the same language as the user\'s message.';
  }
}

/**
 * Validates if the detected language makes sense
 * Simple validation to avoid edge cases
 * 
 * @param text Original text
 * @param detectedLang Detected language
 * @returns true if detection seems reasonable
 */
export function validateLanguageDetection(text: string, detectedLang: DetectedLanguage): boolean {
  // Always valid for auto
  if (detectedLang === 'auto') {
    return true;
  }
  
  // For very short text (< 5 chars), detection might be unreliable
  if (text.trim().length < 5) {
    return false;
  }
  
  return true;
}