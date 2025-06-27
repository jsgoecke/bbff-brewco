import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processImage,
  generateThumbnailUrl,
  generateResponsiveUrls,
  extractImageMetadata,
  optimizeForWeb,
  createCacheKey,
  validateProcessingOptions,
  getOptimalFormat,
  calculateResponsiveDimensions,
} from '../../../src/utils/image-processing.js';

describe('image-processing utils', () => {
  let mockEnv: any;
  let mockImages: any;
  let mockBrandingAssets: any;

  beforeEach(() => {
    mockImages = {
      input: vi.fn().mockReturnThis(),
      transform: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      response: vi.fn().mockResolvedValue(new Response('processed image')),
    };

    mockBrandingAssets = {
      get: vi.fn(),
    };

    mockEnv = {
      IMAGES: mockImages,
      BRANDING_ASSETS: mockBrandingAssets,
      CACHE_TTL: '3600',
    };
  });

  describe('processImage', () => {
    it('should process image with basic options', async () => {
      const imageData = new ArrayBuffer(1024);
      const options = { width: 800, quality: 90 };

      const result = await processImage(imageData, options, mockEnv);

      expect(mockImages.input).toHaveBeenCalledWith(imageData);
      expect(mockImages.transform).toHaveBeenCalledWith({
        width: 800,
        quality: 90,
      });
      expect(mockImages.output).toHaveBeenCalledWith({ quality: 90 });
      expect(result).toBeInstanceOf(Response);
    });

    it('should process image with watermarks', async () => {
      mockBrandingAssets.get
        .mockResolvedValueOnce(new ArrayBuffer(512)) // BBFF logo
        .mockResolvedValueOnce(new ArrayBuffer(512)); // HMB logo

      const imageData = new ArrayBuffer(1024);
      const options = { width: 800, watermark: true };

      await processImage(imageData, options, mockEnv);

      expect(mockBrandingAssets.get).toHaveBeenCalledWith('bbff-logo.png', 'arrayBuffer');
      expect(mockBrandingAssets.get).toHaveBeenCalledWith('hmb-logo.png', 'arrayBuffer');
      expect(mockImages.draw).toHaveBeenCalledTimes(2);
    });

    it('should handle missing watermark assets gracefully', async () => {
      mockBrandingAssets.get.mockResolvedValue(null);

      const imageData = new ArrayBuffer(1024);
      const options = { watermark: true };

      const result = await processImage(imageData, options, mockEnv);

      expect(result).toBeInstanceOf(Response);
      expect(mockImages.draw).not.toHaveBeenCalled();
    });

    it('should throw error when Images binding is not available', async () => {
      const envWithoutImages = { BRANDING_ASSETS: mockBrandingAssets };
      const imageData = new ArrayBuffer(1024);

      await expect(
        processImage(imageData, {}, envWithoutImages)
      ).rejects.toThrow('Images binding not available');
    });

    it('should handle image processing errors', async () => {
      mockImages.response.mockRejectedValue(new Error('Processing failed'));

      const imageData = new ArrayBuffer(1024);

      await expect(
        processImage(imageData, {}, mockEnv)
      ).rejects.toThrow('Processing failed');
    });

    it('should apply height and format options', async () => {
      const imageData = new ArrayBuffer(1024);
      const options = { height: 600, format: 'webp' as const };

      await processImage(imageData, options, mockEnv);

      expect(mockImages.transform).toHaveBeenCalledWith({ height: 600 });
      expect(mockImages.output).toHaveBeenCalledWith({ format: 'webp' });
    });
  });

  describe('generateThumbnailUrl', () => {
    it('should generate thumbnail URL with default parameters', () => {
      const url = generateThumbnailUrl('test-image.jpg');
      expect(url).toBe('/cdn-cgi/image/width=300,quality=85/api/images/test-image.jpg');
    });

    it('should generate thumbnail URL with custom parameters', () => {
      const url = generateThumbnailUrl('test-image.jpg', 150, 75);
      expect(url).toBe('/cdn-cgi/image/width=150,quality=75/api/images/test-image.jpg');
    });
  });

  describe('generateResponsiveUrls', () => {
    it('should generate responsive URLs for all sizes', () => {
      const urls = generateResponsiveUrls('test-image.jpg');

      expect(urls).toEqual({
        thumbnail: '/cdn-cgi/image/width=150,quality=80/api/images/test-image.jpg',
        small: '/cdn-cgi/image/width=400,quality=85/api/images/test-image.jpg',
        medium: '/cdn-cgi/image/width=800,quality=90/api/images/test-image.jpg',
        large: '/cdn-cgi/image/width=1200,quality=95/api/images/test-image.jpg',
        original: '/api/images/test-image.jpg',
      });
    });
  });

  describe('extractImageMetadata', () => {
    it('should extract image dimensions', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      // Mock Image constructor
      const mockImage = {
        onload: null as any,
        onerror: null as any,
        naturalWidth: 1920,
        naturalHeight: 1080,
        src: '',
      };

      // Mock URL.createObjectURL
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

      // Mock Image constructor
      vi.stubGlobal('Image', vi.fn(() => mockImage));

      const metadataPromise = extractImageMetadata(mockFile);
      
      // Simulate image load
      setTimeout(() => {
        if (mockImage.onload) mockImage.onload();
      }, 0);

      const metadata = await metadataPromise;

      expect(metadata.dimensions).toEqual({
        width: 1920,
        height: 1080,
      });
    });

    it('should handle image load error', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      const mockImage = {
        onload: null as any,
        onerror: null as any,
        src: '',
      };

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.stubGlobal('Image', vi.fn(() => mockImage));

      const metadataPromise = extractImageMetadata(mockFile);
      
      // Simulate image error
      setTimeout(() => {
        if (mockImage.onerror) mockImage.onerror();
      }, 0);

      const metadata = await metadataPromise;

      expect(metadata).toEqual({});
    });
  });

  describe('optimizeForWeb', () => {
    it('should optimize image for web delivery', async () => {
      const mockResponse = new Response('optimized image');
      mockResponse.headers.set('content-length', '400000'); // 400KB

      mockImages.response.mockResolvedValue(mockResponse);

      const imageData = new ArrayBuffer(1024);
      const result = await optimizeForWeb(imageData, 500, mockEnv);

      expect(mockImages.transform).toHaveBeenCalledWith({ quality: 95 });
      expect(mockImages.output).toHaveBeenCalledWith({ format: 'jpeg' });
      expect(result).toBe(mockResponse);
    });

    it('should reduce quality if image is too large', async () => {
      const largeMockResponse = new Response('large image');
      largeMockResponse.headers.set('content-length', '600000'); // 600KB

      const smallMockResponse = new Response('optimized image');
      smallMockResponse.headers.set('content-length', '400000'); // 400KB

      mockImages.response
        .mockResolvedValueOnce(largeMockResponse)
        .mockResolvedValueOnce(smallMockResponse);

      const imageData = new ArrayBuffer(1024);
      await optimizeForWeb(imageData, 500, mockEnv);

      expect(mockImages.transform).toHaveBeenCalledWith({ quality: 95 });
      expect(mockImages.transform).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should stop reducing quality at minimum threshold', async () => {
      const largeMockResponse = new Response('large image');
      largeMockResponse.headers.set('content-length', '600000'); // Always too large

      mockImages.response.mockResolvedValue(largeMockResponse);

      const imageData = new ArrayBuffer(1024);
      const result = await optimizeForWeb(imageData, 100, mockEnv);

      // Should try multiple quality levels down to 20
      expect(mockImages.transform).toHaveBeenCalledWith({ quality: 20 });
      expect(result).toBe(largeMockResponse);
    });

    it('should throw error when Images binding is not available', async () => {
      const envWithoutImages = {};
      const imageData = new ArrayBuffer(1024);

      await expect(
        optimizeForWeb(imageData, 500, envWithoutImages)
      ).rejects.toThrow('Images binding not available');
    });
  });

  describe('createCacheKey', () => {
    it('should create cache key with all options', () => {
      const key = createCacheKey('test-image.jpg', {
        width: 800,
        height: 600,
        quality: 90,
        format: 'webp',
        watermark: true,
      });

      expect(key).toBe('test-image.jpg_800_600_90_webp_wm');
    });

    it('should create cache key with auto values', () => {
      const key = createCacheKey('test-image.jpg', {
        watermark: false,
      });

      expect(key).toBe('test-image.jpg_auto_auto_auto_auto_no-wm');
    });
  });

  describe('validateProcessingOptions', () => {
    it('should validate correct options', () => {
      const result = validateProcessingOptions({
        width: 800,
        height: 600,
        quality: 90,
        format: 'webp',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid width', () => {
      const result = validateProcessingOptions({ width: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Width must be between 1 and 4000');
    });

    it('should reject width too large', () => {
      const result = validateProcessingOptions({ width: 5000 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Width must be between 1 and 4000');
    });

    it('should reject invalid height', () => {
      const result = validateProcessingOptions({ height: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Height must be between 1 and 4000');
    });

    it('should reject invalid quality', () => {
      const result = validateProcessingOptions({ quality: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Quality must be between 1 and 100');
    });

    it('should reject quality too high', () => {
      const result = validateProcessingOptions({ quality: 101 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Quality must be between 1 and 100');
    });

    it('should reject invalid format', () => {
      const result = validateProcessingOptions({ format: 'gif' as any });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Format must be jpeg, png, or webp');
    });
  });

  describe('getOptimalFormat', () => {
    it('should return webp for supporting browsers', () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue('text/html,image/webp,image/apng,*/*')
        }
      } as any;

      const format = getOptimalFormat(request);
      expect(format).toBe('webp');
    });

    it('should return jpeg for non-supporting browsers', () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue('text/html,image/png,image/jpeg,*/*')
        }
      } as any;

      const format = getOptimalFormat(request);
      expect(format).toBe('jpeg');
    });

    it('should return jpeg when no Accept header', () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      } as any;

      const format = getOptimalFormat(request);
      expect(format).toBe('jpeg');
    });
  });

  describe('calculateResponsiveDimensions', () => {
    it('should calculate dimensions maintaining aspect ratio', () => {
      const dimensions = calculateResponsiveDimensions(1920, 1080, 800);

      expect(dimensions).toEqual({
        width: 800,
        height: 450,
      });
    });

    it('should handle square images', () => {
      const dimensions = calculateResponsiveDimensions(1000, 1000, 500);

      expect(dimensions).toEqual({
        width: 500,
        height: 500,
      });
    });

    it('should handle portrait images', () => {
      const dimensions = calculateResponsiveDimensions(1080, 1920, 400);

      expect(dimensions).toEqual({
        width: 400,
        height: 711,
      });
    });

    it('should round height to nearest integer', () => {
      const dimensions = calculateResponsiveDimensions(1920, 1079, 800);

      expect(dimensions.height).toBe(449); // Should be rounded
    });
  });
});