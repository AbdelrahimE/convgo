
/**
 * Simplified logging utility for the application
 * Uses a single environment variable to control all logging behavior
 */

// Single control variable for all logging
const loggingEnabled = import.meta.env.VITE_ENABLE_LOGS === 'true';

// Console output will only appear if VITE_ENABLE_LOGS=true
const createLogger = (consoleMethod: keyof Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>) => {
  return (...args: any[]): void => {
    if (loggingEnabled) {
      // Fix: Access console methods correctly using bracket notation
      console[consoleMethod](...args);
    }
  };
};

/**
 * Log a message using console.log
 */
export const log = createLogger('log');

/**
 * Log an informational message using console.info
 */
export const info = createLogger('info');

/**
 * Log a warning message using console.warn
 */
export const warn = createLogger('warn');

/**
 * Log an error message using console.error
 */
export const error = createLogger('error');

/**
 * Log a debug message using console.debug
 */
export const debug = createLogger('debug');

const logger = {
  log,
  info,
  warn,
  error,
  debug,
};

export default logger;
