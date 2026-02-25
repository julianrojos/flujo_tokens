/**
 * Central exports for tooling utilities
 * 
 * This module provides a unified entry point for all tooling utilities,
 * enabling consistent imports across the codebase.
 */

// Command execution utilities
export {
  parseJsonFromText,
  runJsonCommand,
  runOrThrow,
} from "./exec.js";

export type {
  JsonParseResult,
  RunJsonCommandOptions,
  RunJsonCommandResult,
} from "./exec.js";

// System context utilities
export {
  PROJECT_ROOT,
  DEFAULT_THEME_PATH,
  LEGACY_PATHS,
  resolveSystemContextSafe,
  getDefaultSystemContext,
  loadDesignSystemsConfig,
} from "./system-context.js";

export type {
  ScriptSystemContext,
} from "./system-context.js";

// Type guards
export { isPlainObject } from "./is-plain-object.js";

// Command utilities
export { commandExists } from "./command-exists.js";

// Argument parsing utilities
export {
  parseArgs,
  renderUsage,
  printUsage,
} from "./parse-args.js";

export type {
  ArgOption,
  ArgConfig,
  PrintUsageOptions,
} from "./parse-args.js";

// Alias for the return type of parseArgs
export type ParsedArgs = Record<string, string | boolean>;

// Logger utility
export { logger } from "./logger.js";

// Log level type (centralized to avoid duplication)
export type { LogLevel } from "./logger-types.js";

// TBD marker utility
export { isTbdMarker } from "./tbd.js";

// Frontmatter parsing utilities
export {
  parseYamlDocument,
  parseMarkdownFrontmatter,
} from "./parse-frontmatter.js";

export type {
  ParsedFrontmatter,
} from "./parse-frontmatter.js";

// Cache utilities
export {
  computeFingerprint,
  loadSyncState,
  saveSyncState,
  shouldSkipTask,
  updateTaskState,
} from "./cache-utils.js";

export type {
  SyncState,
  SyncTaskState,
  ComputeFingerprintOptions,
  ShouldSkipTaskOptions,
  ShouldSkipTaskResult,
  UpdateTaskStateOptions,
} from "./cache-utils.js";

// Component name utilities
export {
  componentNameToSnakeCase,
  componentNameToDisplayName,
  normalizeComponentName,
  componentNameFromFilePath,
  isSnakeCaseFileSlug,
} from "./component-name.js";

export type {
  NormalizedComponentName,
} from "./component-name.js";

// Spec token mapping utilities
export {
  normalizeCompareKey,
  extractUniqueRegistryEntries,
  pickComponentTokenCandidates,
  buildTokenMenuLines,
  pickBestTokenPath,
  prefillTokenMapping,
} from "./spec-token-mapping.js";

export type {
  TokenRegistryEntry,
} from "./spec-token-mapping.js";
