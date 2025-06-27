import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestPost, onRequestOptions } from '../../../functions/api/list.js';
import type { Env } from '../../../src/types/index.js';

describe('list API', () => {
  let mockEnv: Env;
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

  describe('onRequestGet', () => {
    it('should return list of photos with default parameters', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/photo1.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T10:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'photo1.jpg' },
        },
        {
          key: '25thAnniversary/photo2.png',
          size: 2048,
          uploaded: new Date('2024-01-01T11:00:00Z'),
          httpMetadata: { contentType: 'image/png' },
          customMetadata: { originalName: 'photo2.png' },
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
        cursor: null,
      });

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=30');

      const body = await response.json() as any;
      expect(body.photos).toHaveLength(2);
      expect(body.hasMore).toBe(false);
      expect(body.total).toBe(2);

      expect(body.photos[0]).toMatchObject({
        key: '25thAnniversary/photo2.png', // Newest first by default
        filename: 'photo2.png',
        size: 2048,
        contentType: 'image/png',
        uploadedAt: '2024-01-01T11:00:00.000Z',
      });

      expect(mockEnv.PHOTOS_BUCKET.list).toHaveBeenCalledWith({
        prefix: '25thAnniversary/',
        limit: 50,
      });
    });

    it('should handle custom query parameters', async () => {
      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: [],
        truncated: true,
        cursor: 'next-cursor',
      });

      mockRequest = new Request('https://example.com/api/list?limit=25&cursor=abc123&sort=oldest');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(mockEnv.PHOTOS_BUCKET.list).toHaveBeenCalledWith({
        prefix: '25thAnniversary/',
        limit: 25,
        cursor: 'abc123',
      });

      const body = await response.json() as any;
      expect(body.hasMore).toBe(true);
      expect(body.cursor).toBe('next-cursor');
    });

    it('should enforce maximum limit', async () => {
      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: [],
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list?limit=150');
      mockContext.request = mockRequest;

      await onRequestGet(mockContext);

      expect(mockEnv.PHOTOS_BUCKET.list).toHaveBeenCalledWith({
        prefix: '25thAnniversary/',
        limit: 100, // Should be capped at 100
      });
    });

    it('should sort photos by oldest', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/photo1.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T11:00:00Z'), // Newer
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'photo1.jpg' },
        },
        {
          key: '25thAnniversary/photo2.jpg',
          size: 2048,
          uploaded: new Date('2024-01-01T10:00:00Z'), // Older
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'photo2.jpg' },
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list?sort=oldest');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);
      const body = await response.json() as any;

      expect(body.photos[0].key).toBe('25thAnniversary/photo2.jpg'); // Oldest first
      expect(body.photos[1].key).toBe('25thAnniversary/photo1.jpg');
    });

    it('should sort photos by name', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/zebra.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T10:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'zebra.jpg' },
        },
        {
          key: '25thAnniversary/apple.jpg',
          size: 2048,
          uploaded: new Date('2024-01-01T11:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'apple.jpg' },
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list?sort=name');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);
      const body = await response.json() as any;

      expect(body.photos[0].filename).toBe('apple.jpg'); // Alphabetical order
      expect(body.photos[1].filename).toBe('zebra.jpg');
    });

    it('should sort photos by size', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/small.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T10:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'small.jpg' },
        },
        {
          key: '25thAnniversary/large.jpg',
          size: 5120,
          uploaded: new Date('2024-01-01T11:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { originalName: 'large.jpg' },
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list?sort=size');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);
      const body = await response.json() as any;

      expect(body.photos[0].filename).toBe('large.jpg'); // Largest first
      expect(body.photos[1].filename).toBe('small.jpg');
    });

    it('should handle empty results', async () => {
      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: null,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.photos).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('should handle missing PHOTOS_BUCKET configuration', async () => {
      mockEnv.PHOTOS_BUCKET = undefined as any;

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(503);
      
      const body = await response.json() as any;
      expect(body.error.code).toBe('STORAGE_ERROR');
    });

    it('should handle R2 list errors', async () => {
      (mockEnv.PHOTOS_BUCKET.list as any).mockRejectedValue(new Error('R2 error'));

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.error.message).toBe('Failed to list photos');
    });

    it('should parse custom metadata dimensions', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/photo.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T10:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { 
            originalName: 'photo.jpg',
            dimensions: JSON.stringify({ width: 1920, height: 1080 }),
          },
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);
      const body = await response.json() as any;

      expect(body.photos[0].dimensions).toEqual({
        width: 1920,
        height: 1080,
      });
    });

    it('should handle missing custom metadata gracefully', async () => {
      const mockR2Objects = [
        {
          key: '25thAnniversary/legacy-photo.jpg',
          size: 1024,
          uploaded: new Date('2024-01-01T10:00:00Z'),
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: {}, // Missing originalName
        },
      ];

      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: mockR2Objects,
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);
      const body = await response.json() as any;

      expect(body.photos[0].filename).toBe('legacy-photo.jpg'); // Falls back to key filename
    });

    it('should log gallery view to analytics', async () => {
      (mockEnv.PHOTOS_BUCKET.list as any).mockResolvedValue({
        objects: [
          {
            key: '25thAnniversary/photo.jpg',
            size: 1024,
            uploaded: new Date(),
            httpMetadata: { contentType: 'image/jpeg' },
            customMetadata: { originalName: 'photo.jpg' },
          },
        ],
        truncated: false,
      });

      mockRequest = new Request('https://example.com/api/list');
      mockContext.request = mockRequest;

      await onRequestGet(mockContext);

      expect(mockWaitUntil).toHaveBeenCalled();
      // Analytics logging happens asynchronously via waitUntil
    });

    it('should handle CORS preflight requests', async () => {
      const mockRequest = {
        method: 'OPTIONS',
        url: 'https://example.com/api/list',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'Origin') return 'https://mysite.com';
            if (header === 'Access-Control-Request-Method') return 'GET';
            return null;
          }),
        },
      };
      mockContext.request = mockRequest;

      const response = await onRequestGet(mockContext);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
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
        url: 'https://example.com/api/list',
        headers: {
          get: vi.fn().mockImplementation((header: string) => {
            if (header === 'Origin') return 'https://mysite.com';
            if (header === 'Access-Control-Request-Method') return 'GET';
            return null;
          }),
        },
      };
      mockContext = { request: mockRequest, env: mockEnv };

      const response = await onRequestOptions(mockContext);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should return 204 for non-CORS requests', async () => {
      mockRequest = new Request('https://example.com/api/list', {
        method: 'OPTIONS',
      });
      mockContext = { request: mockRequest, env: mockEnv };

      const response = await onRequestOptions(mockContext);

      expect(response.status).toBe(204);
    });
  });
});