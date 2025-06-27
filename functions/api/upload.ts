/**
 * Photo upload handler for Cloudflare Pages Functions
 * Handles secure photo uploads to R2 storage with validation
 */

import type { Env, PhotoMetadata, UploadResponse } from '../../src/types/index.js';
import { validateFile, generateUniqueFilename, sanitizeFilename } from '../../src/utils/validation.js';
import { 
  createErrorResponse, 
  createValidationError, 
  createUploadError, 
  createUnauthorizedError,
  createRateLimitError,
  logError,
  handleCORS,
  HTTP_STATUS 
} from '../../src/utils/error-handling.js';

// Event prefix for this specific event
const EVENT_PREFIX = '25thAnniversary';

// Rate limiting storage (in production, use KV or Durable Objects)
const uploadCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Handles photo upload requests
 * @param context - Cloudflare Pages Functions context
 * @returns Response with upload result
 */
export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, waitUntil } = context;

  try {
    // Handle CORS preflight
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    // Validate environment
    if (!env.PHOTOS_BUCKET) {
      logError('PHOTOS_BUCKET not configured', {}, env);
      return createErrorResponse('Storage not configured', 'STORAGE_ERROR', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    // Rate limiting check
    const rateLimitResponse = await checkRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;

    // Validate authentication (in production, check Cloudflare Access JWT)
    const authResponse = await validateAuthentication(request, env);
    if (authResponse) return authResponse;

    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll('photos') as File[];

    if (!files || files.length === 0) {
      return createValidationError('No files provided', 'photos');
    }

    // Validate each file
    const validationPromises = files.map(async file => ({
      file,
      ...(await validateFile(file, {
        maxFileSize: parseInt(env.MAX_UPLOAD_SIZE || '10485760'), // 10MB default
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxFiles: 10,
      })),
    }));

    const validationResults = await Promise.all(validationPromises);

    // Check for validation errors
    const invalidFiles = validationResults.filter(result => !result.valid);
    if (invalidFiles.length > 0) {
      return createValidationError(
        `Invalid files: ${invalidFiles.map(f => `${f.file.name}: ${f.error}`).join(', ')}`,
        'photos'
      );
    }

    // Upload valid files
    const uploadPromises = validationResults
      .filter(result => result.valid)
      .map(result => uploadFile(result.file, env));

    const uploadResults = await Promise.allSettled(uploadPromises);

    // Process results
    const successfulUploads: PhotoMetadata[] = [];
    const failedUploads: { filename: string; error: string }[] = [];

    uploadResults.forEach((result, index) => {
      const filename = validationResults[index].file.name;
      
      if (result.status === 'fulfilled') {
        successfulUploads.push(result.value);
      } else {
        failedUploads.push({
          filename,
          error: result.reason?.message || 'Upload failed',
        });
        logError(`Upload failed for ${filename}`, { error: result.reason }, env);
      }
    });

    // Log successful uploads for analytics
    if (successfulUploads.length > 0) {
      waitUntil(logUploads(successfulUploads, env));
    }

    // Return response
    const response: UploadResponse = {
      success: failedUploads.length === 0,
      ...(successfulUploads.length > 0 && { 
        photos: successfulUploads 
      }),
      ...(failedUploads.length > 0 && { 
        errors: failedUploads 
      }),
    };

    return new Response(JSON.stringify(response), {
      status: failedUploads.length === 0 ? HTTP_STATUS.CREATED : HTTP_STATUS.PARTIAL_CONTENT,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      },
    });

  } catch (error) {
    logError(error as Error, { endpoint: 'upload' }, env);
    return createErrorResponse('Upload processing failed');
  }
}

/**
 * Uploads a single file to R2 storage
 * @param file - File to upload
 * @param env - Environment with R2 binding
 * @returns Photo metadata
 */
async function uploadFile(file: File, env: Env): Promise<PhotoMetadata> {
  // Generate unique filename
  const originalName = sanitizeFilename(file.name);
  const uniqueName = generateUniqueFilename(originalName);
  const key = `${EVENT_PREFIX}/${uniqueName}`;

  try {
    // Upload to R2
    await env.PHOTOS_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // 1 year
      },
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size.toString(),
      },
    });

    // Create metadata object
    const metadata: PhotoMetadata = {
      key,
      filename: originalName,
      size: file.size,
      contentType: file.type,
      uploadedAt: new Date().toISOString(),
    };

    return metadata;
  } catch (error) {
    console.error(`Failed to upload ${file.name}:`, error);
    throw new Error(`Failed to upload ${file.name}: ${error}`);
  }
}

/**
 * Validates authentication for upload requests
 * @param request - Incoming request
 * @param env - Environment
 * @returns Error response if authentication fails
 */
async function validateAuthentication(request: Request, env: Env): Promise<Response | null> {
  // In production, validate Cloudflare Access JWT
  const accessJWT = request.headers.get('Cf-Access-Jwt-Assertion');
  
  if (env.ENVIRONMENT === 'production' && !accessJWT) {
    return createUnauthorizedError('Authentication required');
  }

  // For development, check for upload token
  if (env.ENVIRONMENT === 'development') {
    const uploadToken = request.headers.get('X-Upload-Token');
    if (!uploadToken || uploadToken !== 'dev-upload-token') {
      return createUnauthorizedError('Invalid upload token');
    }
  }

  return null;
}

/**
 * Checks and enforces rate limiting
 * @param request - Incoming request
 * @param env - Environment
 * @returns Error response if rate limited
 */
async function checkRateLimit(request: Request, env: Env): Promise<Response | null> {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimit = parseInt(env.UPLOAD_RATE_LIMIT || '100');
  const windowMinutes = 60; // 1 hour window
  
  const now = Date.now();
  const windowStart = now - (windowMinutes * 60 * 1000);
  
  // Get or create rate limit data
  let rateLimitData = uploadCounts.get(clientIP);
  if (!rateLimitData || rateLimitData.resetTime < now) {
    rateLimitData = {
      count: 0,
      resetTime: now + (windowMinutes * 60 * 1000),
    };
  }
  
  // Check if limit exceeded
  if (rateLimitData.count >= rateLimit) {
    const retryAfter = Math.ceil((rateLimitData.resetTime - now) / 1000);
    return createRateLimitError(
      `Upload rate limit exceeded. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      retryAfter
    );
  }
  
  // Increment count
  rateLimitData.count++;
  uploadCounts.set(clientIP, rateLimitData);
  
  return null;
}

/**
 * Logs successful uploads to analytics
 * @param uploads - Array of successful uploads
 * @param env - Environment with analytics binding
 */
async function logUploads(uploads: PhotoMetadata[], env: Env): Promise<void> {
  if (!env.ANALYTICS) return;

  try {
    await env.ANALYTICS.writeDataPoint({
      blobs: [
        JSON.stringify({
          type: 'upload',
          timestamp: new Date().toISOString(),
          count: uploads.length,
          totalSize: uploads.reduce((sum, photo) => sum + photo.size, 0),
          event: EVENT_PREFIX,
        }),
      ],
      doubles: [Date.now()],
    });
  } catch (error) {
    console.error('Failed to log uploads to analytics:', error);
  }
}

/**
 * Handles GET requests (not allowed for upload endpoint)
 */
export async function onRequestGet(): Promise<Response> {
  return createErrorResponse(
    'Method not allowed',
    'METHOD_NOT_ALLOWED',
    HTTP_STATUS.METHOD_NOT_ALLOWED
  );
}

/**
 * Handles other HTTP methods (not allowed)
 */
export async function onRequest(): Promise<Response> {
  return createErrorResponse(
    'Method not allowed',
    'METHOD_NOT_ALLOWED',
    HTTP_STATUS.METHOD_NOT_ALLOWED
  );
}