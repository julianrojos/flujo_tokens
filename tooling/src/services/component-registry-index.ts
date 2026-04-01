/**
 * Component registry - TypeScript entry point.
 *
 * Provides type-safe exports for component registry operations.
 */

// Re-export types
export type {
  BuildRegistryOptions,
  ComponentOverviewListState,
  CompareRegistryResult,
  ComponentDocState,
  ComponentRegistry,
  ComponentRegistryEntry,
  ComponentSpecState,
  ComponentVisualProofState,
  DocStatus,
  PipelineStage,
  ReadRegistryOptions,
  ReadRegistryResult,
  RegistryValidationError,
  RegistryValidationResult,
  SpecStatus,
  SyncIndicesResult,
  SyncOverviewResult,
  SyncRegistryOptions,
  SyncRegistryResult,
  VisualProofVariant,
  NormalizeSortKeyFn,
  StableHashFn,
} from '../types/component-registry.js';

// Re-export constants
export {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  PIPELINE_STAGE_ORDER,
  DEFAULT_COMPONENT_REGISTRY_PATH,
} from './component-registry-constants.js';

// Export from TypeScript modules
export {
  buildComponentRegistry,
} from './component-registry-build.js';

export {
  readComponentRegistry,
  buildExpectedComponentRegistry,
  compareComponentRegistryToSources,
  syncComponentRegistry,
} from './component-registry-sync.js';

export {
  syncDocumentationState,
} from './component-registry-refresh.js';

export {
  syncComponentOverview,
  buildComponentListLines,
  upsertComponentList,
} from './component-registry-overview-sync.js';

export {
  stableHash,
  normalizeSortKey,
  toProjectRelativePath,
  fileExists,
  normalizeDisplayLabel,
  isValidHttpUrl,
  isValidNodeId,
} from './component-registry-utils.js';

export {
  captureFileSnapshot,
  restoreFileSnapshot,
} from './file-snapshot.js';
