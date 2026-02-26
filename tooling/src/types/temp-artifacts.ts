/**
 * Type definitions for temp artifacts module.
 */

/**
 * Options for TempArtifactManager constructor.
 */
export interface TempArtifactManagerOptions {
  /**
   * Keep artifacts after process exit (default: false).
   */
  keep?: boolean;
}

/**
 * Matcher function for purging artifacts.
 */
export type ArtifactMatcherFn = (fileName: string, absolutePath: string) => boolean;

/**
 * Options for purgeMatching method.
 */
export interface PurgeOptions {
  /**
   * Directory to purge.
   */
  dir: string;
  /**
   * Matcher function to filter files.
   */
  matcher: ArtifactMatcherFn;
}

/**
 * Result of cleanup operation.
 */
export interface CleanupResult {
  /**
   * List of removed file paths.
   */
  removed: string[];
  /**
   * List of kept file paths (if keep option is true).
   */
  kept: string[];
}

/**
 * Result of purge operation.
 */
export interface PurgeResult {
  /**
   * List of removed file paths.
   */
  removed: string[];
}
