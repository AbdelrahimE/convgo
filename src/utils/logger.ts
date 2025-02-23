interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  code?: string;
  details?: any;
  stack?: string;
  context?: Record<string, any>;
}

class Logger {
  private static instance: Logger;
  private logQueue: LogEntry[] = [];
  private isProcessing = false;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  private constructor() {
    // Start periodic flushing
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async flush() {
    if (this.isProcessing || this.logQueue.length === 0) return;

    this.isProcessing = true;
    const logsToProcess = [...this.logQueue];
    this.logQueue = [];

    try {
      // In development, log to console
      if (process.env.NODE_ENV === 'development') {
        logsToProcess.forEach(log => {
          const consoleMethod = log.level === 'error' ? 'error' 
            : log.level === 'warn' ? 'warn'
            : log.level === 'info' ? 'info'
            : 'debug';
          
          console[consoleMethod](
            `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`,
            {
              code: log.code,
              details: log.details,
              stack: log.stack,
              context: log.context
            }
          );
        });
      }

      // In production, you might want to send logs to a service
      if (process.env.NODE_ENV === 'production') {
        // Here you could implement sending logs to a service
        // For now, we'll just keep them in localStorage for debugging
        const existingLogs = JSON.parse(localStorage.getItem('error_logs') || '[]');
        const updatedLogs = [...existingLogs, ...logsToProcess].slice(-1000); // Keep last 1000 logs
        localStorage.setItem('error_logs', JSON.stringify(updatedLogs));
      }
    } catch (error) {
      console.error('Failed to process logs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private addToQueue(entry: LogEntry) {
    this.logQueue.push(entry);
    if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
      this.flush();
    }
  }

  public error(message: string, error?: any, context?: Record<string, any>) {
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      code: error?.code,
      details: error?.details || error?.message,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      context
    };
    this.addToQueue(entry);
  }

  public warn(message: string, details?: any, context?: Record<string, any>) {
    this.addToQueue({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      details,
      context
    });
  }

  public info(message: string, details?: any, context?: Record<string, any>) {
    this.addToQueue({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      details,
      context
    });
  }

  public debug(message: string, details?: any, context?: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
      this.addToQueue({
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        details,
        context
      });
    }
  }

  public getLogs(): LogEntry[] {
    try {
      return JSON.parse(localStorage.getItem('error_logs') || '[]');
    } catch {
      return [];
    }
  }

  public clearLogs() {
    localStorage.removeItem('error_logs');
  }
}

export const logger = Logger.getInstance();
