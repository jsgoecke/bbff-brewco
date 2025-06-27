import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  onRequestGet,
  onRequestPost,
  onRequestOptions,
  onRequestHead
} from '../../../functions/api/images/[key].js';
import type { Env } from '../../../src/types/index.js';

// Extended Env type for testing with Images API
interface TestEnv extends Env {
  IMAGES?: any;
}

describe('images API', () => {
  let mockEnv: TestEnv;
  let mockContext: any;
  let mockRequest: Request;
  let mockWaitUntil: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      PHOTOS_BUCKET: {
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
        head: vi.fn(),
      },
      BRANDING_ASSETS: {
        get: vi.fn(),
      },
      ANALYTICS: {
        writeDataPoint: vi.fn().mockResolvedValue(undefined),
      },
      IMAGES: {
        input: vi.fn().mockReturnThis(),
        transform: vi.fn().mockReturnThis(),
        output: vi.fn().mockReturnThis(),
        draw: vi.fn().mockReturnThis(),
        response: vi.fn().mockResolvedValue(new Response('processed image', {
          headers: { 'Content-Type': 'image/jpeg' },
        })),
      },
      ENVIRONMENT: 'test',
      MAX_UPLOAD_SIZE: '10485760',
      UPLOAD_RATE_LIMIT: '100',
      CACHE_TTL: '604800',
    } as any;

    mockWaitUntil = vi.fn();

    mockContext = {
      env: mockEnv,
      waitUntil: mockWaitUntil,
      params: {},
    };

    // Mock cache API
    global.caches = {
      default: {
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onRequestGet', () => {
    it('should serve image with default parameters', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        size: 1024,
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test-image.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test-image.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('X-Cache')).toBe('MISS');

      expect(mockEnv.PHOTOS_BUCKET.get).toHaveBeenCalledWith('25thAnniversary/test-image.jpg');
    });

    it('should handle image with processing parameters', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        size: 1024,
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg?w=800&h=600&q=85&watermark=true', {
        headers: { Accept: 'image/webp,image/jpeg' },
      });
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      expect(mockEnv.IMAGES.transform).toHaveBeenCalledWith({
        width: 800,
        height: 600,
        quality: 85,
      });

      expect(mockEnv.IMAGES.output).toHaveBeenCalledWith({
        format: 'jpeg',
        quality: 85,
      });
    });

    it('should disable watermarks when requested', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg?watermark=false');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      // Should not call BRANDING_ASSETS when watermark=false
      expect(mockEnv.BRANDING_ASSETS.get).not.toHaveBeenCalled();
    });

    it('should apply watermarks by default', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.BRANDING_ASSETS.get as any)
        .mockResolvedValueOnce(new ArrayBuffer(512)) // BBFF logo
        .mockResolvedValueOnce(new ArrayBuffer(512)); // HMB logo

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      expect(mockEnv.BRANDING_ASSETS.get).toHaveBeenCalledWith('bbff-logo.png', 'arrayBuffer');
      expect(mockEnv.BRANDING_ASSETS.get).toHaveBeenCalledWith('hmb-logo.png', 'arrayBuffer');
    });

    it('should return 404 for non-existent image', async () => {
      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(null);

      mockRequest = new Request('https://example.com/api/images/nonexistent.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'nonexistent.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(404);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('FILE_NOT_FOUND');
      expect(body.error.message).toContain('nonexistent.jpg');
    });

    it('should handle missing key parameter', async () => {
      mockRequest = new Request('https://example.com/api/images/');
      mockContext.request = mockRequest;
      mockContext.params = {}; // No key

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(404);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should validate processing options', async () => {
      mockRequest = new Request('https://example.com/api/images/test.jpg?w=5000'); // Invalid width
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('Width must be between 1 and 4000');
    });

    it('should serve cached image when available', async () => {
      const cachedResponse = new Response('cached image', {
        headers: { 'Content-Type': 'image/jpeg' },
      });

      ((global.caches as any).default.match as any).mockResolvedValue(cachedResponse);

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.headers.get('X-Cache')).toBe('HIT');
      expect(mockEnv.PHOTOS_BUCKET.get).not.toHaveBeenCalled();
    });

    it('should cache processed image', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      expect(mockWaitUntil).toHaveBeenCalled();
      expect(((global.caches as any).default.put)).toHaveBeenCalled();
    });

    it('should handle image processing errors', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);
      (mockEnv.IMAGES.response as any).mockResolvedValue(new Response('error', { status: 500 }));

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.error.message).toBe('Image processing failed');
    });

    it('should handle missing PHOTOS_BUCKET configuration', async () => {
      mockEnv.PHOTOS_BUCKET = undefined as any;

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(503);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('STORAGE_ERROR');
    });

    it('should handle images with full event prefix in key', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/25thAnniversary/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: '25thAnniversary/test.jpg' };

      await onRequestGet(mockContext);

      // Should not double-prefix
      expect(mockEnv.PHOTOS_BUCKET.get).toHaveBeenCalledWith('25thAnniversary/test.jpg');
    });

    it('should log image serving to analytics', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      expect(mockWaitUntil).toHaveBeenCalled();
      // Analytics logging happens asynchronously via waitUntil
    });

    it('should handle CORS preflight requests', async () => {
      const mockRequest = {
        method: 'OPTIONS',
        url: 'https://example.com/api/images/test.jpg',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'Origin') return 'https://mysite.com';
            if (header === 'Access-Control-Request-Method') return 'GET';
            return null;
          }),
        },
      };

      const mockContext = {
        request: mockRequest,
        env: mockEnv,
        params: { key: 'test.jpg' },
        waitUntil: vi.fn(),
      };

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should detect optimal format based on Accept header', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      // Test WebP support
      mockRequest = new Request('https://example.com/api/images/test.jpg', {
        headers: { Accept: 'image/webp,image/jpeg' },
      });
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      await onRequestGet(mockContext);

      expect(mockEnv.IMAGES.output).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'jpeg' })
      );
    });

    it('should include processing options in response headers', async () => {
      const mockR2Object = {
        body: new ReadableStream(),
      };

      (mockEnv.PHOTOS_BUCKET.get as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg?w=800&q=90');
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestGet(mockContext);

      expect(response.headers.get('X-Original-Key')).toBe('25thAnniversary/test.jpg');
      expect(response.headers.get('X-Processing-Options')).toBeTruthy();
    });
  });

  describe('onRequestHead', () => {
    it('should return image metadata headers', async () => {
      const mockR2Object = {
        size: 1024000,
        uploaded: new Date('2024-01-01T12:00:00Z'),
        httpMetadata: { contentType: 'image/jpeg' },
      };

      (mockEnv.PHOTOS_BUCKET.head as any).mockResolvedValue(mockR2Object);

      mockRequest = new Request('https://example.com/api/images/test.jpg', {
        method: 'HEAD',
      });
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestHead(mockContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      expect(response.headers.get('Content-Length')).toBe('1024000');
      expect(response.headers.get('Last-Modified')).toBe('Mon, 01 Jan 2024 12:00:00 GMT');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

      expect(mockEnv.PHOTOS_BUCKET.head).toHaveBeenCalledWith('25thAnniversary/test.jpg');
    });

    it('should return 404 for non-existent image', async () => {
      (mockEnv.PHOTOS_BUCKET.head as any).mockResolvedValue(null);

      mockRequest = new Request('https://example.com/api/images/nonexistent.jpg', {
        method: 'HEAD',
      });
      mockContext.request = mockRequest;
      mockContext.params = { key: 'nonexistent.jpg' };

      const response = await onRequestHead(mockContext);

      expect(response.status).toBe(404);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should handle missing key parameter', async () => {
      mockRequest = new Request('https://example.com/api/images/', {
        method: 'HEAD',
      });
      mockContext.request = mockRequest;
      mockContext.params = {};

      const response = await onRequestHead(mockContext);

      expect(response.status).toBe(404);
    });

    it('should handle R2 head errors', async () => {
      (mockEnv.PHOTOS_BUCKET.head as any).mockRejectedValue(new Error('R2 error'));

      mockRequest = new Request('https://example.com/api/images/test.jpg', {
        method: 'HEAD',
      });
      mockContext.request = mockRequest;
      mockContext.params = { key: 'test.jpg' };

      const response = await onRequestHead(mockContext);

      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.error.message).toBe('Failed to get image metadata');
    });
  });

  describe('onRequestPost', () => {
    it('should return method not allowed error', async () => {
      const response = await onRequestPost();

      expect(response.status).toBe(405);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  describe('onRequestOptions', () => {
    it('should handle CORS preflight', async () => {
      const mockRequest = {
        method: 'OPTIONS',
        url: 'https://example.com/api/images/test.jpg',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'Origin') return 'https://mysite.com';
            return null;
          }),
        },
      };
      const mockContext = { request: mockRequest, env: mockEnv };

      const response = await onRequestOptions(mockContext);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
  });
});