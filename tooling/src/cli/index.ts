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
    ExecutionSummary
} from '../types/tokens.js';
import { isModeDefaultKey } from '../types/tokens.js';

// Runtime
import { resetRuntimeState, foundModeKeys, modeFallbackCounts, modeFallbackExamples } from '../runtime/state.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';
import {
    hashJsonInputDirectory,
    loadCheckpoint,
    saveCheckpoint,
    sha256FromObject,
    sha256FromFile,
    sha256FromString,
    type PipelinePhase
} from '../runtime/pipeline-cache.js';

// Utils
import { normalizeModeName, normalizePreferredMode, matchesPreferredMode, formatModeLabel } from '../utils/modes.js';
import { printExecutionSummary, logChangeDetection, printModeSummary, printModeFallbackSummary } from '../utils/reporting.js';

// Core
import { readAndCombineJsons } from '../core/ingest.js';
import { collectTokenMaps } from '../core/indexing.js';
import { buildCycleStatus } from '../core/analyze.js';
import { flattenTokens, buildEmittableKeySet } from '../core/emit.js';
import { readCssVariablesFromFile, extractCssVariables, formatCssSectionHeader } from '../core/css.js';
import { exportTokenRegistry, writeTokenRegistry } from '../core/registry.js';

// --- Path configuration & arg parsing ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');
const PIPELINE_SCHEMA_VERSION = 1;
const PHASE_ORDER: PipelinePhase[] = ['ingest', 'index', 'analyze', 'emit'];

type CliOptions = {
    inputDir: string;
    outputFile: string;
    outputPrimitives: string;
    outputTokens: string;
    registryOutput: string;
    split: boolean;
    registry: boolean;
    help: boolean;
    mode?: string;
    modeStrict: boolean;
    system?: string;
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
    checkpoints: boolean;
    cacheDir?: string;
};

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

type SerializedAnalyzedScope = {
    scope: ModeScope;
    index: SerializedIndexContext;
    cycleStatus: Array<[string, boolean]>;
    emittableKeys: string[];
};

type SerializedCssVarCollision = {
    first: CssVarOwner;
    others: Array<[string, CssVarOwner]>;
};

type IngestCheckpointPayload = {
    inputHash: string;
    files: Array<{ file: string; sha256: string; size: number; mtimeMs: number }>;
    combinedTokens: Record<string, any>;
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

type AnalyzeCheckpointPayload = {
    indexHash: string;
    detectedModes: string[];
    emittedModes: string[];
    analyzedScopes: SerializedAnalyzedScope[];
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

function printUsage(): void {
    console.log(`Usage: npm run generate -- [options]

Options:
  -h, --help           Show this help and exit
  -i, --input <dir>    Directory with token JSON files (default: ./input)
  -o, --output <file>  Output CSS file (default: ./output/custom-properties.css)
      --split          Emit two files: primitives + tokens (default)
      --single         Emit one file (disables split)
      --output-primitives <file>  Primitives CSS output (default: ./output/primitives.css)
      --output-tokens <file>      Tokens CSS output (default: ./output/tokens.css)
      --registry       Also export docs token registry JSON (default: off)
      --registry-output <file>    Token registry output (default: system dependent)
      --system <id>        Set active design system (default: from config)
  -m, --mode <name>    Preferred mode branch (default: none; uses modeDefault or first mode)
      --mode-strict    Fail if preferred mode is missing in any node (default: off)
      --mode-loose     Allow fallback to available mode if preferred is missing (default: on)
      --from-phase <phase>   Re-run from phase: ingest|index|analyze|emit
      --force-phase <phase>  Force a phase (and downstream). Repeatable or comma-separated
      --no-checkpoints       Disable phase checkpoints
      --cache-dir <dir>      Checkpoint directory (default: ./.cache/tokens-<system>)
`);
}

function getSystemPaths(systemId?: string) {
    const configRaw = fs.readFileSync(path.join(ROOT_DIR, 'tooling/config/design-systems.json'), 'utf8');
    const config = JSON.parse(configRaw);
    const sid = systemId || config.defaultSystem;
    const sys = config.systems.find((s: any) => s.id === sid);
    if (!sys) throw new Error(`Unknown system: ${sid}`);
    return {
        inputDir: path.resolve(ROOT_DIR, sys.inputDir),
        outputPrimitives: path.resolve(ROOT_DIR, sys.outputDir, 'primitives.css'),
        outputTokens: path.resolve(ROOT_DIR, sys.outputDir, 'tokens.css'),
        outputFile: path.resolve(ROOT_DIR, sys.outputDir, 'custom-properties.css'),
        registryOutput: path.resolve(ROOT_DIR, sys.docsDir, '_generated/token-registry.json'),
    };
}

function parsePhaseName(value: string): PipelinePhase | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'ingest' || normalized === 'index' || normalized === 'analyze' || normalized === 'emit') {
        return normalized;
    }
    return null;
}

function parseArgs(argv: string[]): CliOptions | null {
    let split = true;
    let registry = false;
    let help = false;
    let mode: string | undefined;
    let modeStrict = false;
    let systemId: string | undefined;
    let fromPhase: PipelinePhase | undefined;
    const forcePhases: PipelinePhase[] = [];
    let checkpoints = true;
    let cacheDir: string | undefined;

    // First pass loop just to find systemId.
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--system') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --system');
                return null;
            }
            systemId = argv[i + 1];
            break;
        }
    }

    const sysPaths = getSystemPaths(systemId);
    let inputDir = sysPaths.inputDir;
    let outputFile = sysPaths.outputFile;
    let outputPrimitives = sysPaths.outputPrimitives;
    let outputTokens = sysPaths.outputTokens;
    let registryOutput = sysPaths.registryOutput;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-h' || arg === '--help') {
            help = true;
            continue;
        }

        if (arg === '-i' || arg === '--input') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --input');
                return null;
            }
            inputDir = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '-o' || arg === '--output') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --output');
                return null;
            }
            outputFile = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '--split') {
            split = true;
            continue;
        }

        if (arg === '--single') {
            split = false;
            continue;
        }

        if (arg === '--output-primitives') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --output-primitives');
                return null;
            }
            outputPrimitives = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '--output-tokens') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --output-tokens');
                return null;
            }
            outputTokens = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '--registry') {
            registry = true;
            continue;
        }

        if (arg === '--registry-output') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --registry-output');
                return null;
            }
            registryOutput = path.resolve(process.cwd(), argv[i + 1]);
            registry = true;
            i++;
            continue;
        }

        if (arg === '-m' || arg === '--mode') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --mode');
                return null;
            }
            mode = argv[i + 1];
            i++;
            continue;
        }

        if (arg === '--mode-strict') {
            modeStrict = true;
            continue;
        }

        if (arg === '--mode-loose') {
            modeStrict = false;
            continue;
        }

        if (arg === '--from-phase') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --from-phase');
                return null;
            }
            const parsedPhase = parsePhaseName(argv[i + 1]);
            if (!parsedPhase) {
                console.error(`❌ Invalid --from-phase: ${argv[i + 1]} (use: ingest|index|analyze|emit)`);
                return null;
            }
            fromPhase = parsedPhase;
            i++;
            continue;
        }

        if (arg === '--force-phase') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --force-phase');
                return null;
            }
            const rawPhases = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean);
            for (const raw of rawPhases) {
                const parsedPhase = parsePhaseName(raw);
                if (!parsedPhase) {
                    console.error(`❌ Invalid --force-phase value: ${raw} (use: ingest|index|analyze|emit)`);
                    return null;
                }
                forcePhases.push(parsedPhase);
            }
            i++;
            continue;
        }

        if (arg === '--no-checkpoints') {
            checkpoints = false;
            continue;
        }

        if (arg === '--cache-dir') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --cache-dir');
                return null;
            }
            cacheDir = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '--system') {
            i++;
            continue;
        }

        console.error(`❌ Unknown argument: ${arg}`);
        return null;
    }

    return {
        inputDir,
        outputFile,
        outputPrimitives,
        outputTokens,
        registryOutput,
        split,
        registry,
        help,
        mode,
        modeStrict,
        system: systemId,
        fromPhase,
        forcePhases,
        checkpoints,
        cacheDir
    };
}

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

const parsedArgs = parseArgs(process.argv.slice(2));
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
        const cycleStatus = buildCycleStatus(scopeIndexingCtx);
        const emittableKeys = buildEmittableKeySet(scopeIndexingCtx);
        return {
            scope,
            index,
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
    return analyzedScopes.map(({ scope, index, cycleStatus, emittableKeys }) => {
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

async function main() {
    // Reset runtime state for clean execution (important for watch mode/tests).
    resetRuntimeState();

    let summary = createSummary();

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

    const bypassIngest = shouldBypassCheckpoint('ingest', options.fromPhase, options.forcePhases);
    let combinedTokens: Record<string, any>;
    if (checkpointsEnabled && !bypassIngest) {
        const ingestCheckpoint = loadCheckpoint<IngestCheckpointPayload>(
            INGEST_CHECKPOINT_PATH,
            'ingest',
            ingestDependencyHash,
            PIPELINE_SCHEMA_VERSION,
            TOOL_VERSION
        );

        if (ingestCheckpoint) {
            combinedTokens = ingestCheckpoint.payload.combinedTokens;
            console.log('⚡ Phase INGEST: checkpoint hit');
        } else {
            console.log('🧩 Phase INGEST: checkpoint miss');
            try {
                combinedTokens = readAndCombineJsons(JSON_DIR);
            } catch {
                console.error('❌ Ingestion failed. Aborting.');
                process.exit(1);
            }

            const ingestPayload: IngestCheckpointPayload = {
                inputHash: inputSnapshot.inputHash,
                files: inputSnapshot.files,
                combinedTokens
            };
            saveCheckpoint(
                INGEST_CHECKPOINT_PATH,
                'ingest',
                ingestDependencyHash,
                ingestPayload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    } else {
        if (!checkpointsEnabled) {
            console.log('⏭️  Phase INGEST: checkpoints disabled');
        } else {
            console.log('⏭️  Phase INGEST: forced re-run');
        }

        try {
            combinedTokens = readAndCombineJsons(JSON_DIR);
        } catch {
            console.error('❌ Ingestion failed. Aborting.');
            process.exit(1);
        }

        if (checkpointsEnabled) {
            const ingestPayload: IngestCheckpointPayload = {
                inputHash: inputSnapshot.inputHash,
                files: inputSnapshot.files,
                combinedTokens
            };
            saveCheckpoint(
                INGEST_CHECKPOINT_PATH,
                'ingest',
                ingestDependencyHash,
                ingestPayload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    }

    const fileCount = Object.keys(combinedTokens).length;
    console.log(`📂 ${fileCount} JSON ${fileCount === 1 ? 'file' : 'files'} loaded from ${JSON_DIR}`);

    const fileEntries = Object.entries(combinedTokens).map(([name, content]) => ({
        originalName: name,
        content
    }));

    if (fileEntries.length === 0) {
        console.error(`❌ No JSON files found in ${JSON_DIR}. Nothing to generate.`);
        process.exit(1);
    }

    console.log('🔄 Transforming to CSS variables...');

    const indexDependencyHash = sha256FromObject({
        phase: 'index',
        ingestHash: inputSnapshot.inputHash,
        preferredMode: PREFERRED_MODE,
        modeStrictPreferred: MODE_STRICT_PREFERRED
    });

    const bypassIndex = shouldBypassCheckpoint('index', options.fromPhase, options.forcePhases);

    let detectedModeSet = new Set<string>();
    let emittedModeSet = new Set<string>();
    let scopedIndices: SerializedScopeIndex[] = [];
    let cssVarNameOwners = new Map<string, CssVarOwner>();
    let cssVarNameCollisionMap = new Map<string, CssVarCollision>();

    if (checkpointsEnabled && !bypassIndex) {
        const indexCheckpoint = loadCheckpoint<IndexCheckpointPayload>(
            INDEX_CHECKPOINT_PATH,
            'index',
            indexDependencyHash,
            PIPELINE_SCHEMA_VERSION,
            TOOL_VERSION
        );

        if (indexCheckpoint) {
            const payload = indexCheckpoint.payload;
            scopedIndices = payload.scopedIndices;
            detectedModeSet = new Set<string>(payload.detectedModes);
            emittedModeSet = new Set<string>(payload.emittedModes);
            cssVarNameOwners = new Map<string, CssVarOwner>(payload.cssVarNameOwners);
            cssVarNameCollisionMap = deserializeCssCollisionMap(payload.cssVarNameCollisionMap);
            summary.cssVarNameCollisions = payload.cssVarNameCollisions;
            summary.cssVarNameCollisionDetails = [...payload.cssVarNameCollisionDetails];
            console.log('⚡ Phase INDEX: checkpoint hit');
        } else {
            console.log('🧩 Phase INDEX: checkpoint miss');
            const indexed = buildIndexArtifacts(fileEntries, summary, PREFERRED_MODE, MODE_STRICT_PREFERRED);
            indexed.payload.ingestHash = inputSnapshot.inputHash;
            scopedIndices = indexed.payload.scopedIndices;
            detectedModeSet = indexed.detectedModeSet;
            emittedModeSet = indexed.emittedModeSet;
            cssVarNameOwners = indexed.cssVarNameOwners;
            cssVarNameCollisionMap = indexed.cssVarNameCollisionMap;

            saveCheckpoint(
                INDEX_CHECKPOINT_PATH,
                'index',
                indexDependencyHash,
                indexed.payload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    } else {
        if (!checkpointsEnabled) {
            console.log('⏭️  Phase INDEX: checkpoints disabled');
        } else {
            console.log('⏭️  Phase INDEX: forced re-run');
        }

        const indexed = buildIndexArtifacts(fileEntries, summary, PREFERRED_MODE, MODE_STRICT_PREFERRED);
        indexed.payload.ingestHash = inputSnapshot.inputHash;
        scopedIndices = indexed.payload.scopedIndices;
        detectedModeSet = indexed.detectedModeSet;
        emittedModeSet = indexed.emittedModeSet;
        cssVarNameOwners = indexed.cssVarNameOwners;
        cssVarNameCollisionMap = indexed.cssVarNameCollisionMap;

        if (checkpointsEnabled) {
            saveCheckpoint(
                INDEX_CHECKPOINT_PATH,
                'index',
                indexDependencyHash,
                indexed.payload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    }

    const analyzeDependencyHash = sha256FromObject({
        phase: 'analyze',
        indexHash: indexDependencyHash
    });

    const bypassAnalyze = shouldBypassCheckpoint('analyze', options.fromPhase, options.forcePhases);
    let analyzedScopes: SerializedAnalyzedScope[] = [];

    if (checkpointsEnabled && !bypassAnalyze) {
        const analyzeCheckpoint = loadCheckpoint<AnalyzeCheckpointPayload>(
            ANALYZE_CHECKPOINT_PATH,
            'analyze',
            analyzeDependencyHash,
            PIPELINE_SCHEMA_VERSION,
            TOOL_VERSION
        );

        if (analyzeCheckpoint) {
            analyzedScopes = analyzeCheckpoint.payload.analyzedScopes;
            detectedModeSet = new Set<string>(analyzeCheckpoint.payload.detectedModes);
            emittedModeSet = new Set<string>(analyzeCheckpoint.payload.emittedModes);
            console.log('⚡ Phase ANALYZE: checkpoint hit');
        } else {
            console.log('🧩 Phase ANALYZE: checkpoint miss');
            analyzedScopes = analyzeScopedIndices(scopedIndices);
            const analyzePayload: AnalyzeCheckpointPayload = {
                indexHash: indexDependencyHash,
                detectedModes: Array.from(detectedModeSet),
                emittedModes: Array.from(emittedModeSet),
                analyzedScopes
            };
            saveCheckpoint(
                ANALYZE_CHECKPOINT_PATH,
                'analyze',
                analyzeDependencyHash,
                analyzePayload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    } else {
        if (!checkpointsEnabled) {
            console.log('⏭️  Phase ANALYZE: checkpoints disabled');
        } else {
            console.log('⏭️  Phase ANALYZE: forced re-run');
        }

        analyzedScopes = analyzeScopedIndices(scopedIndices);

        if (checkpointsEnabled) {
            const analyzePayload: AnalyzeCheckpointPayload = {
                indexHash: indexDependencyHash,
                detectedModes: Array.from(detectedModeSet),
                emittedModes: Array.from(emittedModeSet),
                analyzedScopes
            };
            saveCheckpoint(
                ANALYZE_CHECKPOINT_PATH,
                'analyze',
                analyzeDependencyHash,
                analyzePayload,
                PIPELINE_SCHEMA_VERSION,
                TOOL_VERSION
            );
        }
    }

    const outputs = getOutputTargets(fileEntries);
    const emitManifestPath = getEmitManifestPath(outputs);
    const emitDependencyHash = sha256FromObject({
        phase: 'emit',
        analyzeHash: analyzeDependencyHash,
        split: SPLIT_OUTPUT,
        registry: REGISTRY_ENABLED,
        registryOutput: REGISTRY_OUTPUT,
        outputs: outputs.map(output => ({ label: output.label, filePath: output.filePath }))
    });

    const bypassEmit = shouldBypassCheckpoint('emit', options.fromPhase, options.forcePhases);

    if (checkpointsEnabled && !bypassEmit) {
        const emitCheckpoint = loadCheckpoint<EmitCheckpointPayload>(
            emitManifestPath,
            'emit',
            emitDependencyHash,
            PIPELINE_SCHEMA_VERSION,
            TOOL_VERSION
        );

        if (emitCheckpoint && isEmitCheckpointUsable(emitCheckpoint.payload, outputs, REGISTRY_ENABLED, REGISTRY_OUTPUT)) {
            summary = fromSummarySnapshot(emitCheckpoint.payload.summary);
            detectedModeSet = new Set<string>(emitCheckpoint.payload.detectedModes);
            emittedModeSet = new Set<string>(emitCheckpoint.payload.emittedModes);
            console.log('⚡ Phase EMIT: checkpoint hit (outputs unchanged)');
            printExecutionSummary(summary);
            printModeSummary(emittedModeSet, 'emitted');
            if (!setsEqual(emittedModeSet, detectedModeSet)) {
                printModeSummary(detectedModeSet, 'detected');
            }
            printModeFallbackSummary(modeFallbackCounts, modeFallbackExamples);
            return;
        }

        if (!emitCheckpoint) {
            console.log('🧩 Phase EMIT: checkpoint miss');
        } else {
            console.log('🧩 Phase EMIT: checkpoint invalidated (output drift detected)');
        }
    } else {
        if (!checkpointsEnabled) {
            console.log('⏭️  Phase EMIT: checkpoints disabled');
        } else {
            console.log('⏭️  Phase EMIT: forced re-run');
        }
    }

    const scopeProcessingContexts = buildScopeProcessingContexts(
        analyzedScopes,
        summary,
        combinedTokens,
        cssVarNameOwners,
        cssVarNameCollisionMap
    );

    if (SPLIT_OUTPUT) {
        const primitiveEntries = fileEntries.filter(entry => entry.originalName.startsWith('_')).length;
        const tokenEntries = fileEntries.filter(entry => !entry.originalName.startsWith('_')).length;
        console.log(`🧩 Split mode enabled: ${primitiveEntries} primitive file(s), ${tokenEntries} token file(s)`);
    }

    const emitOutputSnapshots: EmitOutputSnapshot[] = [];

    for (const output of outputs) {
        if (output.emitEntries.length === 0) {
            console.warn(`⚠️  No files matched for ${output.label}; writing empty output.`);
        }

        let previousVariables = new Map<string, string>();
        let previousContent: string | null = null;

        if (fs.existsSync(output.filePath)) {
            try {
                previousVariables = readCssVariablesFromFile(output.filePath);
                previousContent = fs.readFileSync(output.filePath, 'utf8');
                console.log(`📄 Previous ${output.label} CSS found with ${previousVariables.size} variables`);
            } catch {
                console.warn(`⚠️  Could not read previous ${output.label} CSS file (creating a new one)`);
            }
        }

        const cssBlocks: string[] = [];
        for (const { scope, processingCtx } of scopeProcessingContexts) {
            const scopedPrimitives: string[] = [];
            const scopedAliases: string[] = [];

            for (const { originalName, content } of output.emitEntries) {
                const { primitives, aliases } = flattenTokens(
                    processingCtx,
                    content,
                    [],
                    [originalName],
                    scope.mode,
                    false,
                    scope.skipBaseWhenMode,
                    scope.modeOverridesOnly,
                    scope.allowModeBranches
                );

                if (primitives.length > 0) {
                    if (scopedPrimitives.length > 0) scopedPrimitives.push('');
                    scopedPrimitives.push(formatCssSectionHeader(originalName));
                    scopedPrimitives.push(...primitives);
                }

                if (aliases.length > 0) {
                    if (scopedAliases.length > 0) scopedAliases.push('');
                    scopedAliases.push(formatCssSectionHeader(originalName));
                    scopedAliases.push(...aliases);
                }
            }

            const scopedLines: string[] = [];
            scopedLines.push(...scopedPrimitives);
            if (scopedPrimitives.length > 0 && scopedAliases.length > 0) scopedLines.push('');
            scopedLines.push(...scopedAliases);

            if (scopedLines.length === 0) continue;

            const modeLabel = scope.mode ? `/* ========== MODE ${formatModeLabel(scope.mode)} ========== */\n` : '';
            cssBlocks.push(`${modeLabel}${scope.selector} {\n${scopedLines.join('\n')}\n}`);
        }

        const finalCss = `${cssBlocks.join('\n\n')}\n`;

        const destDir = path.dirname(output.filePath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        if (previousContent !== finalCss) {
            console.log(`📝 Writing ${output.label} CSS file...`);
            try {
                fs.writeFileSync(output.filePath, finalCss, 'utf-8');
                const outputLabel = path.relative(process.cwd(), output.filePath) || output.filePath;
                console.log(`\n✅ ${outputLabel} updated`);
            } catch (err) {
                console.error(`❌ Could not write ${output.filePath}:`, err);
                process.exit(1);
            }
        } else {
            const outputLabel = path.relative(process.cwd(), output.filePath) || output.filePath;
            console.log(`⏭️  ${outputLabel} unchanged (skip write)`);
        }

        if (previousVariables.size > 0) {
            const newVariables = extractCssVariables(finalCss);
            logChangeDetection(previousVariables, newVariables, {
                preferredMode: PREFERRED_MODE,
                detectedModes: detectedModeSet,
                emittedModes: emittedModeSet,
                modeStrict: MODE_STRICT_PREFERRED
            });
        }

        console.log(`\n📝 File ready at: ${output.filePath}`);

        emitOutputSnapshots.push({
            label: output.label,
            filePath: output.filePath,
            contentHash: sha256FromString(finalCss)
        });
    }

    let registrySnapshot: EmitCheckpointPayload['registry'];
    if (REGISTRY_ENABLED) {
        const baseScopeProcessingCtx = scopeProcessingContexts.find(({ scope }) => !scope.mode)?.processingCtx;
        if (!baseScopeProcessingCtx) {
            const availableScopes = scopeProcessingContexts
                .map(({ scope }) => (scope.mode ? `mode:${scope.mode}` : 'base'))
                .join(', ');
            throw new Error(
                `Registry export requires a base scope (no mode), but none was found. ` +
                `Available scopes: ${availableScopes || '<none>'}.`,
            );
        }

        console.log('🧾 Exporting token registry...');
        const registryIndex = exportTokenRegistry(baseScopeProcessingCtx);
        writeTokenRegistry(REGISTRY_OUTPUT, registryIndex);
        const outputLabel = path.relative(process.cwd(), REGISTRY_OUTPUT) || REGISTRY_OUTPUT;
        console.log(`✅ Token registry exported to ${outputLabel} (${registryIndex.entries.length} entries)`);

        registrySnapshot = {
            filePath: REGISTRY_OUTPUT,
            contentHash: fs.existsSync(REGISTRY_OUTPUT) ? sha256FromFile(REGISTRY_OUTPUT) : ''
        };
    }

    if (checkpointsEnabled) {
        const emitPayload: EmitCheckpointPayload = {
            analyzeHash: analyzeDependencyHash,
            emitHash: emitDependencyHash,
            outputs: emitOutputSnapshots,
            registry: registrySnapshot,
            summary: toSummarySnapshot(summary),
            detectedModes: Array.from(detectedModeSet),
            emittedModes: Array.from(emittedModeSet)
        };

        saveCheckpoint(
            emitManifestPath,
            'emit',
            emitDependencyHash,
            emitPayload,
            PIPELINE_SCHEMA_VERSION,
            TOOL_VERSION
        );
    }

    printExecutionSummary(summary);
    printModeSummary(emittedModeSet, 'emitted');
    if (!setsEqual(emittedModeSet, detectedModeSet)) {
        printModeSummary(detectedModeSet, 'detected');
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
