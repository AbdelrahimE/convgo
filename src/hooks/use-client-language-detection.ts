import { useCallback } from 'react';

export function useClientLanguageDetection() {
  const detectLanguage = useCallback((text: string): 'ar' | 'en' | 'auto' => {
    if (!text || text.trim() === '') {
      return 'auto';
    }
    
    // Arabic Unicode ranges
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    
    // Check for Arabic characters
    if (arabicRegex.test(text)) {
      return 'ar';
    }
    
    return 'en';
  }, []);

  return { detectLanguage };
}