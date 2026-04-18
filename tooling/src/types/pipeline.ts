import type { ScriptSystemContext } from '../utils/index.js';
import type { FigmaVariableSource } from '../services/figma-token-sync.js';

export interface PipelineIdentity {
    repoRoot: string;
    figmaUrl: string;
    figmaToken: string;
}

export interface PipelinePaths {
    docsRootOverride: string | null;
    docsRootDir: string;
    componentDocsDir: string;
    proofDir: string;
    proofImageDir: string;
    databaseUrl: string;
    tokenRegistryPath: string;
    resolvedSpecRoot: string;
    overviewPath: string;
}

export interface PipelineFlags {
    componentSlugOverride: string;
    componentKind: string;
    includeVariants: boolean;
    continueOnError: boolean;
    refreshIndices: boolean;
    dryRun: boolean;
    includeSpecExhibits: boolean;
    variantLimit: number;
    scale: number;
    format: string;
    agent: string;
    mainCaptureMode: string;
    tokensSource: FigmaVariableSource;
    force: boolean;
    skipValidation: boolean;
    allowNonEvidenceUpdates: boolean;
    skipDbPersistence: boolean;
}

export interface PipelineContext extends PipelineIdentity {
    system: ScriptSystemContext;
    paths: PipelinePaths;
    flags: PipelineFlags;
    argsRaw: Record<string, unknown>;  // Flexible to accommodate all CLI argument types
}
