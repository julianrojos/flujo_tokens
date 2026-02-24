import { readAndCombineJsons } from '../../core/ingest.js';
import type { InputHashSnapshot, PipelinePhase } from '../../runtime/pipeline-cache.js';
import { loadCheckpoint, saveCheckpoint } from '../../runtime/pipeline-cache.js';

type FileEntry = {
    originalName: string;
    content: any;
};

type IngestCheckpointPayload = {
    inputHash: string;
    files: Array<{ file: string; sha256: string; size: number; mtimeMs: number }>;
    combinedTokens: Record<string, any>;
};

type IngestPhaseOptions = {
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
};

type IngestPhaseState = {
    checkpointsEnabled: boolean;
    inputSnapshot: InputHashSnapshot;
    ingestDependencyHash: string;
    combinedTokens: Record<string, any>;
    fileEntries: FileEntry[];
};

type IngestPhaseContext = {
    options: IngestPhaseOptions;
    ingestCheckpointPath: string;
    pipelineSchemaVersion: number;
    toolVersion: string;
    jsonDir: string;
    shouldBypassCheckpoint: (
        phase: PipelinePhase,
        fromPhase: PipelinePhase | undefined,
        forcePhases: PipelinePhase[]
    ) => boolean;
};

export function runIngestPhase(
    state: IngestPhaseState,
    context: IngestPhaseContext
): void {
    const bypassIngest = context.shouldBypassCheckpoint(
        'ingest',
        context.options.fromPhase,
        context.options.forcePhases
    );
    if (state.checkpointsEnabled && !bypassIngest) {
        const ingestCheckpoint = loadCheckpoint<IngestCheckpointPayload>(
            context.ingestCheckpointPath,
            'ingest',
            state.ingestDependencyHash,
            context.pipelineSchemaVersion,
            context.toolVersion
        );

        if (ingestCheckpoint) {
            state.combinedTokens = ingestCheckpoint.payload.combinedTokens;
            console.log('⚡ Phase INGEST: checkpoint hit');
        } else {
            console.log('🧩 Phase INGEST: checkpoint miss');
            try {
                state.combinedTokens = readAndCombineJsons(context.jsonDir);
            } catch {
                console.error('❌ Ingestion failed. Aborting.');
                process.exit(1);
            }

            const ingestPayload: IngestCheckpointPayload = {
                inputHash: state.inputSnapshot.inputHash,
                files: state.inputSnapshot.files,
                combinedTokens: state.combinedTokens
            };
            saveCheckpoint(
                context.ingestCheckpointPath,
                'ingest',
                state.ingestDependencyHash,
                ingestPayload,
                context.pipelineSchemaVersion,
                context.toolVersion
            );
        }
    } else {
        if (!state.checkpointsEnabled) {
            console.log('⏭️  Phase INGEST: checkpoints disabled');
        } else {
            console.log('⏭️  Phase INGEST: forced re-run');
        }

        try {
            state.combinedTokens = readAndCombineJsons(context.jsonDir);
        } catch {
            console.error('❌ Ingestion failed. Aborting.');
            process.exit(1);
        }

        if (state.checkpointsEnabled) {
            const ingestPayload: IngestCheckpointPayload = {
                inputHash: state.inputSnapshot.inputHash,
                files: state.inputSnapshot.files,
                combinedTokens: state.combinedTokens
            };
            saveCheckpoint(
                context.ingestCheckpointPath,
                'ingest',
                state.ingestDependencyHash,
                ingestPayload,
                context.pipelineSchemaVersion,
                context.toolVersion
            );
        }
    }

    const fileCount = Object.keys(state.combinedTokens).length;
    console.log(`📂 ${fileCount} JSON ${fileCount === 1 ? 'file' : 'files'} loaded from ${context.jsonDir}`);

    state.fileEntries = Object.entries(state.combinedTokens).map(([name, content]) => ({
        originalName: name,
        content
    }));

    if (state.fileEntries.length === 0) {
        console.error(`❌ No JSON files found in ${context.jsonDir}. Nothing to generate.`);
        process.exit(1);
    }

    console.log('🔄 Transforming to CSS variables...');
}
