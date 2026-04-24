/**
 * Central exports for tooling utilities
 *
 * This module provides a unified entry point for all tooling utilities,
 * enabling consistent imports across the codebase.
 */

// Runners

// Token services (types)
export type {
  TokenCatalog,
  TokenCatalogEntry,
  CssVarReference,
  TokenUsage,
  TokenGraphNode,
  TokenGraphEdge,
  TokenGraph,
  WcagPair,
  TokenUsageIndexReport,
  TokenGraphReport,
  TokenServiceOptions,
} from '../services/token-types.js';

// Token services (utils)
export {
  CSS_VAR_REF_RE,
  CSS_CUSTOM_PROP_DECL_RE,
  A11Y_MODE_DOT_RE,
  A11Y_MODE_SLASH_RE,
  parseBooleanOption,
  parsePositiveInteger,
  extractCssVarReferences,
  extractCssDeclarations,
  isCssVarRef,
  extractVarName,
  normalizeA11yPath,
  findTokenByCssVar,
  findTokenByPath,
  findTokenById,
  getTokenAliases,
  isPrimitiveValue,
  groupTokensByCollection,
  groupTokensByMode,
  computeSha256,
  computeFileSha256,
} from '../services/token-utils.js';

// Token services (runners)
export { runTokenUsageIndex } from '../runners/token-usage-index-runner.js';

// Tokens from Figma runners
export { runTokensFromFigma } from '../runners/tokens-from-figma-runner.js';

// Command execution utilities
export { parseJsonFromText, runJsonCommand, runOrThrow } from './exec.js';

export type {
  JsonParseResult,
  RunJsonCommandOptions,
  RunJsonCommandResult,
} from './exec.js';

// System context utilities
export {
  PROJECT_ROOT,
  DEFAULT_THEME_PATH,
  resolveSystemContextSafe,
  getDefaultSystemContext,
  loadDesignSystemsConfig,
} from './system-context.js';

export type { ScriptSystemContext } from './system-context.js';

// Type guards
export { isPlainObject } from './is-plain-object.js';

// Command utilities
export { commandExists } from './command-exists.js';
export { isMain } from './is-main.js';

// Agent runner utilities
export { runAgentPrompt } from '../services/agent-runner.js';

export type {
  AgentType,
  AgentPromptOptions,
  AgentPromptResult,
} from '../services/agent-runner.js';

// Pipeline types
export type {
  PipelineIdentity,
  PipelinePaths,
  PipelineFlags,
  PipelineContext,
} from '../types/pipeline.js';

// File snapshot utilities
export { captureFileSnapshot, restoreFileSnapshot } from './file-snapshot.js';

export type { FileSnapshot } from './file-snapshot.js';

// Scoped write guard
export {
  captureScopedWriteSnapshot,
  assertScopedWritePolicy,
} from '../services/scoped-write-guard.js';

export type {
  ScopedWriteSnapshot,
  FileChange,
} from '../services/scoped-write-guard.js';

// Pipeline context
export { createPipelineContext } from '../services/pipeline-context.js';

// Pipeline helpers (extracted to separate modules)
export { parsePipelineIdentity } from '../services/pipeline-identity.js';
export { parsePipelineOptions } from '../services/pipeline-options.js';
export { resolvePipelinePaths } from '../services/pipeline-path-resolver.js';

// Argument parsing utilities
export { parseArgs, renderUsage, printUsage } from './parse-args.js';

export type { ArgOption, ArgConfig, PrintUsageOptions } from './parse-args.js';

// Alias for the return type of parseArgs
export type ParsedArgs = Record<string, string | boolean>;

// Logger utility
export { logger } from './logger.js';

// Log level type (centralized to avoid duplication)
export type { LogLevel } from './logger-types.js';

// Component name utilities
export {
  componentNameToSnakeCase,
  componentNameToDisplayName,
  normalizeComponentName,
  componentNameFromFilePath,
  isSnakeCaseFileSlug,
} from './component-name.js';

export type { NormalizedComponentName } from './component-name.js';

// Figma API utilities
export {
  buildFigmaFileEndpoint,
  fetchFigmaFile,
  fetchFigmaNodes,
  fetchFigmaLocalVariables,
  fetchFigmaImages,
  normalizePositiveInteger,
  sanitizeToken,
  normalizeFileKey,
} from './figma-api.js';

export type {
  FigmaColor,
  FigmaFileResponse,
  FigmaNodesResponse,
  FigmaVariablesResponse,
  FigmaImagesResponse,
  FigmaApiOptions,
  FetchFigmaFileOptions,
  FetchFigmaNodesOptions,
  FetchFigmaImagesOptions,
} from './figma.js';

// Figma component map utilities
export {
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  toHyphenNodeId,
  sanitizeNodeId,
  parseNodeIdFromUrl,
  buildFigmaComponentMapSummary,
  renderFigmaComponentMapText,
} from '../services/figma-component-map.js';

export type {
  FigmaComponentMap,
  FigmaComponentItem,
  FigmaPageItem,
  ParsedFigmaFileUrl,
  FigmaComponentMapSummary,
} from '../services/figma-component-map.js';

// Figma node ID utilities
export {
  FIGMA_NODE_ID_RE,
  normalizeNodeId,
  isValidNodeId,
} from './figma-node-id.js';

// Figma URL parser utilities
export { parseFigmaUrl } from './figma-url-parser.js';

export type { ParsedFigmaUrl } from './figma-url-parser.js';

// Figma node spec extractor utilities
export {
  extractComponentSpec,
} from './figma-node-spec-extractor.js';

export type {
  // FigmaNode is now canonical here (removed from figma-api exports)
  FigmaNode,
  LayoutInfo,
  LayoutTreeNode,
} from './figma-node-spec-extractor.js';

// Re-export spec types from canonical location
export type {
  ExtractedComponentSpec,
} from '../types/spec.js';
