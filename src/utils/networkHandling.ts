/**
 * Network Error Handling and Retry Logic
 * Provides intelligent network error handling with automatic retry
 */

export interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType?: 'ethernet' | 'wifi' | 'cellular' | 'unknown';
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: any) => boolean;
}

export interface NetworkError extends Error {
  isNetworkError: boolean;
  isRetryable: boolean;
  statusCode?: number;
  retryAfter?: number;
  connectionType?: string;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

// Network error patterns
const NETWORK_ERROR_PATTERNS = {
  connectionFailure: [
    'Failed to fetch',
    'Network request failed', 
    'NetworkError',
    'fetch is not defined',
    'Connection refused',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET'
  ],
  timeout: [
    'timeout',
    'TIMEOUT',
    'Request timeout',
    'Connection timeout'
  ],
  serverError: [
    'Internal Server Error',
    'Bad Gateway', 
    'Service Unavailable',
    'Gateway Timeout'
  ]
};

// HTTP status codes that are retryable
const RETRYABLE_STATUS_CODES = [408, 429, 502, 503, 504, 520, 521, 522, 523, 524];

/**
 * Detects current network status
 */
export function getNetworkStatus(): NetworkStatus {
  const status: NetworkStatus = {
    isOnline: navigator.onLine,
    isSlowConnection: false
  };

  // Check connection type if available
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    
    if (connection) {
      status.connectionType = connection.type || 'unknown';
      status.effectiveType = connection.effectiveType || '4g';
      
      // Detect slow connection
      status.isSlowConnection = 
        connection.effectiveType === '2g' || 
        connection.effectiveType === 'slow-2g' ||
        (connection.downlink && connection.downlink < 1.5);
    }
  }

  return status;
}

/**
 * Checks if error is network-related
 */
export function isNetworkError(error: any): error is NetworkError {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorString = error.toString?.()?.toLowerCase() || '';
  
  // Check error message patterns
  const allPatterns = [
    ...NETWORK_ERROR_PATTERNS.connectionFailure,
    ...NETWORK_ERROR_PATTERNS.timeout,
    ...NETWORK_ERROR_PATTERNS.serverError
  ];
  
  for (const pattern of allPatterns) {
    if (errorMessage.includes(pattern.toLowerCase()) || 
        errorString.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  // Check status codes
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    return RETRYABLE_STATUS_CODES.includes(status);
  }
  
  // Check for specific error types
  if (error.name) {
    const errorType = error.name.toLowerCase();
    return errorType.includes('network') || 
           errorType.includes('fetch') ||
           errorType.includes('timeout');
  }
  
  return false;
}

/**
 * Determines if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (!isNetworkError(error)) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Don't retry authentication errors
  if (errorMessage.includes('unauthorized') || 
      errorMessage.includes('forbidden') ||
      errorMessage.includes('invalid credentials')) {
    return false;
  }
  
  // Don't retry client errors (4xx except specific ones)
  if (error.status >= 400 && error.status < 500) {
    return RETRYABLE_STATUS_CODES.includes(error.status);
  }
  
  return true;
}

/**
 * Creates enhanced network error
 */
export function createNetworkError(
  originalError: any,
  context: string = ''
): NetworkError {
  const networkError = new Error(
    originalError.message || 'Network error occurred'
  ) as NetworkError;
  
  networkError.isNetworkError = true;
  networkError.isRetryable = isRetryableError(originalError);
  networkError.statusCode = originalError.status || originalError.statusCode;
  networkError.connectionType = getNetworkStatus().connectionType;
  
  // Extract retry-after header if available
  if (originalError.headers?.['retry-after']) {
    networkError.retryAfter = parseInt(originalError.headers['retry-after']) * 1000;
  }
  
  networkError.stack = originalError.stack;
  networkError.name = 'NetworkError';
  
  return networkError;
}

/**
 * Calculates retry delay with exponential backoff
 */
function calculateRetryDelay(
  attempt: number, 
  config: RetryConfig, 
  retryAfter?: number
): number {
  if (retryAfter) {
    return Math.min(retryAfter, config.maxDelay);
  }
  
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  
  return Math.min(delay + jitter, config.maxDelay);
}

/**
 * Waits for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: string = ''
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  
  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      const result = await fn();
      
      // Success - log recovery if this wasn't first attempt
      if (attempt > 1) {
        console.log(`[Network Recovery] ${context} succeeded on attempt ${attempt}`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // If this is the last attempt, throw the error
      if (attempt > retryConfig.maxRetries) {
        throw createNetworkError(error, context);
      }
      
      // Check if error is retryable
      if (!isRetryableError(error) || 
          (retryConfig.retryCondition && !retryConfig.retryCondition(error))) {
        throw createNetworkError(error, context);
      }
      
      // Calculate delay and wait
      const delay = calculateRetryDelay(
        attempt, 
        retryConfig, 
        (error as any).retryAfter
      );
      
      console.log(
        `[Network Retry] ${context} failed on attempt ${attempt}. Retrying in ${delay}ms...`,
        { error: error.message, statusCode: error.status }
      );
      
      await sleep(delay);
    }
  }
  
  throw createNetworkError(lastError, context);
}

/**
 * Network-aware authentication wrapper
 */
export async function withNetworkAwareAuth<T>(
  authFunction: () => Promise<T>,
  operationType: 'signin' | 'signup' | 'reset' | 'oauth' = 'signin'
): Promise<T> {
  const networkStatus = getNetworkStatus();
  
  // Adjust retry config based on connection quality
  const config: Partial<RetryConfig> = {
    maxRetries: networkStatus.isSlowConnection ? 2 : 3,
    baseDelay: networkStatus.isSlowConnection ? 2000 : 1000,
    maxDelay: networkStatus.isSlowConnection ? 15000 : 10000
  };
  
  // Check if user is offline
  if (!networkStatus.isOnline) {
    throw createNetworkError(
      new Error('You appear to be offline. Please check your internet connection.'),
      operationType
    );
  }
  
  return withRetry(authFunction, config, `Auth ${operationType}`);
}

/**
 * Gets user-friendly network error message
 */
export function getNetworkErrorMessage(error: NetworkError): {
  title: string;
  description: string;
  action: string;
} {
  const networkStatus = getNetworkStatus();
  
  if (!networkStatus.isOnline) {
    return {
      title: 'No Internet Connection',
      description: 'You appear to be offline. Please check your internet connection and try again.',
      action: 'Check connection and retry'
    };
  }
  
  if (error.statusCode === 408 || error.message.toLowerCase().includes('timeout')) {
    return {
      title: 'Request Timeout',
      description: networkStatus.isSlowConnection 
        ? 'The request is taking longer due to slow connection. Please wait and try again.'
        : 'The request timed out. This might be due to server load or connection issues.',
      action: 'Wait a moment and try again'
    };
  }
  
  if (error.statusCode === 429) {
    return {
      title: 'Too Many Requests',
      description: 'You have made too many requests. Please wait a few minutes before trying again.',
      action: `Wait ${error.retryAfter ? Math.ceil(error.retryAfter / 1000) + ' seconds' : '2-3 minutes'} and retry`
    };
  }
  
  if (error.statusCode && error.statusCode >= 500) {
    return {
      title: 'Server Temporarily Unavailable',
      description: 'Our servers are experiencing issues. We are working to resolve this quickly.',
      action: 'Please try again in a few minutes'
    };
  }
  
  // Generic network error
  return {
    title: 'Connection Problem',
    description: networkStatus.isSlowConnection
      ? 'Unable to connect due to poor network conditions. Please ensure you have a stable internet connection.'
      : 'Unable to connect to our servers. Please check your internet connection.',
    action: 'Check connection and try again'
  };
}

/**
 * Monitors network status changes
 */
export class NetworkMonitor {
  private listeners: Array<(status: NetworkStatus) => void> = [];
  private currentStatus: NetworkStatus;
  
  constructor() {
    this.currentStatus = getNetworkStatus();
    this.setupListeners();
  }
  
  private setupListeners() {
    window.addEventListener('online', this.handleStatusChange.bind(this));
    window.addEventListener('offline', this.handleStatusChange.bind(this));
    
    // Listen to connection changes if available
    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener(
        'change', 
        this.handleStatusChange.bind(this)
      );
    }
  }
  
  private handleStatusChange() {
    const newStatus = getNetworkStatus();
    const statusChanged = 
      newStatus.isOnline !== this.currentStatus.isOnline ||
      newStatus.effectiveType !== this.currentStatus.effectiveType;
      
    if (statusChanged) {
      this.currentStatus = newStatus;
      this.notifyListeners(newStatus);
    }
  }
  
  private notifyListeners(status: NetworkStatus) {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Network status listener error:', error);
      }
    });
  }
  
  public onStatusChange(listener: (status: NetworkStatus) => void) {
    this.listeners.push(listener);
    
    // Return cleanup function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  public getStatus(): NetworkStatus {
    return { ...this.currentStatus };
  }
  
  public destroy() {
    window.removeEventListener('online', this.handleStatusChange.bind(this));
    window.removeEventListener('offline', this.handleStatusChange.bind(this));
    
    if ('connection' in navigator) {
      (navigator as any).connection?.removeEventListener(
        'change', 
        this.handleStatusChange.bind(this)
      );
    }
    
    this.listeners = [];
  }
}