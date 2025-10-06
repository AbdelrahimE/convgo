/**
 * API Retry Utility with Automatic Session Refresh
 *
 * This utility provides intelligent retry logic for Supabase API calls.
 * When a 401 Unauthorized error occurs (expired JWT), it automatically:
 * 1. Attempts to refresh the session
 * 2. Retries the original API call
 * 3. Returns the result or throws an error
 *
 * Usage:
 * ```typescript
 * const result = await withAuthRetry(async () => {
 *   const { data, error } = await supabase.from('table').select('*');
 *   if (error) throw error;
 *   return data;
 * });
 * ```
 */

import logger from '@/utils/logger';
import { sessionManager } from '@/utils/sessionManager';

interface RetryOptions {
  maxRetries?: number;
  retryOn401Only?: boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 1,
  retryOn401Only: true,
};

/**
 * Checks if an error is a 401 Unauthorized error
 */
function is401Error(error: any): boolean {
  return (
    error?.status === 401 ||
    error?.statusCode === 401 ||
    error?.code === 'PGRST301' || // PostgREST JWT expired
    error?.message?.toLowerCase().includes('jwt') ||
    error?.message?.toLowerCase().includes('expired') ||
    error?.message?.toLowerCase().includes('unauthorized')
  );
}

/**
 * Checks if an error is retryable based on options
 */
function isRetryableError(error: any, options: RetryOptions): boolean {
  if (options.retryOn401Only) {
    return is401Error(error);
  }

  // Also retry on network errors or 5xx errors
  const isNetworkError = error?.message?.toLowerCase().includes('network');
  const isServerError = error?.status >= 500 && error?.status < 600;

  return is401Error(error) || isNetworkError || isServerError;
}

/**
 * Attempts to refresh the current session using centralized SessionManager
 * Returns true if refresh was successful, false otherwise
 *
 * NOTE: This now uses sessionManager instead of directly calling Supabase
 * to prevent concurrent refresh token requests that cause "Invalid Refresh Token" errors
 */
async function refreshSession(): Promise<boolean> {
  try {
    logger.log('apiWithRetry: Attempting to refresh session due to 401 error via SessionManager');

    // Use centralized sessionManager to prevent concurrent refresh attempts
    const success = await sessionManager.refreshSession();

    if (success) {
      logger.log('apiWithRetry: Session refreshed successfully via SessionManager');
    } else {
      logger.error('apiWithRetry: Failed to refresh session via SessionManager');
    }

    return success;
  } catch (error) {
    logger.error('apiWithRetry: Exception during session refresh:', error);
    return false;
  }
}

/**
 * Executes an API call with automatic retry on authentication errors
 *
 * @param apiCall - The async function that performs the API call
 * @param options - Retry configuration options
 * @returns The result of the API call
 * @throws The error if retry fails or error is not retryable
 *
 * @example
 * ```typescript
 * // Simple usage
 * const files = await withAuthRetry(async () => {
 *   const { data, error } = await supabase.from('files').select('*');
 *   if (error) throw error;
 *   return data;
 * });
 *
 * // With custom options
 * const data = await withAuthRetry(
 *   async () => {
 *     const { data, error } = await supabase.from('table').select('*');
 *     if (error) throw error;
 *     return data;
 *   },
 *   { maxRetries: 2, retryOn401Only: false }
 * );
 * ```
 */
export async function withAuthRetry<T>(
  apiCall: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let retryCount = 0;

  while (retryCount <= opts.maxRetries) {
    try {
      // Execute the API call
      const result = await apiCall();

      // Log successful retry if this wasn't the first attempt
      if (retryCount > 0) {
        logger.log(`API call succeeded on retry attempt ${retryCount}`);
      }

      return result;

    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry =
        retryCount < opts.maxRetries &&
        isRetryableError(error, opts);

      if (!shouldRetry) {
        // Not retryable or max retries reached
        throw error;
      }

      // Log retry attempt
      logger.warn(
        `API call failed with retryable error (attempt ${retryCount + 1}/${opts.maxRetries + 1}):`,
        error
      );

      // If it's a 401 error, try to refresh the session
      if (is401Error(error)) {
        const refreshSucceeded = await refreshSession();

        if (!refreshSucceeded) {
          // Refresh failed - don't retry, throw the error
          logger.error('Session refresh failed - cannot retry API call');
          throw error;
        }

        // Small delay to ensure session is propagated
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      retryCount++;
    }
  }

  // This should never be reached, but just in case
  throw lastError;
}

/**
 * Type-safe wrapper for Supabase queries with automatic retry
 * Specifically designed for use with React Query
 *
 * @example
 * ```typescript
 * const { data, isLoading } = useQuery({
 *   queryKey: ['files', userId],
 *   queryFn: () => withSupabaseRetry(
 *     () => supabase.from('files').select('*').eq('user_id', userId)
 *   )
 * });
 * ```
 */
export async function withSupabaseRetry<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T> {
  return withAuthRetry(async () => {
    const { data, error } = await queryFn();

    if (error) {
      // Enhance error with status code if available
      const enhancedError = {
        ...error,
        status: error.status || error.code || error.statusCode,
      };
      throw enhancedError;
    }

    return data as T;
  });
}
