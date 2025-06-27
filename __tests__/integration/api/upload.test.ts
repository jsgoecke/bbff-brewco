import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../../../functions/api/upload.js';
import type { Env } from '../../../src/types/index.js';

describe('upload API', () => {
  let mockEnv: Env;
  let mockContext: any;
  let mockRequest: Request;
  let mockWaitUntil: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      PHOTOS_BUCKET: {
        put: vi.fn().mockResolvedValue(undefined),
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
      ENVIRONMENT: 'test',
      MAX_UPLOAD_SIZE: '10485760',
      UPLOAD_RATE_LIMIT: '100',
      CACHE_TTL: '3600',
    } as any;

    mockWaitUntil = vi.fn();

    mockContext = {
      env: mockEnv,
      waitUntil: mockWaitUntil,
      params: {},
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onRequestPost', () => {
    it('should upload valid files successfully', async () => {
      const mockFile = new File(['test image data'], 'test.jpg', {
        type: 'image/jpeg',
      });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      Object.defineProperty(mockFile, 'stream', {
        value: () => new ReadableStream()
      });

      // Mock magic bytes validation
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
        }),
        configurable: true
      });

      const formData = new FormData();
      formData.append('photos', mockFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(201);
      
      const body = await response.json() as any;
      expect(body.success).toBe(true);
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0]).toMatchObject({
        filename: expect.stringContaining('test'),
        size: 1024,
        contentType: 'image/jpeg',
        key: expect.stringMatching(/25thAnniversary\/.+\.jpg$/),
      });

      expect(mockEnv.PHOTOS_BUCKET.put).toHaveBeenCalledWith(
        expect.stringMatching(/25thAnniversary\/.+\.jpg$/),
        expect.any(ReadableStream),
        expect.objectContaining({
          httpMetadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000',
          },
          customMetadata: expect.objectContaining({
            originalName: 'test.jpg',
            size: '1024',
          }),
        })
      );
    });

    it('should reject files without authentication', async () => {
      // Set environment to development to trigger auth check
      mockEnv.ENVIRONMENT = 'development';
      
      const formData = new FormData();
      
      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            // No X-Upload-Token header
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject files exceeding size limit', async () => {
      const largeFile = new File(['test'], 'large.jpg', { type: 'image/jpeg' });
      Object.defineProperty(largeFile, 'size', { value: 20 * 1024 * 1024 }); // 20MB

      const formData = new FormData();
      formData.append('photos', largeFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('exceeds maximum allowed size');
    });

    it('should reject unsupported file types', async () => {
      const textFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(textFile, 'size', { value: 1024 });

      const formData = new FormData();
      formData.append('photos', textFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('is not allowed');
    });

    it('should handle multiple files with mixed validation results', async () => {
      const validFile = new File(['valid'], 'valid.jpg', { type: 'image/jpeg' });
      Object.defineProperty(validFile, 'size', { value: 1024 });
      Object.defineProperty(validFile, 'stream', { 
        value: () => new ReadableStream() 
      });

      const invalidFile = new File(['invalid'], 'invalid.txt', { type: 'text/plain' });
      Object.defineProperty(invalidFile, 'size', { value: 1024 });

      // Mock magic bytes for valid file
      Object.defineProperty(validFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
        }),
        configurable: true
      });

      const formData = new FormData();
      formData.append('photos', validFile);
      formData.append('photos', invalidFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('invalid.txt');
    });

    it('should handle R2 upload failures gracefully', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      Object.defineProperty(mockFile, 'stream', { 
        value: () => new ReadableStream() 
      });

      // Mock magic bytes validation
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn(),
        configurable: true
      });
      (mockFile.slice as any).mockReturnValue({
        arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
      } as any);

      // Mock R2 failure
      (mockEnv.PHOTOS_BUCKET.put as any).mockRejectedValue(new Error('R2 upload failed'));

      const formData = new FormData();
      formData.append('photos', mockFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(206); // Partial content due to some failures
      
      const body = await response.json() as any;
      expect(body.success).toBe(false);
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].filename).toBe('test.jpg');
    });

    it('should handle missing PHOTOS_BUCKET configuration', async () => {
      mockEnv.PHOTOS_BUCKET = undefined as any;

      mockRequest = new Request('https://example.com/api/upload', {
        method: 'POST',
        body: new FormData(),
      });

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(503);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('STORAGE_ERROR');
    });

    it('should handle rate limiting', async () => {
      // Mock multiple rapid requests from same IP
      const mockIP = '192.168.1.1';
      
      // Create a valid file for rate limiting test
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      Object.defineProperty(mockFile, 'stream', {
        value: () => new ReadableStream()
      });
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
        }),
        configurable: true
      });

      const formData = new FormData();
      formData.append('photos', mockFile);
      
      for (let i = 0; i < 101; i++) {
        mockRequest = {
          method: 'POST',
          headers: {
            get: vi.fn().mockImplementation((header: string) => {
              if (header === 'X-Upload-Token') return 'dev-upload-token';
              if (header === 'CF-Connecting-IP') return mockIP;
              if (header === 'Origin') return 'https://example.com';
              return null;
            }),
          },
          formData: vi.fn().mockResolvedValue(formData),
        };

        mockContext.request = mockRequest;
        
        if (i < 100) {
          // First 100 should be allowed
          await onRequestPost(mockContext);
        } else {
          // 101st should be rate limited
          const response = await onRequestPost(mockContext);
          expect(response.status).toBe(429);
          
          const body = await response.json() as any;
          expect(body.error.code).toBe('RATE_LIMITED');
          expect(response.headers.get('Retry-After')).toBeTruthy();
          break;
        }
      }
    });

    it('should handle CORS preflight requests', async () => {
      mockRequest = {
        method: 'OPTIONS',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'Origin') return 'https://mysite.com';
            if (header === 'Access-Control-Request-Method') return 'POST';
            return null;
          }),
        },
        formData: vi.fn(),
      };

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy();
    });

    it('should handle empty file upload', async () => {
      mockRequest = new Request('https://example.com/api/upload', {
        method: 'POST',
        body: new FormData(), // Empty form data
        headers: { 'X-Upload-Token': 'dev-upload-token' },
      });

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('No files provided');
    });

    it('should log successful uploads to analytics', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      Object.defineProperty(mockFile, 'stream', { 
        value: () => new ReadableStream() 
      });

      // Mock magic bytes validation
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn(),
        configurable: true
      });
      (mockFile.slice as any).mockReturnValue({
        arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
      } as any);

      const formData = new FormData();
      formData.append('photos', mockFile);

      mockRequest = {
        method: 'POST',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'X-Upload-Token') return 'dev-upload-token';
            if (header === 'Origin') return 'https://example.com';
            return null;
          }),
        },
        formData: vi.fn().mockResolvedValue(formData),
      };

      mockContext.request = mockRequest;

      await onRequestPost(mockContext);

      expect(mockWaitUntil).toHaveBeenCalled();
      // Analytics logging happens asynchronously via waitUntil
    });

    it('should validate production authentication with Cloudflare Access', async () => {
      mockEnv.ENVIRONMENT = 'production';

      mockRequest = new Request('https://example.com/api/upload', {
        method: 'POST',
        body: new FormData(),
        // Missing Cf-Access-Jwt-Assertion header
      });

      mockContext.request = mockRequest;

      const response = await onRequestPost(mockContext);

      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });
  });
});