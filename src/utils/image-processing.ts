/**
 * Image processing utilities using Cloudflare Images API
 */

import type { ImageProcessingOptions, WatermarkConfig } from '../types/index.js';

/**
 * Processes an image with the specified options using Cloudflare Images
 * @param imageData - Source image data
 * @param options - Processing options
 * @param env - Environment with Images binding
 * @returns Processed image response
 */
export async function processImage(
  imageData: ArrayBuffer | ReadableStream,
  options: ImageProcessingOptions,
  env: { IMAGES?: any; BRANDING_ASSETS?: any }
): Promise<Response> {
  if (!env.IMAGES) {
    throw new Error('Images binding not available');
  }

  try {
    let processor = env.IMAGES.input(imageData);

    // Apply resizing if specified
    if (options.width || options.height) {
      const transformOptions: Record<string, unknown> = {};
      
      if (options.width) transformOptions.width = options.width;
      if (options.height) transformOptions.height = options.height;
      if (options.quality) transformOptions.quality = options.quality;
      
      processor = processor.transform(transformOptions);
    }

    // Apply watermarks if requested
    if (options.watermark && env.BRANDING_ASSETS) {
      processor = await applyWatermarks(processor, env);
    }

    // Set output format
    const outputOptions: Record<string, unknown> = {};
    if (options.format) outputOptions.format = options.format;
    if (options.quality) outputOptions.quality = options.quality;

    return processor.output(outputOptions).response();
  } catch (error) {
    console.error('Image processing failed:', error);
    throw new Error('Image processing failed');
  }
}

/**
 * Applies watermarks to an image using stored branding assets
 * @param processor - Image processor instance
 * @param env - Environment with KV binding for branding assets
 * @returns Image processor with watermarks applied
 */
async function applyWatermarks(
  processor: any,
  env: { IMAGES?: any; BRANDING_ASSETS?: any }
): Promise<any> {
  try {
    // Get BBFF logo (top-left)
    const bbffLogoData = await env.BRANDING_ASSETS.get('bbff-logo.png', 'arrayBuffer');
    if (bbffLogoData) {
      processor = processor.draw(
        env.IMAGES?.input(bbffLogoData),
        {
          top: 20,
          left: 20,
          width: 100,
          height: 100,
          opacity: 0.8,
          fit: 'contain',
        }
      );
    }

    // Get HMB Brewing logo (bottom-right)
    const hmbLogoData = await env.BRANDING_ASSETS.get('hmb-logo.png', 'arrayBuffer');
    if (hmbLogoData) {
      processor = processor.draw(
        env.IMAGES?.input(hmbLogoData),
        {
          bottom: 20,
          right: 20,
          width: 100,
          height: 100,
          opacity: 0.8,
          fit: 'contain',
        }
      );
    }

    return processor;
  } catch (error) {
    console.error('Watermarking failed:', error);
    // Return processor without watermarks if watermarking fails
    return processor;
  }
}

/**
 * Generates thumbnail URL using Cloudflare's URL-based resizing
 * @param imageKey - R2 object key
 * @param width - Thumbnail width
 * @param quality - Image quality (0-100)
 * @returns Thumbnail URL
 */
export function generateThumbnailUrl(
  imageKey: string,
  width: number = 300,
  quality: number = 85
): string {
  return `/cdn-cgi/image/width=${width},quality=${quality}/api/images/${imageKey}`;
}

/**
 * Generates responsive image URLs for different screen sizes
 * @param imageKey - R2 object key
 * @returns Object with URLs for different sizes
 */
export function generateResponsiveUrls(imageKey: string): {
  thumbnail: string;
  small: string;
  medium: string;
  large: string;
  original: string;
} {
  const baseUrl = `/api/images/${imageKey}`;
  
  return {
    thumbnail: `/cdn-cgi/image/width=150,quality=80${baseUrl}`,
    small: `/cdn-cgi/image/width=400,quality=85${baseUrl}`,
    medium: `/cdn-cgi/image/width=800,quality=90${baseUrl}`,
    large: `/cdn-cgi/image/width=1200,quality=95${baseUrl}`,
    original: baseUrl,
  };
}

/**
 * Extracts image metadata from file
 * @param file - Image file
 * @returns Promise resolving to image metadata
 */
export async function extractImageMetadata(file: File): Promise<{
  dimensions?: { width: number; height: number };
  exif?: Record<string, unknown>;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      resolve({
        dimensions: {
          width: img.naturalWidth,
          height: img.naturalHeight,
        },
      });
    };
    
    img.onerror = () => {
      resolve({});
    };
    
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Optimizes image for web delivery
 * @param imageData - Source image data
 * @param targetSizeKB - Target file size in KB
 * @param env - Environment with Images binding
 * @returns Optimized image response
 */
export async function optimizeForWeb(
  imageData: ArrayBuffer | ReadableStream,
  targetSizeKB: number = 500,
  env: { IMAGES?: any }
): Promise<Response> {
  if (!env.IMAGES) {
    throw new Error('Images binding not available');
  }

  // Start with high quality and reduce if needed
  let quality = 95;
  let result: Response = await env.IMAGES
    .input(imageData)
    .transform({ quality })
    .output({ format: 'jpeg' })
    .response();

  while (quality >= 20) {
    const resultSize = parseInt(result.headers.get('content-length') || '0');
    const resultSizeKB = resultSize / 1024;

    if (resultSizeKB <= targetSizeKB) {
      break;
    }

    if (quality === 20) {
      break; // We've tried the minimum quality
    }

    quality -= 10;
    if (quality < 20) {
      quality = 20; // Ensure we try the minimum
    }

    result = await env.IMAGES
      .input(imageData)
      .transform({ quality })
      .output({ format: 'jpeg' })
      .response();
  }

  return result;
}

/**
 * Creates a cache key for processed images
 * @param imageKey - Original image key
 * @param options - Processing options
 * @returns Cache key string
 */
export function createCacheKey(
  imageKey: string,
  options: ImageProcessingOptions
): string {
  const parts = [
    imageKey,
    options.width || 'auto',
    options.height || 'auto',
    options.quality || 'auto',
    options.format || 'auto',
    options.watermark ? 'wm' : 'no-wm',
  ];
  
  return parts.join('_');
}

/**
 * Validates image processing options
 * @param options - Options to validate
 * @returns Validation result
 */
export function validateProcessingOptions(
  options: ImageProcessingOptions
): { valid: boolean; error?: string } {
  // Validate dimensions
  if (options.width !== undefined && (options.width < 1 || options.width > 4000)) {
    return { valid: false, error: 'Width must be between 1 and 4000 pixels' };
  }
  
  if (options.height !== undefined && (options.height < 1 || options.height > 4000)) {
    return { valid: false, error: 'Height must be between 1 and 4000 pixels' };
  }
  
  // Validate quality
  if (options.quality !== undefined && (options.quality < 1 || options.quality > 100)) {
    return { valid: false, error: 'Quality must be between 1 and 100' };
  }
  
  // Validate format
  if (options.format && !['jpeg', 'png', 'webp'].includes(options.format)) {
    return { valid: false, error: 'Format must be jpeg, png, or webp' };
  }
  
  return { valid: true };
}

/**
 * Gets optimal image format based on browser support
 * @param request - Incoming request with Accept header
 * @returns Optimal image format
 */
export function getOptimalFormat(request: Request): 'webp' | 'jpeg' {
  const acceptHeader = request.headers.get('Accept') || '';
  
  // Check if browser supports WebP
  if (acceptHeader.includes('image/webp')) {
    return 'webp';
  }
  
  return 'jpeg';
}

/**
 * Calculates responsive image dimensions
 * @param originalWidth - Original image width
 * @param originalHeight - Original image height
 * @param targetWidth - Target width
 * @returns Calculated dimensions maintaining aspect ratio
 */
export function calculateResponsiveDimensions(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number
): { width: number; height: number } {
  const aspectRatio = originalHeight / originalWidth;
  const height = Math.floor(targetWidth * aspectRatio);
  
  return { width: targetWidth, height };
}