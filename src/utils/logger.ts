
/**
 * Enhanced logging utility for the application
 * Provides comprehensive logging with configurable levels and formatting
 */

// Logging configuration
interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  includeTimestamps: boolean;
  formatObjects: boolean;
  maxObjectDepth: number;
}

// Log levels in order of severity
type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  log: 1,
  info: 2,
  warn: 3,
  error: 4
};

// Default configuration
const logConfig: LogConfig = {
  enabled: import.meta.env.VITE_ENABLE_LOGS === 'true',
  level: 'debug', // Show all logs by default
  includeTimestamps: true,
  formatObjects: true,
  maxObjectDepth: 3
};

// Helper to format log messages
const formatMessage = (message: any, method: LogLevel): string => {
  if (typeof message !== 'string') {
    try {
      return JSON.stringify(message, null, 2);
    } catch (e) {
      return String(message);
    }
  }
  return message;
};

// Format timestamp for log messages
const getTimestamp = (): string => {
  if (!logConfig.includeTimestamps) return '';
  
  const now = new Date();
  return `[${now.toISOString()}] `;
};

// Helper to check if logging is allowed at the current level
const shouldLog = (level: LogLevel): boolean => {
  if (!logConfig.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[logConfig.level];
};

// Format objects for better logging
const safeStringify = (obj: any, depth = 0): string => {
  if (depth > logConfig.maxObjectDepth) {
    return '[Max depth reached]';
  }
  
  if (obj === null || obj === undefined) {
    return String(obj);
  }
  
  if (typeof obj !== 'object') {
    return String(obj);
  }
  
  try {
    // Handle circular references
    const cache: any[] = [];
    const str = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.includes(value)) {
          return '[Circular Reference]';
        }
        cache.push(value);
        
        // For objects deeper than our max depth
        if (depth >= logConfig.maxObjectDepth) {
          return '[Object]';
        }
      }
      return value;
    }, 2);
    return str;
  } catch (e) {
    return '[Error formatting object]';
  }
};

// Create a logger for a specific method
const createLogger = (consoleMethod: LogLevel) => {
  return (...args: any[]): void => {
    if (!shouldLog(consoleMethod)) return;
    
    const timestamp = getTimestamp();
    const formattedArgs = args.map(arg => {
      if (logConfig.formatObjects && typeof arg === 'object' && arg !== null) {
        return safeStringify(arg);
      }
      return arg;
    });
    
    if (timestamp) {
      console[consoleMethod](timestamp, ...formattedArgs);
    } else {
      console[consoleMethod](...formattedArgs);
    }
  };
};

// Configure the logger
const configure = (config: Partial<LogConfig>): void => {
  Object.assign(logConfig, config);
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

/**
 * Group related log messages
 */
export const group = (label: string, collapsed = false): void => {
  if (!logConfig.enabled) return;
  
  if (collapsed) {
    console.groupCollapsed(label);
  } else {
    console.group(label);
  }
};

/**
 * End a group of log messages
 */
export const groupEnd = (): void => {
  if (!logConfig.enabled) return;
  console.groupEnd();
};

/**
 * Measure time between operations
 */
export const time = (label: string): void => {
  if (!logConfig.enabled) return;
  console.time(label);
};

/**
 * End timing and log the result
 */
export const timeEnd = (label: string): void => {
  if (!logConfig.enabled) return;
  console.timeEnd(label);
};

// Export the logger
const logger = {
  log,
  info,
  warn,
  error,
  debug,
  group,
  groupEnd,
  time,
  timeEnd,
  configure
};

export default logger;
