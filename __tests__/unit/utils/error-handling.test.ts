import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createErrorResponse,
  createValidationError,
  createUploadError,
  createUnauthorizedError,
  createRateLimitError,
  createNotFoundError,
  logError,
  withErrorHandling,
  validateEnvironment,
  handleCORS,
  ERROR_CODES,
  HTTP_STATUS,
} from '../../../src/utils/error-handling.js';

describe('error-handling utils', () => {
  describe('ERROR_CODES', () => {
    it('should contain all expected error codes', () => {
      expect(ERROR_CODES).toEqual({
        VALIDATION_FAILED: 'VALIDATION_FAILED',
        UPLOAD_FAILED: 'UPLOAD_FAILED',
        FILE_NOT_FOUND: 'FILE_NOT_FOUND',
        UNAUTHORIZED: 'UNAUTHORIZED',
        RATE_LIMITED: 'RATE_LIMITED',
        STORAGE_ERROR: 'STORAGE_ERROR',
        PROCESSING_ERROR: 'PROCESSING_ERROR',
        INVALID_REQUEST: 'INVALID_REQUEST',
        INTERNAL_ERROR: 'INTERNAL_ERROR',
      });
    });
  });

  describe('HTTP_STATUS', () => {
    it('should contain all expected status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.RATE_LIMITED).toBe(429);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with default values', async () => {
      const response = createErrorResponse('Test error');
      
      expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      
      const body = await response.json() as any;
      expect(body.error).toEqual({
        message: 'Test error',
        code: ERROR_CODES.INTERNAL_ERROR,
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      });
    });

    it('should create error response with custom values', async () => {
      const response = createErrorResponse(
        'Custom error',
        ERROR_CODES.VALIDATION_FAILED,
        HTTP_STATUS.BAD_REQUEST,
        { field: 'email' }
      );
      
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      
      const body = await response.json() as any;
      expect(body.error).toEqual({
        message: 'Custom error',
        code: ERROR_CODES.VALIDATION_FAILED,
        status: HTTP_STATUS.BAD_REQUEST,
        details: { field: 'email' },
      });
    });
  });

  describe('createValidationError', () => {
    it('should create validation error without field', async () => {
      const response = createValidationError('Invalid input');
      
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(body.error.message).toBe('Invalid input');
      expect(body.error.details).toBeUndefined();
    });

    it('should create validation error with field', async () => {
      const response = createValidationError('Email is required', 'email');
      
      const body = await response.json() as any;
      expect(body.error.details).toEqual({ field: 'email' });
    });
  });

  describe('createUploadError', () => {
    it('should create upload error without filename', async () => {
      const response = createUploadError('Upload failed');
      
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe(ERROR_CODES.UPLOAD_FAILED);
      expect(body.error.message).toBe('Upload failed');
    });

    it('should create upload error with filename', async () => {
      const response = createUploadError('Upload failed', 'photo.jpg');
      
      const body = await response.json() as any;
      expect(body.error.details).toEqual({ filename: 'photo.jpg' });
    });
  });

  describe('createUnauthorizedError', () => {
    it('should create unauthorized error with default message', async () => {
      const response = createUnauthorizedError();
      
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
      expect(body.error.message).toBe('Unauthorized access');
    });

    it('should create unauthorized error with custom message', async () => {
      const response = createUnauthorizedError('Token expired');
      
      const body = await response.json() as any;
      expect(body.error.message).toBe('Token expired');
    });
  });

  describe('createRateLimitError', () => {
    it('should create rate limit error with default message', async () => {
      const response = createRateLimitError();
      
      expect(response.status).toBe(HTTP_STATUS.RATE_LIMITED);
      expect(response.headers.get('Retry-After')).toBeNull();
      
      const body = await response.json() as any;
      expect(body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
      expect(body.error.message).toBe('Rate limit exceeded');
    });

    it('should create rate limit error with retry after', async () => {
      const response = createRateLimitError('Too many requests', 300);
      
      expect(response.headers.get('Retry-After')).toBe('300');
      
      const body = await response.json() as any;
      expect(body.error.details).toEqual({ retryAfter: 300 });
    });
  });

  describe('createNotFoundError', () => {
    it('should create not found error without filename', async () => {
      const response = createNotFoundError();
      
      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe(ERROR_CODES.FILE_NOT_FOUND);
      expect(body.error.message).toBe('Requested resource not found');
    });

    it('should create not found error with filename', async () => {
      const response = createNotFoundError('photo.jpg');
      
      const body = await response.json() as any;
      expect(body.error.message).toBe("File 'photo.jpg' not found");
      expect(body.error.details).toEqual({ filename: 'photo.jpg' });
    });
  });

  describe('logError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log string error to console', () => {
      logError('Test error message');
      
      expect(console.error).toHaveBeenCalledWith('Error:', expect.objectContaining({
        message: 'Test error message',
        timestamp: expect.any(String),
        context: {},
      }));
    });

    it('should log Error object to console', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test';
      
      logError(error, { userId: 123 });
      
      expect(console.error).toHaveBeenCalledWith('Error:', expect.objectContaining({
        message: 'Test error',
        stack: 'Error: Test error\n    at test',
        context: { userId: 123 },
        timestamp: expect.any(String),
      }));
    });

    it('should send to analytics if available', () => {
      const mockAnalytics = {
        writeDataPoint: vi.fn(),
      };
      const env = { ANALYTICS: mockAnalytics };
      
      logError('Analytics test', { action: 'upload' }, env);
      
      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledWith({
        blobs: [expect.stringMatching(/.*analytics test.*/i)],
        doubles: [expect.any(Number)],
      });
    });

    it('should handle analytics error gracefully', async () => {
      const mockAnalytics = {
        writeDataPoint: vi.fn().mockRejectedValue(new Error('Analytics failed')),
      };
      const env = { ANALYTICS: mockAnalytics };
      
      // Wait a bit for the async analytics call to complete/fail
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(() => logError('Test', {}, env)).not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Error:', expect.any(Object));
    });
  });

  describe('withErrorHandling', () => {
    it('should return result when function succeeds', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const wrappedFn = withErrorHandling(mockFn);
      
      const result = await wrappedFn('arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return error response when function throws Error', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));
      const wrappedFn = withErrorHandling(mockFn);
      
      const result = await wrappedFn();
      
      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });

    it('should return Response when function throws Response', async () => {
      const errorResponse = createValidationError('Invalid input');
      const mockFn = vi.fn().mockRejectedValue(errorResponse);
      const wrappedFn = withErrorHandling(mockFn);
      
      const result = await wrappedFn();
      
      expect(result).toBe(errorResponse);
    });

    it('should log error when function fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));
      const wrappedFn = withErrorHandling(mockFn);
      
      await wrappedFn('arg1');
      
      expect(console.error).toHaveBeenCalledWith('Error:', expect.objectContaining({
        message: 'Test error',
      }));
    });
  });

  describe('validateEnvironment', () => {
    it('should pass when all required variables are present', () => {
      const env = {
        PHOTOS_BUCKET: 'bucket',
        BRANDING_ASSETS: 'kv',
        ENVIRONMENT: 'test',
      };
      
      expect(() => 
        validateEnvironment(env, ['PHOTOS_BUCKET', 'ENVIRONMENT'])
      ).not.toThrow();
    });

    it('should throw when required variables are missing', () => {
      const env = {
        PHOTOS_BUCKET: 'bucket',
      };
      
      expect(() => 
        validateEnvironment(env, ['PHOTOS_BUCKET', 'BRANDING_ASSETS', 'API_KEY'])
      ).toThrow('Missing required environment variables: BRANDING_ASSETS, API_KEY');
    });

    it('should handle empty required array', () => {
      const env = {};
      
      expect(() => validateEnvironment(env, [])).not.toThrow();
    });
  });

  describe('handleCORS', () => {
    it('should return CORS response for OPTIONS request', () => {
      const request = {
        method: 'OPTIONS',
        headers: {
          get: vi.fn().mockReturnValue('https://mysite.com')
        }
      } as any;
      
      const response = handleCORS(request, ['https://mysite.com']);
      
      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(204);
      expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('https://mysite.com');
      expect(response!.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response!.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should allow wildcard origin', () => {
      const request = {
        method: 'OPTIONS',
        headers: {
          get: vi.fn().mockReturnValue('https://anywhere.com')
        }
      } as any;
      
      const response = handleCORS(request, ['*']);
      
      expect(response).toBeInstanceOf(Response);
      expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('https://anywhere.com');
    });

    it('should not allow unauthorized origin', () => {
      const request = {
        method: 'OPTIONS',
        headers: {
          get: vi.fn().mockReturnValue('https://evil.com')
        }
      } as any;
      
      const response = handleCORS(request, ['https://mysite.com']);
      
      expect(response).toBeInstanceOf(Response);
      expect(response!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should return null for non-OPTIONS request', () => {
      const request = {
        method: 'GET',
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      } as any;
      
      const response = handleCORS(request);
      
      expect(response).toBeNull();
    });

    it('should handle request without origin header', () => {
      const request = {
        method: 'OPTIONS',
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      } as any;
      
      const response = handleCORS(request, ['*']);
      
      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(204);
    });
  });
});