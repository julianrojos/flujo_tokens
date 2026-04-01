/**
 * Spec Orchestrator Service
 *
 * The main entry point for generating component specifications from Figma nodes.
 * Orchestrates the entire flow from context creation to AI generation and finalization.
 */

import {
    loadTokenRegistry,
    runSpecGenerationPrompt,
    runSpecRepairPrompt,
    createSpecRunContext,
    runSpecGenerationFlow,
    finalizeSpecResult,
    runSpecWithGuards,
    validateGeneratedSpec,
    ensureSpecOutputDirectory,
    ensureSpecTemplateExists,
    materializeSpec,
    assertEvidenceGatedScalarChanges,
    writeSpecWithSnapshotGuard,
    type AgentType,
    createPipelineContext,
    loadRegistryOrThrow,
} from '../utils/index.js';
import {
    buildSpecPromptWithRegistry,
} from './spec-registry-prompt.js';

import { syncDocumentationState } from '../services/component-registry-index.js';

const SPEC_EVIDENCE_BACKED_PREFIXES = Object.freeze([
    'name',
    'figma.file',
    'figma.page',
    'figma.component_set',
    'figma.component_set_node_id',
    'properties',
    'anatomy',
    'variants',
    'layout',
]);

export interface SpecOrchestratorDeps {
    loadTokenRegistryFn?: typeof loadTokenRegistry;
    loadRegistryOrThrowFn?: typeof loadRegistryOrThrow;
    ensureSpecTemplateExistsFn?: typeof ensureSpecTemplateExists;
    ensureSpecOutputDirectoryFn?: typeof ensureSpecOutputDirectory;
    materializeSpecFn?: typeof materializeSpec;
    assertEvidenceGatedScalarChangesFn?: typeof assertEvidenceGatedScalarChanges;
    runSpecGenerationPromptFn?: typeof runSpecGenerationPrompt;
    runSpecRepairPromptFn?: typeof runSpecRepairPrompt;
    validateGeneratedSpecFn?: typeof validateGeneratedSpec;
    syncDocumentationIndicesFn?: typeof syncDocumentationState;
    runSpecWithGuardsFn?: typeof runSpecWithGuards;
    createPipelineContextFn?: typeof createPipelineContext;
    writeSpecWithSnapshotGuardFn?: typeof writeSpecWithSnapshotGuard;
}

function withSpecStage<T>(stage: string, run: () => T): T {
    try {
        return run();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[spec-orchestrator:${stage}] ${message}`);
    }
}

/**
 * Orchestrates the spec generation process for a component from Figma.
 */
export async function runSpecFromFigma(args: Record<string, any>, deps: SpecOrchestratorDeps = {}): Promise<any> {
    const {
        loadTokenRegistryFn = loadTokenRegistry,
        loadRegistryOrThrowFn = loadRegistryOrThrow,
        ensureSpecTemplateExistsFn = ensureSpecTemplateExists,
        ensureSpecOutputDirectoryFn = ensureSpecOutputDirectory,
        materializeSpecFn = materializeSpec,
        assertEvidenceGatedScalarChangesFn = assertEvidenceGatedScalarChanges,
        runSpecGenerationPromptFn = runSpecGenerationPrompt,
        runSpecRepairPromptFn = runSpecRepairPrompt,
        validateGeneratedSpecFn = validateGeneratedSpec,
        syncDocumentationIndicesFn = syncDocumentationState,
        runSpecWithGuardsFn = runSpecWithGuards,
        createPipelineContextFn = createPipelineContext,
        writeSpecWithSnapshotGuardFn = writeSpecWithSnapshotGuard,
    } = deps;

    const context = withSpecStage('create-pipeline-context', () => createPipelineContextFn(args));

    const runCtx = withSpecStage('create-run-context', () => createSpecRunContext({ context, args }));
    const {
        figmaUrl,
        componentName,
        componentSlug,
        resolvedSpecRoot,
        docsRootDir,
        templatePath,
        registryPath,
        skipValidation,
        agent,
        fileKeyFromUrl,
        nodeId,
        outputPath,
        overviewPath,
        registryDbPath,
        allowedWritePaths,
    } = runCtx;

    return withSpecStage('run-with-guards', () => runSpecWithGuardsFn({
        outputPath,
        resolvedSpecRoot,
        docsPath: context.system.paths.docs,
        registryDbPath,
        allowedWritePaths,
        run: ({ existingSpec }) => {
            withSpecStage('ensure-template', () => ensureSpecTemplateExistsFn(templatePath));

            const registryIndex = withSpecStage(
                'load-token-registry',
                () => loadRegistryOrThrowFn(registryPath),
            );

            const prompt = withSpecStage('build-prompt', () =>
                buildSpecPromptWithRegistry({
                    figmaUrl,
                    nodeId,
                    componentName,
                    componentSlug,
                    outputPath,
                    templatePath,
                    registryPath,
                    fileKeyFromUrl,
                    registryIndex,
                }),
            );

            withSpecStage('ensure-output-dir', () => ensureSpecOutputDirectoryFn(outputPath));

            const { normalizedSpec, prefilledCount, validationReport } = withSpecStage(
                'generate-and-validate-spec',
                () =>
                    runSpecGenerationFlow({
                        prompt,
                        agent: agent as AgentType | undefined,
                        componentName,
                        nodeId,
                        skipValidation,
                        outputPath,
                        registryPath,
                        runSpecGenerationPromptFn,
                        runSpecRepairPromptFn,
                        validateGeneratedSpecFn,
                        materializeGeneratedSpec: () =>
                            withSpecStage('materialize-spec', () => {
                                const result = materializeSpecFn({
                                    outputPath,
                                    templatePath,
                                    registryIndex,
                                    componentName,
                                    nodeId,
                                    fileKeyFromUrl,
                                    existingSpec,
                                    allowNonEvidenceUpdates: runCtx.allowNonEvidenceUpdates,
                                    evidenceGate: assertEvidenceGatedScalarChangesFn,
                                    evidenceBackedPrefixes: [...SPEC_EVIDENCE_BACKED_PREFIXES],
                                });
                                withSpecStage('write-spec-snapshot-guard', () =>
                                    writeSpecWithSnapshotGuardFn({
                                        outputPath,
                                        normalizedSpec: result.normalizedSpec,
                                    }),
                                );
                                return result;
                            }),
                    }),
            );

            return withSpecStage('finalize-result', () =>
                finalizeSpecResult({
                    outputPath,
                    normalizedSpec,
                    componentName,
                    nodeId,
                    prefilledCount,
                    validationReport,
                    resolvedSpecRoot,
                    docsRootDir,
                    overviewPath,
                    registryDbPath,
                    systemId: context.system.id,
                    syncDocumentationIndicesFn,
                }),
            );
        },
    }));
}
