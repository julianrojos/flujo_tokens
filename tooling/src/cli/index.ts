/**
 * CLI entrypoint for the CSS variables generator.
 *
 * Orchestrates the pipeline: ingest → index → analyze → emit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Types
import type {
    TokenValue,
    CssVarOwner,
    CssVarCollision,
    EmissionContext,
    IndexingContext,
    ExecutionSummary,
    TokenGraph
} from '../types/tokens.js';
import { isModeDefaultKey } from '../types/tokens.js';

// Runtime
import { resetRuntimeState, foundModeKeys, modeFallbackCounts, modeFallbackExamples } from '../runtime/state.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';
import {
    hashJsonInputDirectory,
    sha256FromObject,
    sha256FromFile,
    type PipelinePhase,
    type InputHashSnapshot
} from '../runtime/pipeline-cache.js';
import { runPipelinePlugins, type PipelinePlugin } from '../runtime/pipeline-plugins.js';
import { parseArgs, printUsage, type CliOptions } from './options.js';
import { loadExternalPhasePlugins } from './plugins.js';
import { runIngestPhase as runIngestPhaseModule } from './phases/ingest.js';
import { runIndexPhase as runIndexPhaseModule } from './phases/index.js';
import { runAnalyzePhase as runAnalyzePhaseModule } from './phases/analyze.js';
import { runEmitPhase as runEmitPhaseModule } from './phases/emit.js';

// Utils
import { normalizeModeName, normalizePreferredMode, matchesPreferredMode } from '../utils/modes.js';
import { printExecutionSummary, printModeSummary, printModeFallbackSummary } from '../utils/reporting.js';

// Core
import { collectTokenMaps } from '../core/indexing.js';
import { buildCycleStatusFromGraph, buildEmittableKeySetFromGraph, createTokenGraph } from '../core/token-graph.js';

// --- Path configuration & arg parsing ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');
const PIPELINE_SCHEMA_VERSION = 2;
const PHASE_ORDER: PipelinePhase[] = ['ingest', 'index', 'analyze', 'emit'];

type ModeScope = {
    selector: string;
    mode?: string;
    skipBaseWhenMode: boolean;
    modeOverridesOnly: boolean;
    allowModeBranches: boolean;
};

type FileEntry = {
    originalName: string;
    content: any;
};

type SerializedIndexContext = {
    refMap: Array<[string, string]>;
    valueMap: Array<[string, TokenValue]>;
    collisionKeys: string[];
    idToVarName: Array<[string, string]>;
    idToTokenKey: Array<[string, string]>;
};

type SerializedScopeIndex = {
    scope: ModeScope;
    index: SerializedIndexContext;
};

type SerializedTokenGraph = {
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
    edges: Array<[string, Array<{ from: string; to: string; kind: 'w3c-ref' | 'alias-id'; ref: string }>]>;
    reverseEdges: Array<[string, Array<{ from: string; to: string; kind: 'w3c-ref' | 'alias-id'; ref: string }>]>;
    collections: Array<[string, string[]]>;
    modes: Array<[string, { key: string; selector?: string; isDefault?: boolean }]>;
    pathToNodeId: Array<[string, string]>;
    idToNodeId: Array<[string, string]>;
    cycleNodeIds: string[];
};

type SerializedAnalyzedScope = {
    scope: ModeScope;
    index: SerializedIndexContext;
    graph: SerializedTokenGraph;
    cycleStatus: Array<[string, boolean]>;
    emittableKeys: string[];
};

type SerializedCssVarCollision = {
    first: CssVarOwner;
    others: Array<[string, CssVarOwner]>;
};

type IndexCheckpointPayload = {
    ingestHash: string;
    preferredMode?: string;
    modeStrictPreferred: boolean;
    detectedModes: string[];
    emittedModes: string[];
    scopes: ModeScope[];
    scopedIndices: SerializedScopeIndex[];
    cssVarNameOwners: Array<[string, CssVarOwner]>;
    cssVarNameCollisionMap: Array<[string, SerializedCssVarCollision]>;
    cssVarNameCollisions: number;
    cssVarNameCollisionDetails: string[];
};

type SummarySnapshot = {
    totalTokens: number;
    successCount: number;
    unresolvedRefs: string[];
    invalidNames: string[];
    circularDeps: number;
    depthLimitHits: number;
    cssVarNameCollisions: number;
    cssVarNameCollisionDetails: string[];
    invalidTokens: string[];
    tokenTypeCounts: Record<string, number>;
};

type EmitOutputSnapshot = {
    label: string;
    filePath: string;
    contentHash: string;
};

type EmitCheckpointPayload = {
    analyzeHash: string;
    emitHash: string;
    outputs: EmitOutputSnapshot[];
    registry?: { filePath: string; contentHash: string };
    summary: SummarySnapshot;
    detectedModes: string[];
    emittedModes: string[];
};

type OutputTarget = {
    label: string;
    filePath: string;
    emitEntries: FileEntry[];
};

type PipelineExecutionState = {
    summary: ExecutionSummary;
    checkpointsEnabled: boolean;
    inputSnapshot: InputHashSnapshot;
    ingestDependencyHash: string;
    combinedTokens: Record<string, any>;
    fileEntries: FileEntry[];
    indexDependencyHash: string;
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
    scopedIndices: SerializedScopeIndex[];
    cssVarNameOwners: Map<string, CssVarOwner>;
    cssVarNameCollisionMap: Map<string, CssVarCollision>;
    analyzeDependencyHash: string;
    analyzedScopes: SerializedAnalyzedScope[];
    outputs: OutputTarget[];
    emitManifestPath: string;
    emitDependencyHash: string;
};

type TokenPipelinePlugin = PipelinePlugin<PipelineExecutionState>;

function readToolVersion(): string {
    try {
        const raw = fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8');
        const parsed = JSON.parse(raw) as { version?: string };
        return `css-variables-generator@${parsed.version || 'unknown'}`;
    } catch {
        return 'css-variables-generator@unknown';
    }
}

const TOOL_VERSION = readToolVersion();

function getPhaseIndex(phase: PipelinePhase): number {
    return PHASE_ORDER.indexOf(phase);
}

function shouldBypassCheckpoint(phase: PipelinePhase, fromPhase: PipelinePhase | undefined, forcePhases: PipelinePhase[]): boolean {
    const fromIndex = fromPhase ? getPhaseIndex(fromPhase) : Number.POSITIVE_INFINITY;
    const forceIndices = forcePhases.map(p => getPhaseIndex(p));
    const forceFromIndex = forceIndices.length > 0 ? Math.min(...forceIndices) : Number.POSITIVE_INFINITY;
    const rerunFrom = Math.min(fromIndex, forceFromIndex);
    return getPhaseIndex(phase) >= rerunFrom;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function serializeIndexingContext(ctx: Readonly<IndexingContext>): SerializedIndexContext {
    return {
        refMap: Array.from(ctx.refMap.entries()),
        valueMap: Array.from(ctx.valueMap.entries()),
        collisionKeys: Array.from(ctx.collisionKeys.values()),
        idToVarName: Array.from(ctx.idToVarName.entries()),
        idToTokenKey: Array.from(ctx.idToTokenKey.entries())
    };
}

function createIndexingContextFromSerialized(serialized: SerializedIndexContext): Readonly<IndexingContext> {
    const summary = createSummary();
    return createProcessingContext({
        summary,
        refMap: new Map<string, string>(serialized.refMap),
        valueMap: new Map<string, TokenValue>(serialized.valueMap),
        collisionKeys: new Set<string>(serialized.collisionKeys),
        idToVarName: new Map<string, string>(serialized.idToVarName),
        idToTokenKey: new Map<string, string>(serialized.idToTokenKey)
    });
}

function serializeTokenGraph(graph: TokenGraph): SerializedTokenGraph {
    return {
        nodes: Array.from(graph.nodes.entries()),
        edges: Array.from(graph.edges.entries()),
        reverseEdges: Array.from(graph.reverseEdges.entries()),
        collections: Array.from(graph.collections.entries()),
        modes: Array.from(graph.modes.entries()),
        pathToNodeId: Array.from(graph.pathToNodeId.entries()),
        idToNodeId: Array.from(graph.idToNodeId.entries()),
        cycleNodeIds: Array.from(graph.cycleNodeIds.values())
    };
}

function deserializeTokenGraph(serialized: SerializedTokenGraph): TokenGraph {
    return {
        nodes: new Map(serialized.nodes),
        edges: new Map(serialized.edges),
        reverseEdges: new Map(serialized.reverseEdges),
        collections: new Map(serialized.collections),
        modes: new Map(serialized.modes),
        pathToNodeId: new Map(serialized.pathToNodeId),
        idToNodeId: new Map(serialized.idToNodeId),
        cycleNodeIds: new Set(serialized.cycleNodeIds)
    };
}

function serializeCssCollisionMap(
    map: Map<string, CssVarCollision>
): Array<[string, SerializedCssVarCollision]> {
    return Array.from(map.entries()).map(([name, collision]) => [
        name,
        {
            first: collision.first,
            others: Array.from(collision.others.entries())
        }
    ]);
}

function deserializeCssCollisionMap(
    entries: Array<[string, SerializedCssVarCollision]>
): Map<string, CssVarCollision> {
    const map = new Map<string, CssVarCollision>();
    for (const [name, collision] of entries) {
        map.set(name, {
            first: collision.first,
            others: new Map<string, CssVarOwner>(collision.others)
        });
    }
    return map;
}

function toSummarySnapshot(summary: ExecutionSummary): SummarySnapshot {
    return {
        totalTokens: summary.totalTokens,
        successCount: summary.successCount,
        unresolvedRefs: [...summary.unresolvedRefs],
        invalidNames: [...summary.invalidNames],
        circularDeps: summary.circularDeps,
        depthLimitHits: summary.depthLimitHits,
        cssVarNameCollisions: summary.cssVarNameCollisions,
        cssVarNameCollisionDetails: [...summary.cssVarNameCollisionDetails],
        invalidTokens: [...summary.invalidTokens],
        tokenTypeCounts: { ...summary.tokenTypeCounts }
    };
}

function fromSummarySnapshot(snapshot: SummarySnapshot): ExecutionSummary {
    return {
        totalTokens: snapshot.totalTokens,
        successCount: snapshot.successCount,
        unresolvedRefs: [...snapshot.unresolvedRefs],
        invalidNames: [...snapshot.invalidNames],
        circularDeps: snapshot.circularDeps,
        depthLimitHits: snapshot.depthLimitHits,
        cssVarNameCollisions: snapshot.cssVarNameCollisions,
        cssVarNameCollisionDetails: [...snapshot.cssVarNameCollisionDetails],
        invalidTokens: [...snapshot.invalidTokens],
        tokenTypeCounts: { ...snapshot.tokenTypeCounts },
        countedTokenKeys: new Set<string>(),
        countedGeneratedKeys: new Set<string>(),
        countedTokenTypeKeys: new Set<string>()
    };
}

const parsedArgs = parseArgs(process.argv.slice(2), { rootDir: ROOT_DIR });
if (!parsedArgs) {
    printUsage();
    process.exit(1);
}

if (parsedArgs.help) {
    printUsage();
    process.exit(0);
}

const options: CliOptions = parsedArgs;

const JSON_DIR = options.inputDir;
const OUTPUT_FILE = options.outputFile;
const OUTPUT_PRIMITIVES = options.outputPrimitives;
const OUTPUT_TOKENS = options.outputTokens;
const REGISTRY_OUTPUT = options.registryOutput;
const SPLIT_OUTPUT = options.split;
const REGISTRY_ENABLED = options.registry;
const PREFERRED_MODE = options.mode?.trim() || undefined;
const MODE_STRICT = options.modeStrict;
const MODE_STRICT_PREFERRED = MODE_STRICT && !!PREFERRED_MODE;

const effectiveSystemId = options.system || 'default';
const CACHE_DIR = options.cacheDir || path.resolve(ROOT_DIR, '.cache', `tokens-${effectiveSystemId}`);
const INGEST_CHECKPOINT_PATH = path.join(CACHE_DIR, 'ingest-hash.json');
const INDEX_CHECKPOINT_PATH = path.join(CACHE_DIR, 'index-map.json');
const ANALYZE_CHECKPOINT_PATH = path.join(CACHE_DIR, 'analysis-report.json');

if (MODE_STRICT && !PREFERRED_MODE) {
    console.warn(
        'ℹ️  --mode-strict was provided without --mode <name>; strict checks apply only when a preferred mode is set. Continuing in loose mode.'
    );
}

function buildIndexArtifacts(
    fileEntries: FileEntry[],
    summary: ExecutionSummary,
    preferredMode: string | undefined,
    modeStrictPreferred: boolean
): {
    payload: IndexCheckpointPayload;
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
    cssVarNameOwners: Map<string, CssVarOwner>;
    cssVarNameCollisionMap: Map<string, CssVarCollision>;
} {
    const refMap = new Map<string, string>();
    const valueMap = new Map<string, TokenValue>();
    const collisionKeys = new Set<string>();
    const idToVarName = new Map<string, string>();
    const idToTokenKey = new Map<string, string>();

    const cssVarNameOwners = new Map<string, CssVarOwner>();
    const cssVarNameCollisionMap = new Map<string, CssVarCollision>();

    const indexingCtx = createProcessingContext({
        summary,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        idToTokenKey,
        cssVarNameOwners,
        cssVarNameCollisionMap
    });

    for (const { originalName, content } of fileEntries) {
        collectTokenMaps(indexingCtx, content, [], [originalName], preferredMode, modeStrictPreferred, true);
    }

    const modeKeys = Array.from(foundModeKeys);
    const sortedModes = modeKeys.slice().sort((a, b) => normalizeModeName(a).localeCompare(normalizeModeName(b)));
    const detectedModeSet = new Set<string>(sortedModes);

    const scopes: ModeScope[] = [];
    scopes.push({ selector: ':root', mode: undefined, skipBaseWhenMode: false, modeOverridesOnly: false, allowModeBranches: false });

    let emittedModes = sortedModes.filter(modeKey => !isModeDefaultKey(modeKey));
    const preferredForEmission = normalizePreferredMode(preferredMode);
    if (preferredForEmission) {
        const preferredModes = emittedModes.filter(modeKey => matchesPreferredMode(modeKey, preferredForEmission));
        if (preferredModes.length > 0) {
            emittedModes = preferredModes;
        } else {
            console.warn(`ℹ️  Preferred mode "${preferredMode}" was not detected in mode scopes; emitting all detected modes.`);
        }
    }

    for (const modeKey of emittedModes) {
        const selectorValue = normalizeModeName(modeKey);
        const selector = `[data-theme="${selectorValue}"]`;
        scopes.push({ selector, mode: modeKey, skipBaseWhenMode: true, modeOverridesOnly: true, allowModeBranches: true });
    }
    const emittedModeSet = new Set<string>(emittedModes);

    const baseRefMap = new Map<string, string>();
    const baseValueMap = new Map<string, TokenValue>();
    const baseCollisionKeys = new Set<string>();
    const baseIdToVarName = new Map<string, string>();
    const baseIdToTokenKey = new Map<string, string>();

    const baseSummary = createSummary();
    const baseIndexingCtx = createProcessingContext({
        summary: baseSummary,
        refMap: baseRefMap,
        valueMap: baseValueMap,
        collisionKeys: baseCollisionKeys,
        idToVarName: baseIdToVarName,
        idToTokenKey: baseIdToTokenKey
    });

    for (const { originalName, content } of fileEntries) {
        collectTokenMaps(
            baseIndexingCtx,
            content,
            [],
            [originalName],
            undefined,
            modeStrictPreferred,
            false,
            false,
            false
        );
    }

    const scopedIndices: SerializedScopeIndex[] = [];
    for (const scope of scopes) {
        const scopeRefMap = new Map<string, string>(baseRefMap);
        const scopeValueMap = new Map<string, TokenValue>(baseValueMap);
        const scopeCollisionKeys = new Set<string>(baseCollisionKeys);
        const scopeIdToVarName = new Map<string, string>(baseIdToVarName);
        const scopeIdToTokenKey = new Map<string, string>(baseIdToTokenKey);
        const scopeSummary = createSummary();
        const scopeIndexingCtx = createProcessingContext({
            summary: scopeSummary,
            refMap: scopeRefMap,
            valueMap: scopeValueMap,
            collisionKeys: scopeCollisionKeys,
            idToVarName: scopeIdToVarName,
            idToTokenKey: scopeIdToTokenKey
        });

        if (scope.mode) {
            for (const { originalName, content } of fileEntries) {
                collectTokenMaps(
                    scopeIndexingCtx,
                    content,
                    [],
                    [originalName],
                    scope.mode,
                    false,
                    scope.skipBaseWhenMode,
                    scope.modeOverridesOnly,
                    scope.allowModeBranches
                );
            }
        }

        scopedIndices.push({
            scope,
            index: serializeIndexingContext(scopeIndexingCtx)
        });
    }

    const payload: IndexCheckpointPayload = {
        ingestHash: '',
        preferredMode,
        modeStrictPreferred,
        detectedModes: Array.from(detectedModeSet),
        emittedModes: Array.from(emittedModeSet),
        scopes,
        scopedIndices,
        cssVarNameOwners: Array.from(cssVarNameOwners.entries()),
        cssVarNameCollisionMap: serializeCssCollisionMap(cssVarNameCollisionMap),
        cssVarNameCollisions: summary.cssVarNameCollisions,
        cssVarNameCollisionDetails: [...summary.cssVarNameCollisionDetails]
    };

    return { payload, detectedModeSet, emittedModeSet, cssVarNameOwners, cssVarNameCollisionMap };
}

function analyzeScopedIndices(scopedIndices: SerializedScopeIndex[]): SerializedAnalyzedScope[] {
    return scopedIndices.map(({ scope, index }) => {
        const scopeIndexingCtx = createIndexingContextFromSerialized(index);
        const graph = createTokenGraph(scopeIndexingCtx, {
            key: scope.mode ?? 'modeDefault',
            selector: scope.selector,
            isDefault: !scope.mode
        });
        const cycleStatus = buildCycleStatusFromGraph(graph);
        const emittableKeys = buildEmittableKeySetFromGraph(graph);
        return {
            scope,
            index,
            graph: serializeTokenGraph(graph),
            cycleStatus: Array.from(cycleStatus.entries()),
            emittableKeys: Array.from(emittableKeys.values()).sort((a, b) => a.localeCompare(b))
        };
    });
}

function buildScopeProcessingContexts(
    analyzedScopes: SerializedAnalyzedScope[],
    summary: ExecutionSummary,
    combinedTokens: Record<string, any>,
    cssVarNameOwners: Map<string, CssVarOwner>,
    cssVarNameCollisionMap: Map<string, CssVarCollision>
): Array<{ scope: ModeScope; processingCtx: Readonly<EmissionContext> }> {
    return analyzedScopes.map(({ scope, index, graph, cycleStatus, emittableKeys }) => {
        const processingCtx = createProcessingContext({
            summary,
            tokensData: combinedTokens,
            refMap: new Map<string, string>(index.refMap),
            valueMap: new Map<string, TokenValue>(index.valueMap),
            collisionKeys: new Set<string>(index.collisionKeys),
            idToVarName: new Map<string, string>(index.idToVarName),
            idToTokenKey: new Map<string, string>(index.idToTokenKey),
            cycleStatus: new Map<string, boolean>(cycleStatus),
            emittableKeys: new Set<string>(emittableKeys),
            tokenGraph: deserializeTokenGraph(graph),
            cssVarNameOwners,
            cssVarNameCollisionMap
        });
        return { scope, processingCtx };
    });
}

function getOutputTargets(fileEntries: FileEntry[]): OutputTarget[] {
    const primitiveEntries = fileEntries.filter(entry => entry.originalName.startsWith('_'));
    const tokenEntries = fileEntries.filter(entry => !entry.originalName.startsWith('_'));

    return SPLIT_OUTPUT
        ? [
            { label: 'primitives', filePath: OUTPUT_PRIMITIVES, emitEntries: primitiveEntries },
            { label: 'tokens', filePath: OUTPUT_TOKENS, emitEntries: tokenEntries }
        ]
        : [{ label: 'custom properties', filePath: OUTPUT_FILE, emitEntries: fileEntries }];
}

function getEmitManifestPath(outputs: OutputTarget[]): string {
    const dirs = outputs.map(output => path.dirname(output.filePath));
    const allSame = dirs.every(dir => dir === dirs[0]);
    const manifestDir = allSame ? dirs[0] : path.dirname(OUTPUT_FILE);
    return path.join(manifestDir, '.emit-manifest.json');
}

function isEmitCheckpointUsable(
    payload: EmitCheckpointPayload,
    outputs: OutputTarget[],
    registryEnabled: boolean,
    registryOutput: string
): boolean {
    if (payload.outputs.length !== outputs.length) return false;

    for (const output of outputs) {
        const snapshot = payload.outputs.find(item => item.filePath === output.filePath);
        if (!snapshot) return false;
        if (!fs.existsSync(output.filePath)) return false;
        const currentHash = sha256FromFile(output.filePath);
        if (currentHash !== snapshot.contentHash) return false;
    }

    if (!registryEnabled) return true;
    if (!payload.registry) return false;
    if (payload.registry.filePath !== registryOutput) return false;
    if (!fs.existsSync(registryOutput)) return false;
    const registryHash = sha256FromFile(registryOutput);
    return registryHash === payload.registry.contentHash;
}

// --- Main execution ---

function createCorePipelinePlugins(): TokenPipelinePlugin[] {
    return [
        {
            name: 'core:ingest',
            phase: 'ingest',
            placement: 'core',
            transform: ({ state }) =>
                runIngestPhaseModule(state, {
                    options: {
                        fromPhase: options.fromPhase,
                        forcePhases: options.forcePhases
                    },
                    ingestCheckpointPath: INGEST_CHECKPOINT_PATH,
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    jsonDir: JSON_DIR,
                    shouldBypassCheckpoint
                })
        },
        {
            name: 'core:index',
            phase: 'index',
            placement: 'core',
            transform: ({ state }) =>
                runIndexPhaseModule(state, {
                    options: {
                        fromPhase: options.fromPhase,
                        forcePhases: options.forcePhases,
                        preferredMode: PREFERRED_MODE,
                        modeStrictPreferred: MODE_STRICT_PREFERRED
                    },
                    indexCheckpointPath: INDEX_CHECKPOINT_PATH,
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    shouldBypassCheckpoint,
                    sha256FromObject,
                    deserializeCssCollisionMap,
                    buildIndexArtifacts
                })
        },
        {
            name: 'core:analyze',
            phase: 'analyze',
            placement: 'core',
            transform: ({ state }) =>
                runAnalyzePhaseModule(state, {
                    options: {
                        fromPhase: options.fromPhase,
                        forcePhases: options.forcePhases
                    },
                    analyzeCheckpointPath: ANALYZE_CHECKPOINT_PATH,
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    shouldBypassCheckpoint,
                    sha256FromObject,
                    analyzeScopedIndices
                })
        },
        {
            name: 'core:emit',
            phase: 'emit',
            placement: 'core',
            transform: ({ state }) =>
                runEmitPhaseModule(state, {
                    options: {
                        fromPhase: options.fromPhase,
                        forcePhases: options.forcePhases,
                        splitOutput: SPLIT_OUTPUT,
                        registryEnabled: REGISTRY_ENABLED,
                        registryOutput: REGISTRY_OUTPUT,
                        preferredMode: PREFERRED_MODE,
                        modeStrictPreferred: MODE_STRICT_PREFERRED
                    },
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    shouldBypassCheckpoint,
                    toSummarySnapshot,
                    fromSummarySnapshot,
                    getOutputTargets,
                    getEmitManifestPath,
                    isEmitCheckpointUsable,
                    buildScopeProcessingContexts
                })
        }
    ];
}

async function main() {
    resetRuntimeState();

    const checkpointsEnabled = options.checkpoints;
    if (checkpointsEnabled) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const inputSnapshot = hashJsonInputDirectory(JSON_DIR);
    const ingestDependencyHash = sha256FromObject({
        phase: 'ingest',
        inputDir: JSON_DIR,
        inputHash: inputSnapshot.inputHash
    });

    const state: PipelineExecutionState = {
        summary: createSummary(),
        checkpointsEnabled,
        inputSnapshot,
        ingestDependencyHash,
        combinedTokens: {},
        fileEntries: [],
        indexDependencyHash: '',
        detectedModeSet: new Set<string>(),
        emittedModeSet: new Set<string>(),
        scopedIndices: [],
        cssVarNameOwners: new Map<string, CssVarOwner>(),
        cssVarNameCollisionMap: new Map<string, CssVarCollision>(),
        analyzeDependencyHash: '',
        analyzedScopes: [],
        outputs: [],
        emitManifestPath: '',
        emitDependencyHash: ''
    };

    const extensionPlugins = await loadExternalPhasePlugins(options.pluginModules);
    if (extensionPlugins.length > 0) {
        console.log(
            `🔌 Loaded ${extensionPlugins.length} external plugin(s): ${extensionPlugins.map(plugin => plugin.name).join(', ')}`
        );
    }

    const pluginTimeoutRaw = process.env.PIPELINE_PLUGIN_TIMEOUT_MS;
    const pluginTimeoutMs = pluginTimeoutRaw != null ? Number(pluginTimeoutRaw) : undefined;
    if (pluginTimeoutRaw != null && (!Number.isFinite(pluginTimeoutMs) || Number(pluginTimeoutMs) <= 0)) {
        throw new Error(
            `Invalid PIPELINE_PLUGIN_TIMEOUT_MS="${pluginTimeoutRaw}". Expected a positive number of milliseconds.`
        );
    }

    await runPipelinePlugins({
        phases: PHASE_ORDER,
        plugins: [...createCorePipelinePlugins(), ...extensionPlugins],
        state,
        pluginTimeoutMs
    });

    printExecutionSummary(state.summary);
    printModeSummary(state.emittedModeSet, 'emitted');
    if (!setsEqual(state.emittedModeSet, state.detectedModeSet)) {
        printModeSummary(state.detectedModeSet, 'detected');
    }
    printModeFallbackSummary(modeFallbackCounts, modeFallbackExamples);
}

main().catch(err => {
    console.error('❌ Error generating CSS variables:');
    if (err instanceof Error) {
        console.error(`   ${err.message}`);
        if (err.stack) console.error(`   ${err.stack}`);
    } else {
        console.error(err);
    }
    process.exit(1);
});
