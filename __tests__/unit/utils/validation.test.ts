import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateFile,
  validateFiles,
  formatBytes,
  generateUniqueFilename,
  sanitizeFilename,
  validateEventPrefix,
  DEFAULT_CONSTRAINTS,
} from '../../../src/utils/validation.js';

describe('validation utils', () => {
  describe('DEFAULT_CONSTRAINTS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONSTRAINTS).toEqual({
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxFiles: 10,
      });
    });
  });

  describe('validateFile', () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(['test content'], 'test.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      Object.defineProperty(mockFile, 'size', { value: 1024 });
      
      // Mock valid JPEG magic bytes by default
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer),
        }),
        configurable: true
      });
    });

    it('should validate a valid file', async () => {
      const result = await validateFile(mockFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file exceeding size limit', async () => {
      const largeFile = new File(['test'], 'large.jpg', { type: 'image/jpeg' });
      // Use Object.defineProperty with configurable: true
      Object.defineProperty(largeFile, 'size', {
        value: 11 * 1024 * 1024,
        configurable: true,
        writable: true
      });
      
      const result = await validateFile(largeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should reject unsupported file type', async () => {
      const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      
      const result = await validateFile(invalidFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is not allowed');
    });

    it('should use custom constraints', async () => {
      const customConstraints = {
        maxFileSize: 500,
        allowedTypes: ['image/png'],
        maxFiles: 5,
      };

      const result = await validateFile(mockFile, customConstraints);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should validate JPEG magic bytes', async () => {
      // Mock file with JPEG magic bytes
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const jpegFile = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' });
      
      // Add slice method to the file object
      Object.defineProperty(jpegFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(jpegBytes.buffer),
        }),
        configurable: true
      });

      const result = await validateFile(jpegFile);
      expect(result.valid).toBe(true);
    });

    it('should validate PNG magic bytes', async () => {
      // Mock file with PNG magic bytes
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const pngFile = new File([pngBytes], 'test.png', { type: 'image/png' });
      
      Object.defineProperty(pngFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(pngBytes.buffer),
        }),
        configurable: true
      });

      const result = await validateFile(pngFile);
      expect(result.valid).toBe(true);
    });

    it('should validate WebP magic bytes', async () => {
      // Mock file with WebP RIFF header
      const riffBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      const webpBytes = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
      const webpFile = new File([riffBytes, webpBytes], 'test.webp', { type: 'image/webp' });
      
      Object.defineProperty(webpFile, 'slice', {
        value: vi.fn()
          .mockReturnValueOnce({
            arrayBuffer: () => Promise.resolve(riffBytes.buffer),
          })
          .mockReturnValueOnce({
            arrayBuffer: () => Promise.resolve(webpBytes.buffer),
          }),
        configurable: true
      });

      const result = await validateFile(webpFile);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid magic bytes', async () => {
      // Mock file with invalid magic bytes
      const invalidBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      const invalidFile = new File([invalidBytes], 'test.jpg', { type: 'image/jpeg' });
      
      Object.defineProperty(invalidFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.resolve(invalidBytes.buffer),
        }),
        configurable: true
      });

      const result = await validateFile(invalidFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not appear to be a valid image');
    });

    it('should handle magic bytes validation error', async () => {
      Object.defineProperty(mockFile, 'slice', {
        value: vi.fn().mockReturnValue({
          arrayBuffer: () => Promise.reject(new Error('Read error')),
        }),
        configurable: true
      });

      const result = await validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not appear to be a valid image');
    });
  });

  describe('validateFiles', () => {
    let mockFiles: File[];

    beforeEach(() => {
      mockFiles = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
      ];
      mockFiles.forEach((file, index) => {
        Object.defineProperty(file, 'size', { value: 1024 });
        
        // Mock appropriate magic bytes for each file type
        const magicBytes = index === 0
          ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) // JPEG
          : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG
          
        Object.defineProperty(file, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: () => Promise.resolve(magicBytes.buffer),
          }),
          configurable: true
        });
      });
    });

    it('should validate multiple valid files', async () => {
      const results = await validateFiles(mockFiles);
      
      expect(results).toHaveLength(2);
      results.forEach((result: any) => {
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject when exceeding max files limit', async () => {
      const manyFiles = Array.from({ length: 15 }, (_, i) => 
        new File(['test'], `test${i}.jpg`, { type: 'image/jpeg' })
      );

      const results = await validateFiles(manyFiles);
      
      expect(results).toHaveLength(15);
      results.forEach((result: any) => {
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Too many files selected');
      });
    });

    it('should handle mixed valid and invalid files', async () => {
      const mixedFiles = [
        new File(['valid'], 'valid.jpg', { type: 'image/jpeg' }),
        new File(['invalid'], 'invalid.txt', { type: 'text/plain' }),
      ];
      mixedFiles.forEach((file, index) => {
        Object.defineProperty(file, 'size', { value: 1024 });
        
        // Only mock magic bytes for the JPEG file (first one)
        if (index === 0) {
          Object.defineProperty(file, 'slice', {
            value: vi.fn().mockReturnValue({
              arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer),
            }),
            configurable: true
          });
        }
      });

      const results = await validateFiles(mixedFiles);
      
      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[1].error).toContain('is not allowed');
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(512)).toBe('512 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(2621440)).toBe('2.5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(2147483648)).toBe('2 GB');
    });

    it('should handle large numbers', () => {
      expect(formatBytes(10000000000)).toBe('9.31 GB');
    });
  });

  describe('generateUniqueFilename', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    });

    it('should generate unique filename with timestamp and random suffix', () => {
      const result = generateUniqueFilename('test.jpg');
      expect(result).toMatch(/^1640995200000-\w{6}\.jpg$/);
    });

    it('should handle filename without extension', () => {
      const result = generateUniqueFilename('test');
      expect(result).toMatch(/^1640995200000-\w{6}\.test$/);
    });

    it('should preserve original extension', () => {
      const result = generateUniqueFilename('photo.PNG');
      expect(result).toMatch(/^1640995200000-\w{6}\.PNG$/);
    });

    it('should handle multiple dots in filename', () => {
      const result = generateUniqueFilename('my.photo.file.jpeg');
      expect(result).toMatch(/^1640995200000-\w{6}\.jpeg$/);
    });
  });

  describe('sanitizeFilename', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeFilename('MyFile.JPG')).toBe('myfile.jpg');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeFilename('my file!@#$%^&*().jpg')).toBe('my_file_.jpg');
    });

    it('should preserve alphanumeric, dots, and hyphens', () => {
      expect(sanitizeFilename('test-file.1.jpg')).toBe('test-file.1.jpg');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeFilename('my   file   name.jpg')).toBe('my_file_name.jpg');
    });

    it('should handle empty string', () => {
      expect(sanitizeFilename('')).toBe('');
    });

    it('should handle only special characters', () => {
      expect(sanitizeFilename('!@#$%^&*()')).toBe('_');
    });
  });

  describe('validateEventPrefix', () => {
    it('should accept valid alphanumeric prefix', () => {
      expect(validateEventPrefix('25thAnniversary')).toBe(true);
    });

    it('should accept prefix with hyphens', () => {
      expect(validateEventPrefix('beach-break-festival')).toBe(true);
    });

    it('should accept prefix with underscores', () => {
      expect(validateEventPrefix('hmb_brewing_25th')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(validateEventPrefix('')).toBe(false);
    });

    it('should reject prefix with special characters', () => {
      expect(validateEventPrefix('event@2024')).toBe(false);
    });

    it('should reject prefix with spaces', () => {
      expect(validateEventPrefix('my event')).toBe(false);
    });

    it('should reject prefix longer than 50 characters', () => {
      const longPrefix = 'a'.repeat(51);
      expect(validateEventPrefix(longPrefix)).toBe(false);
    });

    it('should accept prefix exactly 50 characters', () => {
      const prefix50 = 'a'.repeat(50);
      expect(validateEventPrefix(prefix50)).toBe(true);
    });

    it('should accept single character prefix', () => {
      expect(validateEventPrefix('a')).toBe(true);
    });
  });
});