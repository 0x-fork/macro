import type { IMAGE_FORMATS } from './constants';

/**
 * Supported image formats for HEIC conversion
 */
export type SupportedImageFormat =
  (typeof IMAGE_FORMATS)[keyof typeof IMAGE_FORMATS];

/**
 * HEIC conversion quality levels
 */
export type ConversionQuality = 0.7 | 0.85 | 0.92 | 0.95;

/**
 * Task status in the worker pool
 */
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Configuration for HEIC conversion
 */
export interface HeicConversionConfig {
  readonly format: SupportedImageFormat;
  readonly quality: ConversionQuality;
  readonly timeout?: number;
}
