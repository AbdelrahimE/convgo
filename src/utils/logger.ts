
/**
 * Centralized logging utility for the application
 * Provides environment-aware logging functions that can be toggled in production
 */

const isProduction = import.meta.env.PROD;
const isLoggingEnabled = import.meta.env.VITE_ENABLE_LOGS === 'false';

/**
 * Log a message to the console (only in development or if enabled in production)
 * @param args - Arguments to pass to console.log
 */
export const log = (...args: any[]): void => {
  if (!isProduction || isLoggingEnabled) {
    console.log(...args);
  }
};

/**
 * Log an informational message to the console
 * @param args - Arguments to pass to console.info
 */
export const info = (...args: any[]): void => {
  if (!isProduction || isLoggingEnabled) {
    console.info(...args);
  }
};

/**
 * Log a warning message to the console
 * @param args - Arguments to pass to console.warn
 */
export const warn = (...args: any[]): void => {
  if (!isProduction || isLoggingEnabled) {
    console.warn(...args);
  }
};

/**
 * Log an error message to the console (always displayed)
 * @param args - Arguments to pass to console.error
 */
export const error = (...args: any[]): void => {
  // Errors are always logged, even in production
  console.error(...args);
};

/**
 * Log a debug message to the console (only in development)
 * @param args - Arguments to pass to console.debug
 */
export const debug = (...args: any[]): void => {
  if (!isProduction || isLoggingEnabled) {
    console.debug(...args);
  }
};

const logger = {
  log,
  info,
  warn,
  error,
  debug,
};

export default logger;
