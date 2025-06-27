/**
 * Type definitions for the BBFF & HMB Brewing Co. photo sharing site
 */

/** Environment interface for Cloudflare Workers */
export interface Env {
  /** R2 bucket for photo storage */
  PHOTOS_BUCKET: R2Bucket;
  /** KV namespace for branding assets */
  BRANDING_ASSETS: KVNamespace;
  /** Analytics engine for monitoring */
  ANALYTICS?: AnalyticsEngineDataset;
  /** Environment variables */
  ENVIRONMENT: string;
  MAX_UPLOAD_SIZE: string;
  UPLOAD_RATE_LIMIT: string;
  CACHE_TTL: string;
}

/** Photo metadata interface */
export interface PhotoMetadata {
  /** Unique identifier for the photo */
  key: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  contentType: string;
  /** Upload timestamp */
  uploadedAt: string;
  /** Photo dimensions */
  dimensions?: {
    width: number;
    height: number;
  };
  /** EXIF data (if available) */
  exif?: Record<string, unknown>;
}

/** Upload response interface */
export interface UploadResponse {
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Photo metadata if successful */
  photo?: PhotoMetadata;
}

/** Image processing options */
export interface ImageProcessingOptions {
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Image quality (0-100) */
  quality?: number;
  /** Image format */
  format?: 'jpeg' | 'png' | 'webp';
  /** Apply watermark */
  watermark?: boolean;
}

/** Watermark configuration */
export interface WatermarkConfig {
  /** Logo image data */
  logoData: ArrayBuffer;
  /** Position configuration */
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Opacity (0-1) */
  opacity: number;
}

/** API error response */
export interface ApiError {
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** HTTP status code */
  status: number;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/** Gallery configuration */
export interface GalleryConfig {
  /** Event name */
  eventName: string;
  /** Event date */
  eventDate: string;
  /** Maximum photos to display per page */
  photosPerPage: number;
  /** Enable infinite scroll */
  infiniteScroll: boolean;
}

/** Upload constraints */
export interface UploadConstraints {
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Allowed MIME types */
  allowedTypes: string[];
  /** Maximum files per upload */
  maxFiles: number;
}