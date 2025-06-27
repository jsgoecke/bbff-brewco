/**
 * Image serving handler with watermarking for Cloudflare Pages Functions
 * Serves processed images with BBFF and HMB Brewing Co. watermarks
 */

import type { Env, ImageProcessingOptions } from '../../../src/types/index.js';
import { processImage, getOptimalFormat, validateProcessingOptions } from '../../../src/utils/image-processing.js';
import { 
  createErrorResponse, 
  createNotFoundError,
  logError,
  handleCORS,
  HTTP_STATUS 
} from '../../../src/utils/error-handling.js';

// Event prefix for this specific event
const EVENT_PREFIX = '25thAnniversary';

/**
 * Handles image serving requests with processing and watermarking
 * @param context - Cloudflare Pages Functions context
 * @returns Processed image response
 */
export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, params, waitUntil } = context;

  try {
    // Handle CORS
    const corsResponse = handleCORS(request, ['*']);
    if (corsResponse) return corsResponse;

    // Validate environment
    if (!env.PHOTOS_BUCKET) {
      logError('PHOTOS_BUCKET not configured', {}, env);
      return createErrorResponse('Storage not configured', 'STORAGE_ERROR', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    // Extract key from URL parameters
    const imageKey = params.key;
    if (!imageKey) {
      return createNotFoundError();
    }

    // Construct full R2 key
    const fullKey = imageKey.startsWith(EVENT_PREFIX) ? imageKey : `${EVENT_PREFIX}/${imageKey}`;

    // Parse query parameters for image processing
    const url = new URL(request.url);
    const processingOptions: ImageProcessingOptions = {};
    
    const widthParam = url.searchParams.get('w');
    if (widthParam) processingOptions.width = parseInt(widthParam);
    
    const heightParam = url.searchParams.get('h');
    if (heightParam) processingOptions.height = parseInt(heightParam);
    
    const qualityParam = url.searchParams.get('q');
    processingOptions.quality = qualityParam ? parseInt(qualityParam) : 90;
    
    processingOptions.format = getOptimalFormat(request);
    processingOptions.watermark = url.searchParams.get('watermark') !== 'false'; // Default to true

    // Validate processing options
    const validation = validateProcessingOptions(processingOptions);
    if (!validation.valid) {
      return createErrorResponse(validation.error!, 'VALIDATION_FAILED', HTTP_STATUS.BAD_REQUEST);
    }

    // Create cache key
    const cacheKey = createCacheKey(fullKey, processingOptions);
    
    // Check cache first
    const cache = (caches as any).default || caches;
    const cacheRequest = new Request(`https://cache.example.com/${cacheKey}`, request);
    let cachedResponse = await cache.match(cacheRequest);
    
    if (cachedResponse) {
      // Add cache hit headers
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Cache', 'HIT');
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    // Fetch original image from R2
    const r2Object = await env.PHOTOS_BUCKET.get(fullKey);
    
    if (!r2Object) {
      return createNotFoundError(imageKey);
    }

    // Process image with watermarks
    const processedImage = await processImage(
      r2Object.body,
      processingOptions,
      env
    );

    if (!processedImage.ok) {
      logError('Image processing failed', { key: fullKey, options: processingOptions }, env);
      return createErrorResponse('Image processing failed', 'PROCESSING_ERROR');
    }

    // Create response with appropriate headers
    const response = new Response(processedImage.body, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': processedImage.headers.get('Content-Type') || `image/${processingOptions.format}`,
        'Cache-Control': `public, max-age=${env.CACHE_TTL || '604800'}`, // Default 7 days
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Vary': 'Accept',
        // Add image metadata headers
        'X-Original-Key': fullKey,
        'X-Processing-Options': JSON.stringify(processingOptions),
      },
    });

    // Cache the processed image
    const cacheTTL = parseInt(env.CACHE_TTL || '604800');
    const cacheResponse = response.clone();
    cacheResponse.headers.set('Cache-Control', `public, max-age=${cacheTTL}`);
    
    waitUntil(cache.put(cacheRequest, cacheResponse));

    // Log analytics
    waitUntil(logImageServed(fullKey, processingOptions, env));

    return response;

  } catch (error) {
    logError(error as Error, { endpoint: 'images', key: params.key }, env);
    return createErrorResponse('Failed to serve image');
  }
}

/**
 * Creates a cache key for processed images
 * @param imageKey - Original image key
 * @param options - Processing options
 * @returns Cache key string
 */
function createCacheKey(imageKey: string, options: ImageProcessingOptions): string {
  const parts = [
    imageKey.replace(/[^\w.-]/g, '_'), // Sanitize for cache key
    options.width || 'auto',
    options.height || 'auto',
    options.quality || 'auto',
    options.format || 'auto',
    options.watermark ? 'wm' : 'no-wm',
  ];
  
  return parts.join('_');
}

/**
 * Logs image serving for analytics
 * @param imageKey - Image key that was served
 * @param options - Processing options used
 * @param env - Environment with analytics binding
 */
async function logImageServed(
  imageKey: string, 
  options: ImageProcessingOptions, 
  env: Env
): Promise<void> {
  if (!env.ANALYTICS) return;

  try {
    await env.ANALYTICS.writeDataPoint({
      blobs: [
        JSON.stringify({
          type: 'image_served',
          timestamp: new Date().toISOString(),
          imageKey,
          processingOptions: options,
          event: EVENT_PREFIX,
        }),
      ],
      doubles: [Date.now()],
    });
  } catch (error) {
    console.error('Failed to log image serving to analytics:', error);
  }
}

/**
 * Handles OPTIONS requests for CORS
 */
export async function onRequestOptions(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  return handleCORS(context.request, ['*']) || new Response(null, { status: 204 });
}

/**
 * Handles POST requests (not allowed for image serving)
 */
export async function onRequestPost(): Promise<Response> {
  return createErrorResponse(
    'Method not allowed',
    'METHOD_NOT_ALLOWED',
    HTTP_STATUS.METHOD_NOT_ALLOWED
  );
}

/**
 * Handle HEAD requests for image metadata
 */
export async function onRequestHead(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const { request, env, params } = context;

  try {
    // Extract key from URL parameters
    const imageKey = params.key;
    if (!imageKey) {
      return createNotFoundError();
    }

    // Construct full R2 key
    const fullKey = imageKey.startsWith(EVENT_PREFIX) ? imageKey : `${EVENT_PREFIX}/${imageKey}`;

    // Check if object exists in R2
    const r2Object = await env.PHOTOS_BUCKET.head(fullKey);
    
    if (!r2Object) {
      return createNotFoundError(imageKey);
    }

    // Return headers only
    return new Response(null, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': r2Object.httpMetadata?.contentType || 'image/jpeg',
        'Content-Length': r2Object.size.toString(),
        'Last-Modified': r2Object.uploaded.toUTCString(),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // Cache metadata for 1 hour
      },
    });

  } catch (error) {
    logError(error as Error, { endpoint: 'images-head', key: params.key }, env);
    return createErrorResponse('Failed to get image metadata');
  }
}