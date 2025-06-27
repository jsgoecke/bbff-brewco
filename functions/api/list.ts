/**
 * Photo listing handler for Cloudflare Pages Functions
 * Returns list of photos available in the gallery
 */

import type { Env, PhotoMetadata } from '../../src/types/index.js';
import { 
  createErrorResponse, 
  logError,
  handleCORS,
  HTTP_STATUS 
} from '../../src/utils/error-handling.js';

// Event prefix for this specific event
const EVENT_PREFIX = '25thAnniversary';

/**
 * Handles photo listing requests
 * @param context - Cloudflare Pages Functions context
 * @returns Response with photo list
 */
export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, waitUntil } = context;

  try {
    // Handle CORS
    const corsResponse = handleCORS(request, ['*']);
    if (corsResponse) return corsResponse;

    // Validate environment
    if (!env.PHOTOS_BUCKET) {
      logError('PHOTOS_BUCKET not configured', {}, env);
      return createErrorResponse('Storage not configured', 'STORAGE_ERROR', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const cursor = url.searchParams.get('cursor') || undefined;
    const sortBy = url.searchParams.get('sort') || 'newest'; // newest, oldest, name

    // List objects from R2
    const listOptions: {
      prefix: string;
      limit: number;
      cursor?: string;
    } = {
      prefix: `${EVENT_PREFIX}/`,
      limit,
      ...(cursor && { cursor }),
    };

    const result = await env.PHOTOS_BUCKET.list(listOptions);
    
    if (!result.objects) {
      return new Response(JSON.stringify({ photos: [], hasMore: false }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30', // Cache for 30 seconds
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Convert R2 objects to PhotoMetadata
    let photos: PhotoMetadata[] = result.objects.map((obj: any) => ({
      key: obj.key,
      filename: obj.customMetadata?.originalName || obj.key.split('/').pop() || obj.key,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType || 'image/jpeg',
      uploadedAt: obj.uploaded.toISOString(),
      dimensions: obj.customMetadata?.dimensions ? 
        JSON.parse(obj.customMetadata.dimensions) : undefined,
    }));

    // Sort photos based on request
    photos = sortPhotos(photos, sortBy);

    // Log analytics
    waitUntil(logGalleryView(photos.length, env));

    // Return response
    const response = {
      photos,
      hasMore: result.truncated || false,
      cursor: result.truncated ? result.cursor : undefined,
      total: photos.length,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30', // Short cache for real-time updates
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    logError(error as Error, { endpoint: 'list' }, env);
    return createErrorResponse('Failed to list photos');
  }
}

/**
 * Sorts photos based on the specified criteria
 * @param photos - Array of photo metadata
 * @param sortBy - Sort criteria
 * @returns Sorted array of photos
 */
function sortPhotos(photos: PhotoMetadata[], sortBy: string): PhotoMetadata[] {
  switch (sortBy) {
    case 'oldest':
      return photos.sort((a, b) => 
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
      );
      
    case 'name':
      return photos.sort((a, b) => 
        a.filename.localeCompare(b.filename)
      );
      
    case 'size':
      return photos.sort((a, b) => b.size - a.size);
      
    case 'newest':
    default:
      return photos.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
  }
}

/**
 * Logs gallery view for analytics
 * @param photoCount - Number of photos returned
 * @param env - Environment with analytics binding
 */
async function logGalleryView(photoCount: number, env: Env): Promise<void> {
  if (!env.ANALYTICS) return;

  try {
    await env.ANALYTICS.writeDataPoint({
      blobs: [
        JSON.stringify({
          type: 'gallery_view',
          timestamp: new Date().toISOString(),
          photoCount,
          event: EVENT_PREFIX,
        }),
      ],
      doubles: [Date.now()],
    });
  } catch (error) {
    console.error('Failed to log gallery view to analytics:', error);
  }
}

/**
 * Handles POST requests (not allowed for list endpoint)
 */
export async function onRequestPost(): Promise<Response> {
  return createErrorResponse(
    'Method not allowed',
    'METHOD_NOT_ALLOWED',
    HTTP_STATUS.METHOD_NOT_ALLOWED
  );
}

/**
 * Handles other HTTP methods via OPTIONS for CORS
 */
export async function onRequestOptions(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  return handleCORS(context.request, ['*']) || new Response(null, { status: 204 });
}