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
    syncDocumentationIndicesFn?: (
        opts: Parameters<typeof syncDocumentationState>[0],
    ) => ReturnType<typeof syncDocumentationState>;
    runSpecWithGuardsFn?: typeof runSpecWithGuards;
    createPipelineContextFn?: typeof createPipelineContext;
    writeSpecWithSnapshotGuardFn?: typeof writeSpecWithSnapshotGuard;
}

async function withSpecStage<T>(stage: string, run: () => Promise<T> | T): Promise<T> {
    try {
        return await run();
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

    const context = await withSpecStage('create-pipeline-context', () => createPipelineContextFn(args));

    const runCtx = await withSpecStage('create-run-context', () => createSpecRunContext({ context, args }));
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
        databaseUrl,
        allowedWritePaths,
    } = runCtx;

    return await withSpecStage('run-with-guards', () => runSpecWithGuardsFn({
        outputPath,
        resolvedSpecRoot,
        docsPath: context.system.paths.docs,
        allowedWritePaths,
        run: async ({ existingSpec }) => {
            await withSpecStage('ensure-template', () => ensureSpecTemplateExistsFn(templatePath));

            const registryIndex = await withSpecStage(
                'load-token-registry',
                () => loadRegistryOrThrowFn(registryPath),
            );

            const prompt = await withSpecStage('build-prompt', () =>
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

            await withSpecStage('ensure-output-dir', () => ensureSpecOutputDirectoryFn(outputPath));

            const { normalizedSpec, prefilledCount, validationReport } = await withSpecStage(
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
                        materializeGeneratedSpec: () => {
                            try {
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
                                writeSpecWithSnapshotGuardFn({
                                    outputPath,
                                    normalizedSpec: result.normalizedSpec,
                                });
                                return result;
                            } catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                throw new Error(`[spec-orchestrator:materialize-spec] ${message}`);
                            }
                        },
                    }),
            );

            return await withSpecStage('finalize-result', () =>
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
                    databaseUrl,
                    systemId: context.system.id,
                    syncDocumentationIndicesFn,
                }),
            );
        },
    }));
}
