import type { PipelinePhase } from '../../runtime/pipeline-cache.js';
import { loadCheckpoint, saveCheckpoint } from '../../runtime/pipeline-cache.js';
import type { CssVarOwner, CssVarCollision } from '../../types/tokens.js';

type AnalyzeCheckpointPayload = {
    indexHash: string;
    detectedModes: string[];
    emittedModes: string[];
    analyzedScopes: any[];
};

type AnalyzePhaseOptions = {
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
};

type AnalyzePhaseState = {
    checkpointsEnabled: boolean;
    indexDependencyHash: string;
    analyzeDependencyHash: string;
    analyzedScopes: any[];
    scopedIndices: any[];
    cssVarNameOwners: Map<string, CssVarOwner>;
    cssVarNameCollisionMap: Map<string, CssVarCollision>;
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
};

type AnalyzePhaseContext = {
    options: AnalyzePhaseOptions;
    analyzeCheckpointPath: string;
    pipelineSchemaVersion: number;
    toolVersion: string;
    shouldBypassCheckpoint: (
        phase: PipelinePhase,
        fromPhase: PipelinePhase | undefined,
        forcePhases: PipelinePhase[]
    ) => boolean;
    sha256FromObject: (value: unknown) => string;
    analyzeScopedIndices: (
        scopedIndices: any[],
        cssVarNameOwners: Map<string, CssVarOwner>,
        cssVarNameCollisionMap: Map<string, CssVarCollision>
    ) => any[];
};

export function runAnalyzePhase(
    state: AnalyzePhaseState,
    context: AnalyzePhaseContext
): void {
    state.analyzeDependencyHash = context.sha256FromObject({
        phase: 'analyze',
        indexHash: state.indexDependencyHash
    });

    const bypassAnalyze = context.shouldBypassCheckpoint(
        'analyze',
        context.options.fromPhase,
        context.options.forcePhases
    );

    if (state.checkpointsEnabled && !bypassAnalyze) {
        const analyzeCheckpoint = loadCheckpoint<AnalyzeCheckpointPayload>(
            context.analyzeCheckpointPath,
            'analyze',
            state.analyzeDependencyHash,
            context.pipelineSchemaVersion,
            context.toolVersion
        );

        if (analyzeCheckpoint) {
            state.analyzedScopes = analyzeCheckpoint.payload.analyzedScopes;
            state.detectedModeSet = new Set<string>(analyzeCheckpoint.payload.detectedModes);
            state.emittedModeSet = new Set<string>(analyzeCheckpoint.payload.emittedModes);
            console.log('⚡ Phase ANALYZE: checkpoint hit');
            return;
        }

        console.log('🧩 Phase ANALYZE: checkpoint miss');
        state.analyzedScopes = context.analyzeScopedIndices(
            state.scopedIndices,
            state.cssVarNameOwners,
            state.cssVarNameCollisionMap
        );
        const analyzePayload: AnalyzeCheckpointPayload = {
            indexHash: state.indexDependencyHash,
            detectedModes: Array.from(state.detectedModeSet),
            emittedModes: Array.from(state.emittedModeSet),
            analyzedScopes: state.analyzedScopes
        };
        saveCheckpoint(
            context.analyzeCheckpointPath,
            'analyze',
            state.analyzeDependencyHash,
            analyzePayload,
            context.pipelineSchemaVersion,
            context.toolVersion
        );
        return;
    }

    if (!state.checkpointsEnabled) {
        console.log('⏭️  Phase ANALYZE: checkpoints disabled');
    } else {
        console.log('⏭️  Phase ANALYZE: forced re-run');
    }

    state.analyzedScopes = context.analyzeScopedIndices(
        state.scopedIndices,
        state.cssVarNameOwners,
        state.cssVarNameCollisionMap
    );

    if (state.checkpointsEnabled) {
        const analyzePayload: AnalyzeCheckpointPayload = {
            indexHash: state.indexDependencyHash,
            detectedModes: Array.from(state.detectedModeSet),
            emittedModes: Array.from(state.emittedModeSet),
            analyzedScopes: state.analyzedScopes
        };
        saveCheckpoint(
            context.analyzeCheckpointPath,
            'analyze',
            state.analyzeDependencyHash,
            analyzePayload,
            context.pipelineSchemaVersion,
            context.toolVersion
        );
    }
}
