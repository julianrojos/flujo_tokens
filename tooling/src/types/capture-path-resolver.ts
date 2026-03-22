/**
 * Capture Path Resolver Types
 *
 * Type definitions for capture path resolution operations.
 */

/**
 * Context for capture operations.
 */
export interface CaptureContext {
  paths: {
    docs: string;
    specs?: string;
  };
}

/**
 * Resolved documentation paths for a component.
 */
export interface DocsPaths {
  docsRootDir: string;
  componentDocsDir: string;
  markdownPath: string;
  specPath: string;
}
