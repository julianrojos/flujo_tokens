import { ScriptSystemContext } from '../utils/index.js';

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
    registryIndexPath: string;
    tokenRegistryPath: string;
    resolvedSpecRoot: string;
    templatePath: string;
    overviewPath: string;
}

export interface PipelineFlags {
    componentSlugOverride: string;
    componentKind?: string;
    includeVariants: boolean;
    requireExistingDoc: boolean;
    continueOnError: boolean;
    refreshIndices: boolean;
    dryRun: boolean;
    injectDocSpecs: boolean;
    includeSpecExhibits: boolean;
    variantLimit: number;
    scale: number;
    format: string;
    agent: string;
    mainCaptureMode?: string;
    force: boolean;
    skipValidation: boolean;
    allowNonEvidenceUpdates: boolean;
}

export interface PipelineContext extends PipelineIdentity {
    system: ScriptSystemContext;
    paths: PipelinePaths;
    flags: PipelineFlags;
    argsRaw: Record<string, unknown>;  // Flexible to accommodate all CLI argument types
}

export interface SpecRunContext {
    figmaUrl: string;
    componentName: string;
    componentSlug: string;
    specRoot: string;
    resolvedSpecRoot: string;
    docsRootDir: string;
    templatePath: string;
    registryPath: string;
    skipValidation: boolean;
    allowNonEvidenceUpdates: boolean;
    agent: string;
    fileKeyFromUrl: string;
    nodeId: string;
    outputPath: string;
    overviewPath: string;
    registryIndexPath: string;
    allowedWritePaths: string[];
}
