import type { PipelinePhase } from '../../runtime/pipeline-cache.js';
import { loadCheckpoint, saveCheckpoint } from '../../runtime/pipeline-cache.js';

type IndexCheckpointPayload = {
    ingestHash: string;
    preferredMode?: string;
    modeStrictPreferred: boolean;
    detectedModes: string[];
    emittedModes: string[];
    scopes: Array<{
        selector: string;
        mode?: string;
        skipBaseWhenMode: boolean;
        modeOverridesOnly: boolean;
        allowModeBranches: boolean;
    }>;
    scopedIndices: any[];
    cssVarNameOwners: Array<[string, any]>;
    cssVarNameCollisionMap: Array<[string, any]>;
    cssVarNameCollisions: number;
    cssVarNameCollisionDetails: string[];
};

type IndexPhaseOptions = {
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
    preferredMode?: string;
    modeStrictPreferred: boolean;
};

type IndexPhaseState = {
    checkpointsEnabled: boolean;
    inputSnapshot: { inputHash: string };
    fileEntries: Array<{ originalName: string; content: any }>;
    summary: any;
    indexDependencyHash: string;
    scopedIndices: any[];
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
    cssVarNameOwners: Map<string, any>;
    cssVarNameCollisionMap: Map<string, any>;
};

type IndexPhaseContext = {
    options: IndexPhaseOptions;
    indexCheckpointPath: string;
    pipelineSchemaVersion: number;
    toolVersion: string;
    shouldBypassCheckpoint: (
        phase: PipelinePhase,
        fromPhase: PipelinePhase | undefined,
        forcePhases: PipelinePhase[]
    ) => boolean;
    sha256FromObject: (value: unknown) => string;
    deserializeCssCollisionMap: (entries: Array<[string, any]>) => Map<string, any>;
    buildIndexArtifacts: (
        fileEntries: Array<{ originalName: string; content: any }>,
        summary: any,
        preferredMode: string | undefined,
        modeStrictPreferred: boolean
    ) => {
        payload: IndexCheckpointPayload;
        detectedModeSet: Set<string>;
        emittedModeSet: Set<string>;
        cssVarNameOwners: Map<string, any>;
        cssVarNameCollisionMap: Map<string, any>;
    };
};

export function runIndexPhase(
    state: IndexPhaseState,
    context: IndexPhaseContext
): void {
    state.indexDependencyHash = context.sha256FromObject({
        phase: 'index',
        ingestHash: state.inputSnapshot.inputHash,
        preferredMode: context.options.preferredMode,
        modeStrictPreferred: context.options.modeStrictPreferred
    });

    const bypassIndex = context.shouldBypassCheckpoint(
        'index',
        context.options.fromPhase,
        context.options.forcePhases
    );

    if (state.checkpointsEnabled && !bypassIndex) {
        const indexCheckpoint = loadCheckpoint<IndexCheckpointPayload>(
            context.indexCheckpointPath,
            'index',
            state.indexDependencyHash,
            context.pipelineSchemaVersion,
            context.toolVersion
        );

        if (indexCheckpoint) {
            const payload = indexCheckpoint.payload;
            state.scopedIndices = payload.scopedIndices;
            state.detectedModeSet = new Set<string>(payload.detectedModes);
            state.emittedModeSet = new Set<string>(payload.emittedModes);
            state.cssVarNameOwners = new Map<string, any>(payload.cssVarNameOwners);
            state.cssVarNameCollisionMap = context.deserializeCssCollisionMap(payload.cssVarNameCollisionMap);
            state.summary.cssVarNameCollisions = payload.cssVarNameCollisions;
            state.summary.cssVarNameCollisionDetails = [...payload.cssVarNameCollisionDetails];
            console.log('⚡ Phase INDEX: checkpoint hit');
            return;
        }

        console.log('🧩 Phase INDEX: checkpoint miss');
        const indexed = context.buildIndexArtifacts(
            state.fileEntries,
            state.summary,
            context.options.preferredMode,
            context.options.modeStrictPreferred
        );
        indexed.payload.ingestHash = state.inputSnapshot.inputHash;
        state.scopedIndices = indexed.payload.scopedIndices;
        state.detectedModeSet = indexed.detectedModeSet;
        state.emittedModeSet = indexed.emittedModeSet;
        state.cssVarNameOwners = indexed.cssVarNameOwners;
        state.cssVarNameCollisionMap = indexed.cssVarNameCollisionMap;

        saveCheckpoint(
            context.indexCheckpointPath,
            'index',
            state.indexDependencyHash,
            indexed.payload,
            context.pipelineSchemaVersion,
            context.toolVersion
        );
        return;
    }

    if (!state.checkpointsEnabled) {
        console.log('⏭️  Phase INDEX: checkpoints disabled');
    } else {
        console.log('⏭️  Phase INDEX: forced re-run');
    }

    const indexed = context.buildIndexArtifacts(
        state.fileEntries,
        state.summary,
        context.options.preferredMode,
        context.options.modeStrictPreferred
    );
    indexed.payload.ingestHash = state.inputSnapshot.inputHash;
    state.scopedIndices = indexed.payload.scopedIndices;
    state.detectedModeSet = indexed.detectedModeSet;
    state.emittedModeSet = indexed.emittedModeSet;
    state.cssVarNameOwners = indexed.cssVarNameOwners;
    state.cssVarNameCollisionMap = indexed.cssVarNameCollisionMap;

    if (state.checkpointsEnabled) {
        saveCheckpoint(
            context.indexCheckpointPath,
            'index',
            state.indexDependencyHash,
            indexed.payload,
            context.pipelineSchemaVersion,
            context.toolVersion
        );
    }
}
