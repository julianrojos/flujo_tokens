/**
 * Central exports for tooling utilities
 *
 * This module provides a unified entry point for all tooling utilities,
 * enabling consistent imports across the codebase.
 */

// Services (explicit exports to avoid name collisions)
export {
  createCheck,
  sortUniqueStrings,
  normalizeRuleId,
  collectRequiresRuleIds,
  hasValidSkillContext,
  collectManifestRuleFiles,
  collectDeprecatedRulesFromManifest,
  collectAllowedContextValues,
  validateSkillVersioning,
  validateDeprecatedRuleReferences,
  computeSummary,
  buildDoctorReport,
  validateRuleCoverage,
} from '../services/doctor.js';

export type {
  CheckStatus,
  DoctorCheck,
  DoctorReport,
  DoctorSummary,
  ManifestDocument,
  ManifestRuleEntry,
  SkillFrontmatter,
  SkillVersioningResult,
  SkillVersioningIssue,
  ValidateSkillVersioningOptions,
  AllowedContextValues,
  DeprecatedRulesMap,
  CreateCheckOptions,
  DoctorConfig,
  ComponentRegistryComparison,
  DocsValidationResult,
  AgentInfo,
} from '../services/doctor-types.js';

// Runners
export { runDoctor } from '../runners/doctor-runner.js';

// Token services (types)
export type {
  TokenRegistry,
  TokenRegistryEntry,
  CssVarReference,
  TokenUsage,
  TokenGraphNode,
  TokenGraphEdge,
  TokenGraph,
  WcagPair,
  TokenHealthStatus,
  TokenHealthIssue,
  TokenHealthReport,
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
  loadTokenRegistry,
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
export { runTokenGraph } from '../runners/token-graph-runner.js';
export { runTokenHealth } from '../runners/token-health-runner.js';

// Registry runners
export { runRegistrySync } from '../runners/registry-sync-runner.js';

// Spec runners
export { runSortSpec } from '../runners/sort-spec-runner.js';

// Doc regeneration runners
export { runRegenerateDocs } from '../runners/regenerate-docs-runner.js';

// Governance runners
export { runMarkNeedsReview } from '../runners/mark-needs-review-runner.js';

// Registry runners (additional)
export { runRegistryOverview } from '../runners/registry-overview-runner.js';
export { runRegistryRefresh } from '../runners/registry-refresh-runner.js';
export { runRegistryValidate } from '../runners/registry-validate-runner.js';
export { runRegistryReport } from '../runners/registry-report-runner.js';

// Foundations runners
export { runFoundationsSync } from '../runners/foundations-sync-runner.js';

// Health runners
export { runHealthSnapshot } from '../runners/health-snapshot-runner.js';

// Token diff runners
export { runTokenDiff } from '../runners/token-diff-runner.js';

// Tokens sync runners
export { runTokensSync } from '../runners/tokens-sync-runner.js';

// Tokens from Figma runners
export { runTokensFromFigma } from '../runners/tokens-from-figma-runner.js';

// Component doc runners
export { runComponentDoc } from '../runners/component-doc-runner.js';

// Validate docs runners
export { runValidateDocs } from '../runners/validate-docs-runner.js';

// Audit consistency runners
export { runAuditConsistency } from '../runners/audit-consistency-runner.js';

// Detect missing zones runners
export { runDetectMissingZones } from '../runners/detect-missing-zones-runner.js';

// Migrate markdown zones runners
export { runMigrateMarkdownZones } from '../runners/migrate-markdown-zones-runner.js';

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
  LEGACY_PATHS,
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

// Argument parsing utilities
export { parseArgs, renderUsage, printUsage } from './parse-args.js';

export type { ArgOption, ArgConfig, PrintUsageOptions } from './parse-args.js';

// Alias for the return type of parseArgs
export type ParsedArgs = Record<string, string | boolean>;

// Logger utility
export { logger } from './logger.js';

// Log level type (centralized to avoid duplication)
export type { LogLevel } from './logger-types.js';

// TBD marker utility
export { isTbdMarker } from './tbd.js';

// Frontmatter parsing utilities
export {
  parseYamlDocument,
  parseMarkdownFrontmatter,
} from './parse-frontmatter.js';

export type { ParsedFrontmatter } from './parse-frontmatter.js';

// Cache utilities
export {
  computeFingerprint,
  loadSyncState,
  saveSyncState,
  shouldSkipTask,
  updateTaskState,
} from './cache-utils.js';

export type {
  SyncState,
  SyncTaskState,
  ComputeFingerprintOptions,
  ShouldSkipTaskOptions,
  ShouldSkipTaskResult,
  UpdateTaskStateOptions,
} from './cache-utils.js';

// Component name utilities
export {
  componentNameToSnakeCase,
  componentNameToDisplayName,
  normalizeComponentName,
  componentNameFromFilePath,
  isSnakeCaseFileSlug,
} from './component-name.js';

export type { NormalizedComponentName } from './component-name.js';

// Spec token mapping utilities
export {
  normalizeCompareKey,
  extractUniqueRegistryEntries,
  pickComponentTokenCandidates,
  buildTokenMenuLines,
  pickBestTokenPath,
  prefillTokenMapping,
} from './spec-token-mapping.js';

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
  FigmaApiOptions,
  FetchFigmaFileOptions,
  FetchFigmaNodesOptions,
  FetchFigmaImagesOptions,
} from './figma-api.js';

// Agent output contract utilities
export {
  validateAgentOutputContract,
  writeAgentOutputErrorReport,
  ALLOWED_DOC_STATUS,
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
} from './agent-output-contract.js';

export type {
  AgentOutputContractOptions,
  AgentOutputError,
  AgentOutputContractResult,
} from './agent-output-contract.js';

// Figma component map utilities
export {
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  formatFigmaComponentMap,
  toHyphenNodeId,
  sanitizeNodeId,
  parseNodeIdFromUrl,
} from './figma-component-map.js';

export type {
  FigmaComponentMap,
  FigmaComponentItem,
  FigmaPageItem,
  ParsedFigmaFileUrl,
} from './figma-component-map.js';

// Figma node spec extractor utilities
export {
  extractComponentSpec,
  generateSpecSections,
  generateSpecMarkdown,
} from './figma-node-spec-extractor.js';

export type {
  // FigmaNode is now canonical here (removed from figma-api exports)
  FigmaNode,
  SpecAnatomyItem,
  SpecProperty,
  ExtractedComponentSpec,
  SpecSections,
  LayoutInfo,
  LayoutTreeNode,
} from './figma-node-spec-extractor.js';
