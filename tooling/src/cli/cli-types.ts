/**
 * CLI Types
 *
 * Type definitions for the CSS variables generator CLI.
 * These types are used for checkpoint serialization and pipeline state management.
 */

import type { TokenValue, CssVarOwner, CssVarCollision, ExecutionSummary, TokenGraph } from '../types/tokens.js';
import type { PipelinePlugin } from '../runtime/pipeline-plugins.js';
import type { InputHashSnapshot } from '../runtime/pipeline-cache.js';

/**
 * Configuration for a theme mode scope.
 * Defines how a specific mode (e.g., "dark", "desktop") should be rendered.
 */
export type ModeScope = {
    /** CSS selector for the mode (e.g., `[data-theme="dark"]` or `:root` for base) */
    selector: string;
    /** Mode key name (e.g., "modeDark", "modeDesktop"). Undefined for base scope. */
    mode?: string;
    /** Whether to skip emitting the base $value when this mode is present */
    skipBaseWhenMode: boolean;
    /** Whether to emit only mode-specific overrides, not base tokens */
    modeOverridesOnly: boolean;
    /** Whether to allow branching into mode-specific token trees */
    allowModeBranches: boolean;
};

/**
 * Raw file entry from the input directory.
 */
export type FileEntry = {
    /** Original filename (e.g., "tokens.json") */
    originalName: string;
    /** Parsed JSON content of the file */
    content: any;
};

/**
 * Serialized representation of an indexing context.
 * Used for checkpoint persistence and cross-scope sharing.
 */
export type SerializedIndexContext = {
    /** W3C reference path → CSS variable name mapping */
    refMap: Array<[string, string]>;
    /** Token path → token value mapping */
    valueMap: Array<[string, TokenValue]>;
    /** List of token keys with naming collisions */
    collisionKeys: string[];
    /** Figma variable ID → CSS variable name mapping */
    idToVarName: Array<[string, string]>;
    /** Figma variable ID → normalized token path mapping */
    idToTokenKey: Array<[string, string]>;
};

/**
 * Index context paired with its mode scope.
 * Represents the token resolution state for a specific theme mode.
 */
export type SerializedScopeIndex = {
    /** The mode scope configuration */
    scope: ModeScope;
    /** Serialized token maps for this scope */
    index: SerializedIndexContext;
};

/**
 * Serialized representation of the token dependency graph.
 * Captures token relationships, cycles, and metadata for analysis.
 */
export type SerializedTokenGraph = {
    /** Node ID → token node data mapping */
    nodes: Array<
        [
            string,
            {
                id: string;
                path: string[];
                value: TokenValue['$value'];
                type?: string;
                aliases: string[];
                dependents: string[];
                metadata: { collection: string; cssVar?: string; mode?: string };
            }
        ]
    >;
    /** Node ID → outgoing edges (dependencies) */
    edges: Array<[string, Array<{ from: string; to: string; kind: 'w3c-ref' | 'alias-id'; ref: string }>]>;
    /** Node ID → incoming edges (dependents) */
    reverseEdges: Array<[string, Array<{ from: string; to: string; kind: 'w3c-ref' | 'alias-id'; ref: string }>]>;
    /** Collection name → token keys in that collection */
    collections: Array<[string, string[]]>;
    /** Mode key → mode configuration */
    modes: Array<[string, { key: string; selector?: string; isDefault?: boolean }]>;
    /** Token path → node ID mapping */
    pathToNodeId: Array<[string, string]>;
    /** Figma variable ID → node ID mapping */
    idToNodeId: Array<[string, string]>;
    /** Set of node IDs that participate in dependency cycles */
    cycleNodeIds: string[];
};

/**
 * Analysis results for a single mode scope.
 * Contains the resolved token graph with cycle detection and emittable keys.
 */
export type SerializedAnalyzedScope = {
    /** The mode scope this analysis applies to */
    scope: ModeScope;
    /** Serialized token maps for this scope */
    index: SerializedIndexContext;
    /** Serialized token dependency graph */
    graph: SerializedTokenGraph;
    /** Node ID → cycle participation flag */
    cycleStatus: Array<[string, boolean]>;
    /** List of token keys that will be emitted (non-circular, valid) */
    emittableKeys: string[];
};

/**
 * Serialized CSS variable collision data.
 * Captures which tokens collide on the same CSS variable name.
 */
export type SerializedCssVarCollision = {
    /** First token that claimed this CSS variable name */
    first: CssVarOwner;
    /** Subsequent tokens that also map to this name */
    others: Array<[string, CssVarOwner]>;
};

/**
 * Checkpoint payload for the index phase.
 * Persisted to disk to skip re-indexing when input tokens are unchanged.
 */
export type IndexCheckpointPayload = {
    /** Hash of the ingest phase output (dependency tracking) */
    ingestHash: string;
    /** Preferred mode from CLI args (e.g., "desktop", "dark") */
    preferredMode?: string;
    /** Whether strict mode checks apply (only emit preferred mode) */
    modeStrictPreferred: boolean;
    /** All mode keys detected in the token tree */
    detectedModes: string[];
    /** Mode keys that will actually be emitted (filtered by preferred mode) */
    emittedModes: string[];
    /** All mode scopes to emit (base + mode-specific) */
    scopes: ModeScope[];
    /** Serialized token maps for each scope */
    scopedIndices: SerializedScopeIndex[];
    /** CSS variable name → owner mapping for collision tracking */
    cssVarNameOwners: Array<[string, CssVarOwner]>;
    /** CSS variable name → collision data for conflicts */
    cssVarNameCollisionMap: Array<[string, SerializedCssVarCollision]>;
    /** Total number of CSS variable name collisions */
    cssVarNameCollisions: number;
    /** Human-readable collision descriptions for reporting */
    cssVarNameCollisionDetails: string[];
};

/**
 * Snapshot of execution summary for checkpoint persistence.
 * Captures pipeline metrics and error counts.
 */
export type SummarySnapshot = {
    /** Total unique tokens processed */
    totalTokens: number;
    /** Total unique CSS variables generated */
    successCount: number;
    /** List of unresolved W3C references and alias IDs */
    unresolvedRefs: string[];
    /** List of invalid CSS variable names */
    invalidNames: string[];
    /** Number of circular dependencies detected */
    circularDeps: number;
    /** Number of tokens that exceeded max depth */
    depthLimitHits: number;
    /** Number of CSS variable name collisions */
    cssVarNameCollisions: number;
    /** Human-readable collision descriptions */
    cssVarNameCollisionDetails: string[];
    /** List of invalid tokens (missing $type, etc.) */
    invalidTokens: string[];
    /** Token counts by type (e.g., { color: 127, dimension: 183 }) */
    tokenTypeCounts: Record<string, number>;
};

/**
 * Snapshot of a single emitted output file.
 * Used for change detection between pipeline runs.
 */
export type EmitOutputSnapshot = {
    /** Human-readable label (e.g., "primitives", "tokens") */
    label: string;
    /** Absolute file path of the output */
    filePath: string;
    /** SHA-256 hash of the file content */
    contentHash: string;
};

/**
 * Checkpoint payload for the emit phase.
 * Persisted to disk to skip re-emission when analyzed tokens are unchanged.
 */
export type EmitCheckpointPayload = {
    /** Hash of the analyze phase output (dependency tracking) */
    analyzeHash: string;
    /** Hash of the emit phase configuration */
    emitHash: string;
    /** Snapshots of all emitted CSS files */
    outputs: EmitOutputSnapshot[];
    /** Execution summary metrics */
    summary: SummarySnapshot;
    /** All mode keys detected during indexing */
    detectedModes: string[];
    /** Mode keys actually emitted (filtered by preferred mode) */
    emittedModes: string[];
};

/**
 * Target output file configuration.
 * Groups token entries by output destination (primitives vs tokens).
 */
export type OutputTarget = {
    /** Human-readable label for the output */
    label: string;
    /** Absolute file path for the output */
    filePath: string;
    /** Token file entries to emit in this output */
    emitEntries: FileEntry[];
};

/**
 * Complete pipeline execution state.
 * Accumulated and mutated across all pipeline phases.
 */
export type PipelineExecutionState = {
    /** Execution summary (errors, counts, metrics) */
    summary: ExecutionSummary;
    /** Whether checkpoint persistence is enabled */
    checkpointsEnabled: boolean;
    /** Input directory hash for change detection */
    inputSnapshot: InputHashSnapshot;
    /** Dependency hash for the ingest phase */
    ingestDependencyHash: string;
    /** Combined token trees from all input files */
    combinedTokens: Record<string, any>;
    /** Raw file entries from the input directory */
    fileEntries: FileEntry[];
    /** Dependency hash for the index phase */
    indexDependencyHash: string;
    /** All mode keys detected in the token tree */
    detectedModeSet: Set<string>;
    /** Mode keys selected for emission */
    emittedModeSet: Set<string>;
    /** Serialized token maps for each mode scope */
    scopedIndices: SerializedScopeIndex[];
    /** CSS variable name → owner mapping */
    cssVarNameOwners: Map<string, CssVarOwner>;
    /** CSS variable name → collision data */
    cssVarNameCollisionMap: Map<string, CssVarCollision>;
    /** Dependency hash for the analyze phase */
    analyzeDependencyHash: string;
    /** Analysis results for each mode scope */
    analyzedScopes: SerializedAnalyzedScope[];
    /** Output file targets to generate */
    outputs: OutputTarget[];
    /** Path to the emit manifest */
    emitManifestPath: string;
    /** Dependency hash for the emit phase */
    emitDependencyHash: string;
};

/**
 * Pipeline plugin specialized for token processing.
 * Uses the full pipeline execution state.
 */
export type TokenPipelinePlugin = PipelinePlugin<PipelineExecutionState>;
