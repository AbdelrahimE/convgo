/**
 * Shared logger utility for Edge Functions
 * Provides type-safe logging functionality across all edge functions
 */

// Type-safe logger interface
export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Creates a type-safe logger for edge functions
 * Uses unknown[] instead of any[] for better type safety
 */
export const createLogger = (): Logger => ({
  log: (...args: unknown[]) => console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  debug: (...args: unknown[]) => console.debug(...args),
});

// Default logger instance that can be imported directly
export const logger = createLogger();