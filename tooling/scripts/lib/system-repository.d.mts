/**
 * Type declarations for system-repository.mjs
 * 
 * This module provides design system repository functionality.
 * Since it's a JavaScript module without TypeScript, we provide type declarations here.
 * 
 * Note: These types mirror the actual implementation in apps/ds-dashboard/server/system-repository.ts
 */

/**
 * Design system configuration entry.
 * Note: id is required (normalized to empty string if not provided).
 * Other fields are optional as they may be partially defined in config.
 */
export interface DesignSystemConfigEntry {
  id: string;  // Required - normalized to "" if not provided
  name?: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  inputDir?: string;
  outputDir?: string;
  docsDir?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  [key: string]: unknown;
}

/**
 * Design systems configuration container.
 * Note: defaultSystem is required in actual implementation.
 */
export interface DesignSystemsConfig {
  systems: DesignSystemConfigEntry[];
  defaultSystem: string;  // Required in actual implementation
  [key: string]: unknown;
}

/**
 * Script system context with resolved paths.
 * Returned by resolveSystemContext().
 */
export interface ScriptSystemContext extends DesignSystemConfigEntry {
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    registry: string;
    tokenRegistry: string;
  };
}

/**
 * Design system repository interface.
 * Matches the public API of DesignSystemRepository class.
 */
export interface DesignSystemRepository {
  /**
   * Get the path to the config file.
   */
  getConfigPath(): string;
  
  /**
   * Get the current configuration.
   * @param options Optional force refresh flag
   * @returns Current design systems configuration
   */
  getConfig(options?: { forceRefresh?: boolean }): DesignSystemsConfig;
  
  /**
   * Save a new configuration.
   * @param nextConfig New configuration to save
   * @returns Saved configuration
   */
  saveConfig(nextConfig: DesignSystemsConfig): DesignSystemsConfig;
  
  /**
   * Resolve system context for a given system ID.
   * @param systemId System ID (uses defaultSystem if not provided)
   * @returns System context with resolved paths
   * @throws Error if system not found
   */
  resolveSystemContext(systemId: string | undefined): ScriptSystemContext;
  
  /**
   * Invalidate the configuration cache.
   */
  invalidate(): void;
  
  /**
   * Dispose of the repository (closes file watcher if enabled).
   */
  dispose(): void;
}

/**
 * Options for creating a design system repository.
 */
export interface DesignSystemRepositoryOptions {
  repoRoot: string;
  watch?: boolean;
}

/**
 * Create a design system repository instance.
 * @param options Repository options
 * @returns Design system repository instance
 */
export function createDesignSystemRepository(options: DesignSystemRepositoryOptions): DesignSystemRepository;
