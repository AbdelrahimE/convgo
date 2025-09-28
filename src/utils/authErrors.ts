/**
 * Authentication Error Handler Utility
 * Converts Supabase Auth errors to user-friendly messages
 * Supports English and Arabic messages
 */

import { isNetworkError, getNetworkErrorMessage, type NetworkError } from './networkHandling';

export interface AuthError {
  code?: string;
  message: string;
  status?: number;
}

export interface FriendlyErrorMessage {
  title: string;
  description: string;
  action?: string;
}

export type ErrorLanguage = 'en' | 'ar';

/**
 * Maps common Supabase Auth error messages to user-friendly messages
 */
const ERROR_MESSAGE_MAP: Record<string, Record<ErrorLanguage, FriendlyErrorMessage>> = {
  // Login errors
  'Invalid login credentials': {
    en: {
      title: 'Sign In Failed',
      description: 'The email or password you entered is incorrect. Please check your credentials and try again.',
      action: 'Try again or reset your password'
    },
    ar: {
      title: 'فشل تسجيل الدخول',
      description: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من بياناتك والمحاولة مرة أخرى.',
      action: 'حاول مرة أخرى أو أعد تعيين كلمة المرور'
    }
  },

  'Email not confirmed': {
    en: {
      title: 'Email Not Verified',
      description: 'Please check your email and click the verification link we sent you to activate your account.',
      action: 'Check your email inbox and spam folder'
    },
    ar: {
      title: 'البريد الإلكتروني غير مؤكد',
      description: 'يرجى التحقق من بريدك الإلكتروني والنقر على رابط التأكيد الذي أرسلناه لك لتفعيل حسابك.',
      action: 'تحقق من صندوق البريد الوارد ومجلد البريد المزعج'
    }
  },

  // Registration errors
  'User already registered': {
    en: {
      title: 'Account Already Exists',
      description: 'An account with this email address already exists. Please sign in instead or use a different email.',
      action: 'Try signing in or use a different email'
    },
    ar: {
      title: 'الحساب موجود مسبقاً',
      description: 'يوجد حساب مسجل بهذا البريد الإلكتروني. يرجى تسجيل الدخول أو استخدام بريد إلكتروني آخر.',
      action: 'حاول تسجيل الدخول أو استخدم بريد إلكتروني آخر'
    }
  },

  // Rate limiting
  'Too many requests': {
    en: {
      title: 'Too Many Attempts',
      description: 'You have made too many sign-in attempts. Please wait a few minutes before trying again.',
      action: 'Wait 5 minutes and try again'
    },
    ar: {
      title: 'محاولات كثيرة جداً',
      description: 'لقد قمت بمحاولات كثيرة لتسجيل الدخول. يرجى الانتظار بضع دقائق قبل المحاولة مرة أخرى.',
      action: 'انتظر 5 دقائق وحاول مرة أخرى'
    }
  },

  // Password reset errors
  'Unable to validate email address: invalid format': {
    en: {
      title: 'Invalid Email Format',
      description: 'Please enter a valid email address in the correct format (example: name@domain.com).',
      action: 'Check your email format'
    },
    ar: {
      title: 'صيغة البريد الإلكتروني غير صحيحة',
      description: 'يرجى إدخال عنوان بريد إلكتروني صحيح بالصيغة الصحيحة (مثال: name@domain.com).',
      action: 'تحقق من صيغة البريد الإلكتروني'
    }
  },

  'User not found': {
    en: {
      title: 'Account Not Found',
      description: 'No account found with this email address. Please check your email or create a new account.',
      action: 'Check your email or sign up'
    },
    ar: {
      title: 'الحساب غير موجود',
      description: 'لم يتم العثور على حساب بهذا البريد الإلكتروني. يرجى التحقق من البريد أو إنشاء حساب جديد.',
      action: 'تحقق من البريد أو أنشئ حساباً جديداً'
    }
  },

  // Network errors
  'Failed to fetch': {
    en: {
      title: 'Connection Problem',
      description: 'Unable to connect to our servers. Please check your internet connection and try again.',
      action: 'Check your internet connection'
    },
    ar: {
      title: 'مشكلة في الاتصال',
      description: 'تعذر الاتصال بخوادمنا. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
      action: 'تحقق من اتصال الإنترنت'
    }
  },

  'Network request failed': {
    en: {
      title: 'Network Error',
      description: 'Network request failed. Please check your internet connection and try again.',
      action: 'Check your connection and retry'
    },
    ar: {
      title: 'خطأ في الشبكة',
      description: 'فشل طلب الشبكة. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
      action: 'تحقق من الاتصال وأعد المحاولة'
    }
  }
};

/**
 * Fallback error messages for unknown errors
 */
const FALLBACK_MESSAGES: Record<ErrorLanguage, FriendlyErrorMessage> = {
  en: {
    title: 'Authentication Error',
    description: 'An unexpected error occurred during authentication. Please try again or contact support if the problem persists.',
    action: 'Try again or contact support'
  },
  ar: {
    title: 'خطأ في المصادقة',
    description: 'حدث خطأ غير متوقع أثناء المصادقة. يرجى المحاولة مرة أخرى أو الاتصال بالدعم إذا استمرت المشكلة.',
    action: 'حاول مرة أخرى أو اتصل بالدعم'
  }
};

/**
 * Extracts the most relevant error message from a Supabase error object
 */
function extractErrorMessage(error: AuthError): string {
  if (error.message) {
    return error.message.trim();
  }
  
  // Handle status-based errors
  if (error.status === 400) {
    return 'Invalid request';
  }
  if (error.status === 401) {
    return 'Invalid login credentials';
  }
  if (error.status === 403) {
    return 'Access denied';
  }
  if (error.status === 429) {
    return 'Too many requests';
  }
  if (error.status === 500) {
    return 'Server error';
  }

  return 'Unknown error';
}

/**
 * Finds the best matching error message using fuzzy matching
 */
function findBestMatch(errorMessage: string): string | null {
  const normalizedError = errorMessage.toLowerCase().trim();
  
  // Exact match first
  for (const key of Object.keys(ERROR_MESSAGE_MAP)) {
    if (key.toLowerCase() === normalizedError) {
      return key;
    }
  }
  
  // Partial match
  for (const key of Object.keys(ERROR_MESSAGE_MAP)) {
    if (normalizedError.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedError)) {
      return key;
    }
  }
  
  // Special cases for common variations
  if (normalizedError.includes('invalid') && normalizedError.includes('login')) {
    return 'Invalid login credentials';
  }
  
  if (normalizedError.includes('already') && normalizedError.includes('registered')) {
    return 'User already registered';
  }
  
  if (normalizedError.includes('email') && normalizedError.includes('confirm')) {
    return 'Email not confirmed';
  }
  
  if (normalizedError.includes('too many') || normalizedError.includes('rate limit')) {
    return 'Too many requests';
  }
  
  if (normalizedError.includes('fetch') || normalizedError.includes('network')) {
    return 'Failed to fetch';
  }
  
  return null;
}

/**
 * Checks if an error is an authentication-related error
 */
function isAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const errorMessage = (error as { message?: string }).message?.toLowerCase() || '';

  // List of known authentication error patterns
  const authErrorPatterns = [
    'invalid login credentials',
    'invalid credentials',
    'email not confirmed',
    'user already registered',
    'user not found',
    'unable to validate email address',
    'unauthorized',
    'forbidden',
    'access denied',
    'too many requests'
  ];

  // Check status codes for authentication errors
  const errorObj = error as { status?: number; statusCode?: number };
  if (errorObj.status || errorObj.statusCode) {
    const status = errorObj.status || errorObj.statusCode;
    if (status === 401 || status === 403) {
      return true;
    }
    // 400 can be authentication error if it matches auth patterns
    if (status === 400 && authErrorPatterns.some(pattern => errorMessage.includes(pattern))) {
      return true;
    }
    // 429 is rate limiting, which is auth-related
    if (status === 429) {
      return true;
    }
  }

  return authErrorPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Converts a Supabase Auth error to a user-friendly message
 */
export function getAuthErrorMessage(
  error: AuthError | Error | string,
  language: ErrorLanguage = 'en'
): FriendlyErrorMessage {
  // Handle authentication errors first, even if wrapped as network errors
  if (error && typeof error === 'object') {
    // If it's a NetworkError but contains an authentication error
    if (isNetworkError(error) && isAuthenticationError(error)) {
      // Ignore the NetworkError wrapper and treat as authentication error
      const errorMessage = extractErrorMessage(error as AuthError);
      const matchedKey = findBestMatch(errorMessage);

      if (matchedKey && ERROR_MESSAGE_MAP[matchedKey]) {
        return ERROR_MESSAGE_MAP[matchedKey][language];
      }
    }
    // If it's a regular authentication error (not wrapped)
    else if (isAuthenticationError(error)) {
      const errorMessage = extractErrorMessage(error as AuthError);
      const matchedKey = findBestMatch(errorMessage);

      if (matchedKey && ERROR_MESSAGE_MAP[matchedKey]) {
        return ERROR_MESSAGE_MAP[matchedKey][language];
      }
    }
  }

  // Handle genuine network errors
  if (error && typeof error === 'object' && isNetworkError(error)) {
    const networkErrorMsg = getNetworkErrorMessage(error as NetworkError);
    return {
      title: networkErrorMsg.title,
      description: networkErrorMsg.description,
      action: networkErrorMsg.action
    };
  }

  let errorMessage: string;

  // Handle different error types
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    errorMessage = extractErrorMessage(error as AuthError);
  } else {
    return FALLBACK_MESSAGES[language];
  }

  // Find the best matching error message
  const matchedKey = findBestMatch(errorMessage);

  if (matchedKey && ERROR_MESSAGE_MAP[matchedKey]) {
    return ERROR_MESSAGE_MAP[matchedKey][language];
  }

  // Return fallback message
  return FALLBACK_MESSAGES[language];
}

/**
 * Helper function to get error message for sign in operations
 */
export function getSignInErrorMessage(error: AuthError | Error | string): FriendlyErrorMessage {
  return getAuthErrorMessage(error, 'en'); // Default to English for now
}

/**
 * Helper function to get error message for sign up operations
 */
export function getSignUpErrorMessage(error: AuthError | Error | string): FriendlyErrorMessage {
  return getAuthErrorMessage(error, 'en'); // Default to English for now
}

/**
 * Helper function to get error message for password reset operations
 */
export function getPasswordResetErrorMessage(error: AuthError | Error | string): FriendlyErrorMessage {
  return getAuthErrorMessage(error, 'en'); // Default to English for now
}

/**
 * Type guard to check if an error is a Supabase Auth error
 */
export function isAuthError(error: unknown): error is AuthError {
  return error !== null && typeof error === 'object' && 'message' in error;
}

/**
 * Logs auth errors with additional context for debugging
 */
export function logAuthError(error: AuthError | Error | string, context: string = '') {
  const errorMessage = typeof error === 'string' ? error :
    (typeof error === 'object' && error !== null && 'message' in error ? error.message : 'Unknown error');

  const errorCode = typeof error === 'object' && error !== null && 'code' in error ?
    (error as { code: unknown }).code : undefined;

  const errorStatus = typeof error === 'object' && error !== null && 'status' in error ?
    (error as { status: unknown }).status : undefined;
  
  console.error(`[Auth Error] ${context}`, {
    message: errorMessage,
    code: errorCode,
    status: errorStatus,
    timestamp: new Date().toISOString()
  });
}