/**
 * Validation utilities for the photo sharing site
 */

import type { UploadConstraints } from '../types/index.js';

/** Default upload constraints */
export const DEFAULT_CONSTRAINTS: UploadConstraints = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFiles: 10,
};

/**
 * Validates if a file meets the upload constraints
 * @param file - The file to validate
 * @param constraints - Upload constraints to check against
 * @returns Validation result with error message if invalid
 */
export async function validateFile(
  file: File,
  constraints: UploadConstraints = DEFAULT_CONSTRAINTS
): Promise<{ valid: boolean; error?: string }> {
  // Check file size
  if (file.size > constraints.maxFileSize) {
    return {
      valid: false,
      error: `File size ${formatBytes(file.size)} exceeds maximum allowed size of ${formatBytes(constraints.maxFileSize)}`,
    };
  }

  // Check file type
  if (!constraints.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${constraints.allowedTypes.join(', ')}`,
    };
  }

  // Check if file is actually an image by checking magic bytes
  const isValidImage = await isValidImageFile(file);
  if (!isValidImage) {
    return {
      valid: false,
      error: 'File does not appear to be a valid image',
    };
  }

  return { valid: true };
}

/**
 * Validates multiple files for batch upload
 * @param files - Array of files to validate
 * @param constraints - Upload constraints
 * @returns Array of validation results
 */
export async function validateFiles(
  files: File[],
  constraints: UploadConstraints = DEFAULT_CONSTRAINTS
): Promise<Array<{ file: File; valid: boolean; error?: string }>> {
  // Check maximum number of files
  if (files.length > constraints.maxFiles) {
    return files.map(file => ({
      file,
      valid: false,
      error: `Too many files selected. Maximum allowed: ${constraints.maxFiles}`,
    }));
  }

  const validationPromises = files.map(async file => ({
    file,
    ...(await validateFile(file, constraints)),
  }));

  return Promise.all(validationPromises);
}

/**
 * Checks if a file is a valid image by examining magic bytes
 * @param file - File to check
 * @returns Promise resolving to true if valid image
 */
async function isValidImageFile(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check for common image format magic bytes
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return true;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return true;
    }

    // WebP: RIFF....WEBP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      // Check for WEBP signature at offset 8
      const webpBuffer = await file.slice(8, 12).arrayBuffer();
      const webpBytes = new Uint8Array(webpBuffer);
      if (
        webpBytes[0] === 0x57 &&
        webpBytes[1] === 0x45 &&
        webpBytes[2] === 0x42 &&
        webpBytes[3] === 0x50
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Formats bytes into human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Generates a unique filename with timestamp and random suffix
 * @param originalName - Original filename
 * @returns Unique filename
 */
export function generateUniqueFilename(originalName: string): string {
  const extension = originalName.split('.').pop() || '';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${extension}`;
}

/**
 * Sanitizes filename for safe storage
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Validates event prefix for R2 storage
 * @param prefix - Event prefix to validate
 * @returns True if valid prefix
 */
export function validateEventPrefix(prefix: string): boolean {
  // Must be alphanumeric with hyphens/underscores, no special chars
  const prefixRegex = /^[a-zA-Z0-9_-]+$/;
  return prefixRegex.test(prefix) && prefix.length > 0 && prefix.length <= 50;
}