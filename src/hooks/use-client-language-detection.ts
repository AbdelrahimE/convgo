
import { useState, useEffect, useCallback } from 'react';

export type DetectedLanguage = 'ar' | 'en' | 'auto';

/**
 * Hook for detecting language in real-time on the client side
 * This is a lightweight implementation that focuses on Arabic vs non-Arabic detection
 */
export function useClientLanguageDetection() {
  // Simple Arabic text detection
  // This checks for Arabic Unicode character ranges
  const detectLanguage = useCallback((text: string): DetectedLanguage => {
    if (!text || text.trim() === '') return 'auto';
    
    // Arabic Unicode ranges
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    
    // If any Arabic characters are found, consider it Arabic
    if (arabicPattern.test(text)) {
      return 'ar';
    }
    
    return 'en';
  }, []);

  return { detectLanguage };
}
