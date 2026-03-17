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
import { resetRuntimeState, modeFallbackCounts, modeFallbackExamples } from '../runtime/state.js';
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
import { buildIndexArtifacts, analyzeScopedIndices } from './phases/index-artifacts.js';
import {
    serializeIndexingContext,
    createIndexingContextFromSerialized,
    serializeTokenGraph,
    deserializeTokenGraph,
    serializeCssCollisionMap,
    deserializeCssCollisionMap,
    toSummarySnapshot,
    fromSummarySnapshot
} from './checkpoint-serializer.js';
import type {
    ModeScope,
    FileEntry,
    SerializedIndexContext,
    SerializedScopeIndex,
    SerializedTokenGraph,
    SerializedAnalyzedScope,
    SerializedCssVarCollision,
    IndexCheckpointPayload,
    SummarySnapshot,
    EmitOutputSnapshot,
    EmitCheckpointPayload,
    OutputTarget,
    PipelineExecutionState,
    TokenPipelinePlugin
} from './cli-types.js';
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
type PipelineContextConfig = {
    jsonDir: string;
    outputFile: string;
    outputPrimitives: string;
    outputTokens: string;
    registryOutput: string;
    splitOutput: boolean;
    registryEnabled: boolean;
    preferredMode?: string;
    modeStrict: boolean;
    modeStrictPreferred: boolean;
    effectiveSystemId: string;
    cacheDir: string;
    ingestCheckpointPath: string;
    indexCheckpointPath: string;
    analyzeCheckpointPath: string;
};

function createPipelineContextConfig(args: CliOptions): PipelineContextConfig {
    const preferredMode = args.mode?.trim() || undefined;
    const modeStrict = args.modeStrict;
    const modeStrictPreferred = modeStrict && !!preferredMode;
    const effectiveSystemId = args.system || 'default';
    const cacheDir = args.cacheDir || path.resolve(ROOT_DIR, '.cache', `tokens-${effectiveSystemId}`);
    return {
        jsonDir: args.inputDir,
        outputFile: args.outputFile,
        outputPrimitives: args.outputPrimitives,
        outputTokens: args.outputTokens,
        registryOutput: args.registryOutput,
        splitOutput: args.split,
        registryEnabled: args.registry,
        preferredMode,
        modeStrict,
        modeStrictPreferred,
        effectiveSystemId,
        cacheDir,
        ingestCheckpointPath: path.join(cacheDir, 'ingest-hash.json'),
        indexCheckpointPath: path.join(cacheDir, 'index-map.json'),
        analyzeCheckpointPath: path.join(cacheDir, 'analysis-report.json')
    };
}

const pipelineContext = createPipelineContextConfig(options);

if (pipelineContext.modeStrict && !pipelineContext.preferredMode) {
    console.warn(
        'ℹ️  --mode-strict was provided without --mode <name>; strict checks apply only when a preferred mode is set. Continuing in loose mode.'
    );
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

function getOutputTargets(
    fileEntries: FileEntry[],
    context: Pick<PipelineContextConfig, 'splitOutput' | 'outputPrimitives' | 'outputTokens' | 'outputFile'>
): OutputTarget[] {
    const primitiveEntries = fileEntries.filter(entry => entry.originalName.startsWith('_'));
    const tokenEntries = fileEntries.filter(entry => !entry.originalName.startsWith('_'));

    return context.splitOutput
        ? [
            { label: 'primitives', filePath: context.outputPrimitives, emitEntries: primitiveEntries },
            { label: 'tokens', filePath: context.outputTokens, emitEntries: tokenEntries }
        ]
        : [{ label: 'custom properties', filePath: context.outputFile, emitEntries: fileEntries }];
}

function getEmitManifestPath(outputs: OutputTarget[], outputFile: string): string {
    const dirs = outputs.map(output => path.dirname(output.filePath));
    const allSame = dirs.every(dir => dir === dirs[0]);
    const manifestDir = allSame ? dirs[0] : path.dirname(outputFile);
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
                    ingestCheckpointPath: pipelineContext.ingestCheckpointPath,
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    jsonDir: pipelineContext.jsonDir,
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
                        preferredMode: pipelineContext.preferredMode,
                        modeStrictPreferred: pipelineContext.modeStrictPreferred
                    },
                    indexCheckpointPath: pipelineContext.indexCheckpointPath,
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
                    analyzeCheckpointPath: pipelineContext.analyzeCheckpointPath,
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
                        splitOutput: pipelineContext.splitOutput,
                        registryEnabled: pipelineContext.registryEnabled,
                        registryOutput: pipelineContext.registryOutput,
                        preferredMode: pipelineContext.preferredMode,
                        modeStrictPreferred: pipelineContext.modeStrictPreferred
                    },
                    pipelineSchemaVersion: PIPELINE_SCHEMA_VERSION,
                    toolVersion: TOOL_VERSION,
                    shouldBypassCheckpoint,
                    toSummarySnapshot,
                    fromSummarySnapshot,
                    getOutputTargets: (fileEntries) => getOutputTargets(fileEntries, pipelineContext),
                    getEmitManifestPath: (outputs) => getEmitManifestPath(outputs, pipelineContext.outputFile),
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
        fs.mkdirSync(pipelineContext.cacheDir, { recursive: true });
    }

    const inputSnapshot = hashJsonInputDirectory(pipelineContext.jsonDir);
    const ingestDependencyHash = sha256FromObject({
        phase: 'ingest',
        inputDir: pipelineContext.jsonDir,
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
