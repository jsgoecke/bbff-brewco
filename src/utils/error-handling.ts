/**
 * Error handling utilities for the photo sharing site
 */

import type { ApiError } from '../types/index.js';

/** Standard error codes */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** HTTP status codes */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  PARTIAL_CONTENT: 206,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Creates a standardized API error response
 * @param message - Error message
 * @param code - Error code
 * @param status - HTTP status code
 * @param details - Additional error details
 * @returns Response object with error information
 */
export function createErrorResponse(
  message: string,
  code: string = ERROR_CODES.INTERNAL_ERROR,
  status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  details?: Record<string, unknown>
): Response {
  const error: ApiError = {
    message,
    code,
    status,
    ...(details && { details }),
  };

  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Creates a validation error response
 * @param message - Validation error message
 * @param field - Field that failed validation
 * @returns Response with validation error
 */
export function createValidationError(
  message: string,
  field?: string
): Response {
  return createErrorResponse(
    message,
    ERROR_CODES.VALIDATION_FAILED,
    HTTP_STATUS.BAD_REQUEST,
    field ? { field } : undefined
  );
}

/**
 * Creates an upload error response
 * @param message - Upload error message
 * @param filename - File that failed to upload
 * @returns Response with upload error
 */
export function createUploadError(
  message: string,
  filename?: string
): Response {
  return createErrorResponse(
    message,
    ERROR_CODES.UPLOAD_FAILED,
    HTTP_STATUS.BAD_REQUEST,
    filename ? { filename } : undefined
  );
}

/**
 * Creates an unauthorized error response
 * @param message - Authorization error message
 * @returns Response with authorization error
 */
export function createUnauthorizedError(
  message: string = 'Unauthorized access'
): Response {
  return createErrorResponse(
    message,
    ERROR_CODES.UNAUTHORIZED,
    HTTP_STATUS.UNAUTHORIZED
  );
}

/**
 * Creates a rate limit error response
 * @param message - Rate limit message
 * @param retryAfter - Seconds until retry is allowed
 * @returns Response with rate limit error
 */
export function createRateLimitError(
  message: string = 'Rate limit exceeded',
  retryAfter?: number
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  const error: ApiError = {
    message,
    code: ERROR_CODES.RATE_LIMITED,
    status: HTTP_STATUS.RATE_LIMITED,
    ...(retryAfter && { details: { retryAfter } }),
  };

  return new Response(JSON.stringify({ error }), {
    status: HTTP_STATUS.RATE_LIMITED,
    headers,
  });
}

/**
 * Creates a file not found error response
 * @param filename - Name of the file that wasn't found
 * @returns Response with not found error
 */
export function createNotFoundError(filename?: string): Response {
  const message = filename
    ? `File '${filename}' not found`
    : 'Requested resource not found';

  return createErrorResponse(
    message,
    ERROR_CODES.FILE_NOT_FOUND,
    HTTP_STATUS.NOT_FOUND,
    filename ? { filename } : undefined
  );
}

/**
 * Logs error information for monitoring
 * @param error - Error object or message
 * @param context - Additional context information
 * @param env - Environment object for analytics
 */
export function logError(
  error: Error | string,
  context: Record<string, unknown> = {},
  env?: { ANALYTICS?: any }
): void {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'object' ? error.stack : undefined,
    context,
  };

  // Log to console
  console.error('Error:', errorInfo);

  // Send to analytics if available
  if (env?.ANALYTICS) {
    try {
      const analyticsPromise = env.ANALYTICS.writeDataPoint({
        blobs: [
          JSON.stringify({
            type: 'error',
            ...errorInfo,
          }),
        ],
        doubles: [Date.now()],
      });
      
      // Handle promise rejection if it's a promise
      if (analyticsPromise && typeof analyticsPromise.catch === 'function') {
        analyticsPromise.catch((analyticsError: Error) => {
          console.error('Failed to log to analytics:', analyticsError);
        });
      }
    } catch (analyticsError) {
      console.error('Failed to log to analytics:', analyticsError);
    }
  }
}

/**
 * Wraps async functions with error handling
 * @param fn - Function to wrap
 * @returns Wrapped function that handles errors
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R | Response> {
  return async (...args: T): Promise<R | Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error as Error, { function: fn.name, args });
      
      if (error instanceof Response) {
        return error;
      }
      
      return createErrorResponse(
        'An unexpected error occurred',
        ERROR_CODES.INTERNAL_ERROR,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  };
}

/**
 * Validates required environment variables
 * @param env - Environment object to validate
 * @param required - Array of required environment variable names
 * @throws Error if required variables are missing
 */
export function validateEnvironment(
  env: Record<string, unknown>,
  required: string[]
): void {
  const missing = required.filter(key => !env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Handles CORS preflight requests
 * @param request - Incoming request
 * @param allowedOrigins - Array of allowed origins
 * @returns CORS response or null if not a preflight request
 */
export function handleCORS(
  request: Request,
  allowedOrigins: string[] = ['*']
): Response | null {
  const origin = request.headers.get('Origin');
  const method = request.method;

  // Handle preflight requests
  if (method === 'OPTIONS') {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Token',
      'Access-Control-Max-Age': '86400',
    };

    // Set origin header if allowed
    if (allowedOrigins.includes('*')) {
      corsHeaders['Access-Control-Allow-Origin'] = origin || '*';
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    } else if (origin && allowedOrigins.includes(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    } else if (!origin && allowedOrigins.includes('*')) {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return null;
}