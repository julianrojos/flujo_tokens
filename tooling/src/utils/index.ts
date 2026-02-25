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
