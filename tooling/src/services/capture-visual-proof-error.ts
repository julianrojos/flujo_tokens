/**
 * Capture Visual Proof Error
 *
 * Custom error class for visual proof capture failures.
 */

export class CaptureError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
  }
}
