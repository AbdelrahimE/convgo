import { logger } from './logger';

export const ErrorCodes = {
  // File Management Errors (1000-1999)
  FILE_UPLOAD_FAILED: '1001',
  FILE_SIZE_EXCEEDED: '1002',
  FILE_TYPE_NOT_SUPPORTED: '1003',
  FILE_VALIDATION_FAILED: '1004',
  FILE_EXTRACTION_FAILED: '1005',
  FILE_METADATA_UPDATE_FAILED: '1006',
  FILE_DELETE_FAILED: '1007',
  FILE_NOT_FOUND: '1008',

  // Authentication Errors (2000-2999)
  AUTH_INVALID_CREDENTIALS: '2001',
  AUTH_SESSION_EXPIRED: '2002',
  AUTH_UNAUTHORIZED: '2003',
  AUTH_TOKEN_INVALID: '2004',

  // Network Errors (3000-3999)
  NETWORK_OFFLINE: '3001',
  NETWORK_TIMEOUT: '3002',
  NETWORK_REQUEST_FAILED: '3003',

  // API Errors (4000-4999)
  API_RATE_LIMIT: '4001',
  API_SERVER_ERROR: '4002',
  API_INVALID_RESPONSE: '4003',

  // Validation Errors (5000-5999)
  VALIDATION_REQUIRED_FIELD: '5001',
  VALIDATION_INVALID_FORMAT: '5002',
  VALIDATION_CONSTRAINT_FAILED: '5003',

  // Database Errors (6000-6999)
  DB_CONNECTION_FAILED: '6001',
  DB_QUERY_FAILED: '6002',
  DB_CONSTRAINT_VIOLATION: '6003',

  // General Errors (9000-9999)
  UNKNOWN_ERROR: '9001',
  OPERATION_FAILED: '9002',
  INVALID_STATE: '9003',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

interface ErrorDetails {
  code: string;
  message: string;
  details?: string;
  help?: string;
}

const ErrorMessages: Record<string, ErrorDetails> = {
  [ErrorCodes.FILE_UPLOAD_FAILED]: {
    code: ErrorCodes.FILE_UPLOAD_FAILED,
    message: 'Failed to upload file',
    details: 'The file could not be uploaded to the server',
    help: 'Please try again or contact support if the problem persists',
  },
  [ErrorCodes.FILE_SIZE_EXCEEDED]: {
    code: ErrorCodes.FILE_SIZE_EXCEEDED,
    message: 'File size too large',
    details: 'The file exceeds the maximum allowed size of 10MB',
    help: 'Please reduce the file size and try again',
  },
  [ErrorCodes.FILE_TYPE_NOT_SUPPORTED]: {
    code: ErrorCodes.FILE_TYPE_NOT_SUPPORTED,
    message: 'File type not supported',
    details: 'Only PDF, DOC, DOCX, TXT, and CSV files are supported',
    help: 'Please upload a file in one of the supported formats',
  },
  // ... Add more error messages for other codes
};

export class AppError extends Error {
  code: string;
  details?: string;
  help?: string;

  constructor(code: ErrorCode | string, customMessage?: string) {
    const errorDetails = ErrorMessages[code] || {
      code,
      message: 'An unknown error occurred',
      details: customMessage,
    };

    super(customMessage || errorDetails.message);
    this.name = 'AppError';
    this.code = errorDetails.code;
    this.details = errorDetails.details;
    this.help = errorDetails.help;

    // Log the error when it's created
    logger.error(this.message, {
      code: this.code,
      details: this.details,
      help: this.help,
      stack: this.stack
    });
  }
}

export function getErrorDetails(error: unknown): ErrorDetails {
  const details = error instanceof AppError
    ? {
        code: error.code,
        message: error.message,
        details: error.details,
        help: error.help,
      }
    : error instanceof Error
    ? {
        code: ErrorCodes.UNKNOWN_ERROR,
        message: error.message,
        details: error.stack,
      }
    : {
        code: ErrorCodes.UNKNOWN_ERROR,
        message: 'An unknown error occurred',
        details: String(error),
      };

  // Log all error details
  logger.error(details.message, details);

  return details;
}

export function createError(code: ErrorCode, customMessage?: string): AppError {
  return new AppError(code, customMessage);
}
