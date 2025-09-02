import { useMemo } from 'react';

/**
 * Hook to detect if text contains Arabic characters
 */
export const useArabicDetection = (text: string | undefined | null): boolean => {
  return useMemo(() => {
    if (!text) return false;
    // Arabic Unicode ranges
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
  }, [text]);
};

/**
 * Utility function to detect Arabic text
 */
export const hasArabicText = (text: string | undefined | null): boolean => {
  if (!text) return false;
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
};

/**
 * Get appropriate CSS classes for text based on content
 * Only applies font-arabic class, keeps LTR direction for regular text
 */
export const getTextClasses = (text: string | undefined | null, baseClasses: string = ''): string => {
  if (hasArabicText(text)) {
    return `${baseClasses} font-arabic`;
  }
  return baseClasses;
};

/**
 * Get CSS classes for input fields - applies RTL for Arabic content
 */
export const getInputClasses = (text: string | undefined | null, baseClasses: string = ''): string => {
  if (hasArabicText(text)) {
    return `${baseClasses} font-arabic text-right dir-rtl`;
  }
  return baseClasses;
};