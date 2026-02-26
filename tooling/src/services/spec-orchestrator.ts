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
    buildSpecPromptWithRegistry,
    loadRegistryOrThrow,
    runSpecGenerationFlow,
    finalizeSpecResult,
    runSpecWithGuards,
    validateGeneratedSpec,
    ensureSpecOutputDirectory,
    ensureSpecTemplateExists,
    materializeSpec,
    assertEvidenceGatedScalarChanges,
    writeSpecWithSnapshotGuard,
    createPipelineContext,
} from '../utils/index.js';

// Import syncDocumentationIndices with type safety from component-registry-index
import { syncDocumentationIndices as syncDocumentationIndicesJs } from '../services/component-registry-index.js';

// Type-safe wrapper for syncDocumentationIndices
const syncDocumentationIndices: typeof syncDocumentationIndicesJs = syncDocumentationIndicesJs;

const SPEC_EVIDENCE_BACKED_PREFIXES = Object.freeze([
    'name',
    'figma.file',
    'figma.page',
    'figma.component_set',
    'figma.component_set_node_id',
    'properties',
    'anatomy',
]);

export interface SpecOrchestratorDeps {
    loadTokenRegistryFn?: typeof loadTokenRegistry;
    ensureSpecTemplateExistsFn?: typeof ensureSpecTemplateExists;
    ensureSpecOutputDirectoryFn?: typeof ensureSpecOutputDirectory;
    materializeSpecFn?: typeof materializeSpec;
    assertEvidenceGatedScalarChangesFn?: typeof assertEvidenceGatedScalarChanges;
    runSpecGenerationPromptFn?: typeof runSpecGenerationPrompt;
    runSpecRepairPromptFn?: typeof runSpecRepairPrompt;
    validateGeneratedSpecFn?: typeof validateGeneratedSpec;
    syncDocumentationIndicesFn?: (opts: any) => any;
    runSpecWithGuardsFn?: typeof runSpecWithGuards;
    createPipelineContextFn?: typeof createPipelineContext;
    writeSpecWithSnapshotGuardFn?: typeof writeSpecWithSnapshotGuard;
}

/**
 * Orchestrates the spec generation process for a component from Figma.
 */
export async function runSpecFromFigma(args: Record<string, any>, deps: SpecOrchestratorDeps = {}): Promise<any> {
    const {
        loadTokenRegistryFn = loadTokenRegistry,
        ensureSpecTemplateExistsFn = ensureSpecTemplateExists,
        ensureSpecOutputDirectoryFn = ensureSpecOutputDirectory,
        materializeSpecFn = materializeSpec,
        assertEvidenceGatedScalarChangesFn = assertEvidenceGatedScalarChanges,
        runSpecGenerationPromptFn = runSpecGenerationPrompt,
        runSpecRepairPromptFn = runSpecRepairPrompt,
        validateGeneratedSpecFn = validateGeneratedSpec,
        syncDocumentationIndicesFn = syncDocumentationIndicesJs,
        runSpecWithGuardsFn = runSpecWithGuards,
        createPipelineContextFn = createPipelineContext,
        writeSpecWithSnapshotGuardFn = writeSpecWithSnapshotGuard,
    } = deps;

    const context = createPipelineContextFn(args);

    const runCtx = createSpecRunContext({ context, args });
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
        registryIndexPath,
        allowedWritePaths,
    } = runCtx;

    return runSpecWithGuardsFn({
        outputPath,
        resolvedSpecRoot,
        docsPath: context.system.paths.docs,
        registryIndexPath,
        allowedWritePaths,
        run: ({ existingSpec }) => {
            ensureSpecTemplateExistsFn(templatePath);

            const registryIndex = loadRegistryOrThrow({
                loadTokenRegistryFn,
                registryPath,
            });

            const prompt = buildSpecPromptWithRegistry({
                figmaUrl,
                nodeId,
                componentName,
                componentSlug,
                outputPath,
                templatePath,
                registryPath,
                fileKeyFromUrl,
                registryIndex,
            });

            ensureSpecOutputDirectoryFn(outputPath);

            const { normalizedSpec, prefilledCount, validationReport } = runSpecGenerationFlow({
                prompt,
                agent: agent as any,
                componentName,
                nodeId,
                skipValidation,
                outputPath,
                registryPath,
                runSpecGenerationPromptFn,
                runSpecRepairPromptFn,
                validateGeneratedSpecFn,
                materializeGeneratedSpec: () => {
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
                },
            });

            return finalizeSpecResult({
                outputPath,
                normalizedSpec,
                componentName,
                nodeId,
                prefilledCount,
                validationReport,
                resolvedSpecRoot,
                docsRootDir,
                overviewPath,
                registryIndexPath,
                syncDocumentationIndicesFn,
            });
        },
    });
}
