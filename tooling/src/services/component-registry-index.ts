/**
 * Component registry - TypeScript entry point.
 * 
 * Provides type-safe exports for component registry operations.
 * 
 * @deprecated Temporary migration layer. Pure TypeScript implementation in progress.
 */

// Re-export types
export type {
  BuildRegistryOptions,
  CompareRegistryResult,
  ComponentDocState,
  ComponentRegistry,
  ComponentRegistryEntry,
  ComponentRenderState,
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
} from "../types/component-registry.js";

// Re-export constants
export {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  PIPELINE_STAGE_ORDER,
} from "../types/component-registry.js";

// Export typed wrappers from .mjs modules
export {
  buildComponentRegistry,
  validateComponentRegistry,
} from "../../scripts/lib/component-registry/build.mjs";

export {
  readComponentRegistry,
  buildExpectedComponentRegistry,
  compareComponentRegistryToSources,
  syncComponentRegistry,
} from "../../scripts/lib/component-registry/sync.mjs";

export {
  syncComponentOverview,
  buildComponentListLines,
  upsertComponentList,
} from "../../scripts/lib/component-registry/overview-sync.mjs";

export {
  syncDocumentationIndices,
} from "../../scripts/lib/component-registry/refresh.mjs";

// Export utils with type assertions
import { normalizeSortKey as normalizeSortKeyJs, stableHash as stableHashJs } from "../../scripts/lib/component-registry/utils.mjs";

export const normalizeSortKey = normalizeSortKeyJs as import("../types/component-registry.js").NormalizeSortKeyFn;
export const stableHash = stableHashJs as import("../types/component-registry.js").StableHashFn;
