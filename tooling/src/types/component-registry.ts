/**
 * Type definitions for component registry module.
 */

/**
 * Schema version for the component registry.
 */
export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

/**
 * Pipeline stage order for component documentation workflow.
 */
export const PIPELINE_STAGE_ORDER = [
  "missing-spec",
  "spec",
  "markdown",
  "visual-proof",
] as const;

/**
 * Type for pipeline stages.
 */
export type PipelineStage = typeof PIPELINE_STAGE_ORDER[number];

/**
 * Spec status values.
 */
export type SpecStatus = "missing" | "unknown" | "draft" | "ready";

/**
 * Doc status values.
 */
export type DocStatus = "missing" | "unknown" | "draft" | "ready" | "needs-review";

/**
 * Component spec state.
 */
export interface ComponentSpecState {
  exists: boolean;
  status: SpecStatus;
  name: string;
  componentSetNodeId: string | null;
}

/**
 * Component doc state.
 */
export interface ComponentDocState {
  exists: boolean;
  status: DocStatus;
  title: string;
  figmaFileUrl: string | null;
  componentSetNodeId: string | null;
}

/**
 * Visual proof variant.
 */
export interface VisualProofVariant {
  name: string;
  node_id: string | null;
  screenshot_url: string | null;
  image_path: string | null;
  captured_at: string | null;
  image_sha256: string | null;
  image_bytes: number | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
}

/**
 * Component visual proof state.
 */
export interface ComponentVisualProofState {
  exists: boolean;
  screenshotUrl: string | null;
  imagePath: string | null;
  sourceUrl: string | null;
  nodeId: string | null;
  capturedAt: string | null;
  imageSha256: string | null;
  imageBytes: number | null;
  imageContentType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  variants: VisualProofVariant[];
}

/**
 * Component registry entry paths.
 */
export interface ComponentRegistryPaths {
  spec: string;
  doc: string;
  visual_proof: string;
}

/**
 * Component registry entry.
 */
export interface ComponentRegistryEntry {
  slug: string;
  display_name: string;
  paths: ComponentRegistryPaths;
  spec: ComponentSpecState;
  doc: ComponentDocState;
  figma: {
    file_url: string | null;
    component_set_node_id: string | null;
  };
  visual_proof: {
    exists: boolean;
    screenshot_url: string | null;
    image_path: string | null;
    captured_at: string | null;
    node_id: string | null;
    image_sha256: string | null;
    image_bytes: number | null;
    image_content_type: string | null;
    image_width: number | null;
    image_height: number | null;
    variants_count: number;
    variants: VisualProofVariant[];
  };
  pipeline_stage: PipelineStage;
  ready_for_publish: boolean;
  fingerprint_sha256: string;
}

/**
 * Component registry summary.
 */
export interface ComponentRegistrySummary {
  total_components: number;
  with_spec: number;
  with_doc: number;
  with_visual_proof: number;
  ready_for_publish: number;
  by_pipeline_stage: Record<PipelineStage, number>;
}

/**
 * Component registry structure.
 */
export interface ComponentRegistry {
  schema_version: number;
  components: ComponentRegistryEntry[];
  summary: ComponentRegistrySummary;
  fingerprint_sha256: string;
}

/**
 * Validation error for component registry.
 */
export interface RegistryValidationError {
  code: string;
  message: string;
  path: string;
}

/**
 * Validation result for component registry.
 */
export interface RegistryValidationResult {
  ok: boolean;
  errors: RegistryValidationError[];
}

/**
 * Options for building component registry.
 */
export interface BuildRegistryOptions {
  specsDir?: string;
  docsDir?: string;
  proofsDir?: string;
}

/**
 * Options for reading component registry.
 */
export interface ReadRegistryOptions {
  allowMissing?: boolean;
}

/**
 * Result of reading component registry.
 */
export interface ReadRegistryResult {
  exists: boolean;
  registry: ComponentRegistry | null;
  validation: RegistryValidationResult;
}

/**
 * Result of comparing registry to sources.
 */
export interface CompareRegistryResult {
  exists: boolean;
  matches: boolean;
  expected: ComponentRegistry;
  current: ComponentRegistry | null;
  expectedJson: string;
  currentJson: string;
}

/**
 * Options for syncing component registry.
 */
export interface SyncRegistryOptions {
  dryRun?: boolean;
}

/**
 * Result of syncing component registry.
 */
export interface SyncRegistryResult {
  ok: boolean;
  dryRun: boolean;
  changed: boolean;
  written: boolean;
  registryPath: string;
  schemaVersion: number;
  summary: ComponentRegistrySummary;
  fingerprint: string;
}

/**
 * Result of syncing component overview.
 */
export interface SyncOverviewResult {
  ok: boolean;
  dryRun: boolean;
  changed: boolean;
  written: boolean;
  overviewPath: string;
  registryPath: string;
  componentCount: number;
}

/**
 * Result of syncing documentation indices.
 */
export interface SyncIndicesResult {
  ok: boolean;
  dryRun: boolean;
  atomic: boolean;
  changed: boolean;
  written: boolean;
  registry: SyncRegistryResult;
  overview: SyncOverviewResult;
}

/**
 * Function type for normalizing sort keys.
 */
export type NormalizeSortKeyFn = (raw: string) => string;

/**
 * Function type for computing stable hash.
 */
export type StableHashFn = (value: unknown) => string;
