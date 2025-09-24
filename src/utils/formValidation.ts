/**
 * Form Validation Utilities
 * Provides real-time validation for authentication forms
 */

import { validateBusinessNameEnhanced, validateBusinessNameQuick } from './businessNameValidation';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
}

export interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  fullName?: string;
  businessName?: string;
}

/**
 * Validates email format
 */
export function validateEmail(email: string): ValidationResult {
  const trimmedEmail = email.trim();
  
  if (!trimmedEmail) {
    return {
      isValid: false,
      error: 'Email address is required'
    };
  }
  
  // Basic format check
  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmailRegex.test(trimmedEmail)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address (e.g., name@domain.com)'
    };
  }
  
  // More comprehensive email validation
  const comprehensiveEmailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!comprehensiveEmailRegex.test(trimmedEmail)) {
    return {
      isValid: false,
      error: 'Email format is not valid. Please check and try again'
    };
  }
  
  // Length check
  if (trimmedEmail.length > 320) {
    return {
      isValid: false,
      error: 'Email address is too long (maximum 320 characters)'
    };
  }
  
  // Common domain checks for typos
  const commonTypos = [
    { typo: '@gmail', correct: '@gmail.com' },
    { typo: '@yahoo', correct: '@yahoo.com' },
    { typo: '@hotmail', correct: '@hotmail.com' },
    { typo: '@outlook', correct: '@outlook.com' },
    { typo: '@icloud', correct: '@icloud.com' }
  ];
  
  for (const check of commonTypos) {
    if (trimmedEmail.toLowerCase().endsWith(check.typo)) {
      return {
        isValid: false,
        error: `Did you mean "${trimmedEmail.replace(check.typo, check.correct)}"?`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Validates password for login (basic requirements)
 */
export function validateLoginPassword(password: string): ValidationResult {
  if (!password) {
    return {
      isValid: false,
      error: 'Password is required'
    };
  }
  
  if (password.length < 6) {
    return {
      isValid: false,
      error: 'Password is too short. Please check your password and try again'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates password for registration (strict requirements)
 */
export function validateRegistrationPassword(password: string): ValidationResult {
  if (!password) {
    return {
      isValid: false,
      error: 'Password is required'
    };
  }
  
  if (password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters long'
    };
  }
  
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  if (!hasLower) {
    return {
      isValid: false,
      error: 'Password must include at least one lowercase letter (a-z)'
    };
  }
  
  if (!hasUpper) {
    return {
      isValid: false,
      error: 'Password must include at least one uppercase letter (A-Z)'
    };
  }
  
  if (!hasNumber) {
    return {
      isValid: false,
      error: 'Password must include at least one number (0-9)'
    };
  }
  
  if (!hasSpecial) {
    return {
      isValid: false,
      error: 'Password must include at least one special character (!@#$%^&*)'
    };
  }
  
  // Check for common weak patterns
  const weakPatterns = [
    /(.)\1{2,}/,  // repeated characters (aaa, 111)
    /123456/,     // sequential numbers
    /abcd/i,      // sequential letters
    /qwerty/i,    // keyboard patterns
    /password/i   // contains "password"
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      return {
        isValid: true, // Still valid, but warn
        warning: 'Consider using a more unique password for better security'
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Validates password confirmation
 */
export function validatePasswordConfirmation(password: string, confirmPassword: string): ValidationResult {
  if (!confirmPassword) {
    return {
      isValid: false,
      error: 'Please confirm your password'
    };
  }
  
  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match. Please check both fields'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates full name
 */
export function validateFullName(fullName: string): ValidationResult {
  const trimmedName = fullName.trim();
  
  if (!trimmedName) {
    return {
      isValid: false,
      error: 'Full name is required'
    };
  }
  
  if (trimmedName.length < 2) {
    return {
      isValid: false,
      error: 'Full name must be at least 2 characters long'
    };
  }
  
  if (trimmedName.length > 100) {
    return {
      isValid: false,
      error: 'Full name is too long (maximum 100 characters)'
    };
  }
  
  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  if (!nameRegex.test(trimmedName)) {
    return {
      isValid: false,
      error: 'Full name can only contain letters, spaces, hyphens, and apostrophes'
    };
  }
  
  // Check for at least one letter
  if (!/[a-zA-Z]/.test(trimmedName)) {
    return {
      isValid: false,
      error: 'Full name must contain at least one letter'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates business name with enhanced intelligence
 */
export function validateBusinessName(businessName: string, useEnhanced: boolean = false): ValidationResult {
  if (useEnhanced) {
    const enhancedResult = validateBusinessNameEnhanced(businessName);
    return {
      isValid: enhancedResult.isValid,
      error: enhancedResult.error,
      warning: enhancedResult.warning
    };
  } else {
    // Quick validation for real-time use
    const quickResult = validateBusinessNameQuick(businessName);
    return {
      isValid: quickResult.isValid,
      error: quickResult.error,
      warning: quickResult.warning
    };
  }
}

/**
 * Validates entire login form
 */
export function validateLoginForm(email: string, password: string): FormErrors {
  const errors: FormErrors = {};
  
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  }
  
  const passwordValidation = validateLoginPassword(password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error;
  }
  
  return errors;
}

/**
 * Validates entire registration form
 */
export function validateRegistrationForm(
  email: string,
  password: string,
  confirmPassword: string,
  fullName: string,
  businessName: string
): FormErrors {
  const errors: FormErrors = {};
  
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  }
  
  const passwordValidation = validateRegistrationPassword(password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error;
  }
  
  const confirmPasswordValidation = validatePasswordConfirmation(password, confirmPassword);
  if (!confirmPasswordValidation.isValid) {
    errors.confirmPassword = confirmPasswordValidation.error;
  }
  
  const fullNameValidation = validateFullName(fullName);
  if (!fullNameValidation.isValid) {
    errors.fullName = fullNameValidation.error;
  }
  
  const businessNameValidation = validateBusinessName(businessName, true); // Use enhanced validation for form submission
  if (!businessNameValidation.isValid) {
    errors.businessName = businessNameValidation.error;
  }
  
  return errors;
}

/**
 * Checks if form has any validation errors
 */
export function hasValidationErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(error => error !== undefined && error !== '');
}

/**
 * Gets the first validation error (for displaying priority error)
 */
export function getFirstValidationError(errors: FormErrors): string | undefined {
  const errorValues = Object.values(errors);
  return errorValues.find(error => error !== undefined && error !== '');
}