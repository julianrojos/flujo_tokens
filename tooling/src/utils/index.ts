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
export { runSpecFromFigmaRunner } from '../runners/spec-from-figma-runner.js';
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

// Spec to markdown runners
export { runSpecToMarkdown } from '../runners/spec-to-markdown-runner.js';

// Validate docs runners
export { runValidateDocs } from '../runners/validate-docs-runner.js';

// Audit consistency runners
export { runAuditConsistency } from '../runners/audit-consistency-runner.js';

// Detect missing zones runners
export { runDetectMissingZones } from '../runners/detect-missing-zones-runner.js';

// Migrate markdown zones runners
export { runMigrateMarkdownZones } from '../runners/migrate-markdown-zones-runner.js';

// Validate token refs runners
export { runValidateTokenRefs } from '../runners/validate-token-refs-runner.js';

// Compute traceability runners
export { runComputeTraceability } from '../runners/compute-traceability-runner.js';

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

// Agent runner utilities
export { runAgentPrompt } from '../services/agent-runner.js';

export type {
  AgentType,
  AgentPromptOptions,
  AgentPromptResult,
} from '../services/agent-runner.js';

// Spec agent runner utilities
export {
  buildSpecPrompt,
  buildSpecValidationFeedbackPrompt,
  buildSpecAgentLabel,
  runSpecGenerationPrompt,
  runSpecRepairPrompt,
  GOLDEN_COMPONENT_SPEC_SAMPLE_PATH,
  SPEC_REQUIRED_TOP_LEVEL_FIELDS,
  RULE_BLOCKS,
} from '../services/spec-agent-runner.js';

export type {
  BuildSpecPromptOptions,
  BuildSpecValidationFeedbackPromptOptions,
  BuildSpecAgentLabelOptions,
  RunSpecGenerationPromptOptions,
  RunSpecRepairPromptOptions,
} from '../services/spec-agent-runner.js';

// Spec run guards and resolvers
export {
  assertBypassPolicy,
  assertFigmaSourceProvided,
  assertOutputPath,
  resolveFigmaSource,
} from '../services/spec-guards.js';

export type {
  BypassPolicyOptions,
  FigmaSourceInputs,
  ResolvedFigmaSource,
} from '../services/spec-guards.js';

// Spec run context service
export { createSpecRunContext } from '../services/spec-run-context.js';

export type { CreateSpecRunContextOptions } from '../services/spec-run-context.js';

// Pipeline types
export type {
  PipelineIdentity,
  PipelinePaths,
  PipelineFlags,
  PipelineContext,
  SpecRunContext,
} from '../types/pipeline.js';

// Spec registry and flow services
export { buildSpecPromptWithRegistry } from '../services/spec-registry-prompt.js';
export { runSpecGenerationFlow } from '../services/spec-generation-flow.js';

export type {
  BuildSpecPromptWithRegistryOptions,
  LoadRegistryOptions,
} from '../services/spec-registry-prompt.js';

export type {
  RunSpecGenerationFlowOptions,
  SpecGenerationFlowResult,
} from '../services/spec-generation-flow.js';

export {
  coerceSpecPropertyType,
  getSpecPropertyTypeInfo,
  getValidSpecPropertyTypes,
  PROPERTY_FIELD_ORDER,
} from '../services/spec-property-types.js';

export type {
  SpecPropertyType,
  SpecPropertyTypeInfo,
} from '../services/spec-property-types.js';

export {
  countTbdValues,
  mergeWithTemplate,
  normalizeSpecOrder,
  normalizeSpec,
  SPEC_TOP_LEVEL_ORDER,
} from '../services/spec-normalizer.js';

export type { NormalizeSpecOptions } from '../services/spec-normalizer.js';

// Validation services
export { validateDocs } from '../services/docs-validator.js';
export { validateGeneratedSpec } from '../services/spec-validation.js';

export type {
  DocsValidatorIssue,
  DocsValidationSummary,
  DocsValidationReport,
  DocsValidatorOptions,
} from '../services/docs-validator-types.js';

export type { SpecValidationResult } from '../services/spec-validation.js';

// Evidence-gated mutations
export {
  assertEvidenceGatedScalarChanges,
  assertDocStatusStable,
  readDocStatus,
} from '../services/evidence-gated-mutations.js';

export type {
  AssertEvidenceGatedOptions,
  AssertDocStatusStableOptions,
  MutationViolation,
} from '../services/evidence-gated-mutations.js';

// Spec write adapter
export {
  ensureSpecTemplateExists,
  ensureSpecOutputDirectory,
  materializeSpec,
  parseExistingSpecFromSnapshot,
} from '../services/spec-write-adapter.js';

export type {
  MaterializeSpecOptions,
  SpecOutputSnapshot,
} from '../services/spec-write-adapter.js';

// Registry loader
export { loadRegistryOrThrow } from './registry-loader.js';

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

// Spec writer
export {
  formatYamlFile,
  writeNormalizedSpec,
  writeSpecWithSnapshotGuard,
} from '../services/spec-writer.js';

// Spec result and finalization
export { buildSpecGenerationResult } from '../services/spec-result.js';
export { finalizeSpecResult } from '../services/spec-finalization.js';

export type {
  SpecGenerationResult,
  IndexSyncResult,
  BuildSpecResultOptions,
} from '../services/spec-result.js';

export type { FinalizeSpecOptions } from '../services/spec-finalization.js';

// Spec runner
export { runSpecWithGuards } from '../services/spec-runner.js';

export type { RunSpecWithGuardsOptions } from '../services/spec-runner.js';

// Pipeline context
export { createPipelineContext } from '../services/pipeline-context.js';

// Pipeline helpers (extracted to separate modules)
export { parsePipelineIdentity } from '../services/pipeline-identity.js';
export { parsePipelineOptions } from '../services/pipeline-options.js';
export { resolvePipelinePaths } from '../services/pipeline-path-resolver.js';

// Spec orchestrator
export { runSpecFromFigma } from '../services/spec-orchestrator.js';

export type { SpecOrchestratorDeps } from '../services/spec-orchestrator.js';

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
} from '../services/spec-token-mapping.js';

// Spec to markdown utilities
export {
  makeHeader,
  processZone,
  renderAnatomyMarkdown,
  renderPropertiesTable,
  renderLayoutTable,
  renderVariantSpecs,
  renderVariantRows,
  injectSpecZones,
  isSpecInput,
} from '../services/spec-to-markdown.js';

export type {
  ZoneProcessResult,
  SpecToMarkdownResult,
} from '../services/spec-to-markdown.js';

export type {
  SpecAnatomyItem,
  SpecProperty,
  SpecLayoutItem,
  SpecVariant,
  SpecToMarkdownInput,
} from '../types/spec.js';

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
  buildFigmaComponentMapSummary,
  renderFigmaComponentMapText,
} from './figma-component-map.js';

export type {
  FigmaComponentMap,
  FigmaComponentItem,
  FigmaPageItem,
  ParsedFigmaFileUrl,
  FigmaComponentMapSummary,
} from './figma-component-map.js';

// Figma node ID utilities
export {
  FIGMA_NODE_ID_RE,
  normalizeNodeId,
  isValidNodeId,
} from './figma-node-id.js';

// Figma URL parser utilities
export { parseFigmaUrl } from './figma-url-parser.js';

export type { ParsedFigmaUrl } from './figma-url-parser.js';

// Spec path utilities
export { buildSpecOutputPath } from '../services/spec-paths.js';

// Figma component map runners
export { runFigmaComponentMap } from '../runners/figma-component-map-runner.js';

// Figma node spec extractor utilities
export {
  extractComponentSpec,
  generateSpecSections,
  generateSpecMarkdown,
} from './figma-node-spec-extractor.js';

export type {
  // FigmaNode is now canonical here (removed from figma-api exports)
  FigmaNode,
  ExtractedComponentSpec,
  SpecSections,
  LayoutInfo,
  LayoutTreeNode,
} from './figma-node-spec-extractor.js';
