/**
 * Utility functions for phone number input handling
 */

// Mapping of Arabic digits to English digits
const arabicToEnglishMap: { [key: string]: string } = {
  '٠': '0',
  '١': '1', 
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9'
};

/**
 * Converts Arabic numerals to English numerals
 * @param input - String containing Arabic numerals
 * @returns String with English numerals
 */
export const convertArabicToEnglish = (input: string): string => {
  return input.replace(/[٠-٩]/g, (match) => arabicToEnglishMap[match] || match);
};

/**
 * Cleans phone number input by:
 * - Converting Arabic digits to English
 * - Removing all non-digit characters (including +)
 * - Keeping only English digits (0-9)
 * - Limiting to maximum 15 digits
 * @param input - Raw phone number input
 * @returns Cleaned phone number string (max 15 digits)
 */
export const cleanPhoneNumber = (input: string): string => {
  if (!input) return '';
  
  // Convert Arabic digits to English first
  let cleaned = convertArabicToEnglish(input);
  
  // Keep only digits - remove ALL non-digit characters including +
  cleaned = cleaned.replace(/[^\d]/g, '');
  
  // Limit to maximum 15 digits
  if (cleaned.length > 15) {
    cleaned = cleaned.substring(0, 15);
  }
  
  return cleaned;
};

/**
 * Validates if the input contains only allowed characters (digits only)
 * For real-time validation during typing
 * @param input - Phone number string to validate
 * @returns boolean indicating if input is valid
 */
export const isValidPhoneNumberFormat = (input: string): boolean => {
  if (!input) return true;
  
  // Allow digits only - no + symbol allowed
  const phoneRegex = /^\d*$/;
  return phoneRegex.test(input) && input.length <= 15;
};

/**
 * Validates if the phone number is complete and ready for submission
 * Checks for minimum 11 digits and maximum 15 digits
 * @param input - Phone number string to validate
 * @returns boolean indicating if phone number is complete and valid
 */
export const isValidPhoneNumberLength = (input: string): boolean => {
  if (!input) return false;
  
  const cleaned = cleanPhoneNumber(input);
  return cleaned.length >= 11 && cleaned.length <= 15;
};

/**
 * Real-time input handler for phone number fields
 * Cleans input and returns cleaned value
 * @param value - Current input value
 * @returns Cleaned phone number value
 */
export const handlePhoneNumberInput = (value: string): string => {
  return cleanPhoneNumber(value);
};