/**
 * Type definitions for file-snapshot module.
 */

/**
 * Snapshot of a file's content.
 */
export interface FileSnapshot {
  exists: boolean;
  content: string;
}
