/**
 * Spec Run Context Service
 *
 * Handles creation and validation of the execution context for spec generation.
 */

import * as path from 'node:path';
import {
    normalizeComponentName,
    normalizeNodeId,
    buildSpecOutputPath,
    resolveFigmaSource,
    assertBypassPolicy,
    assertOutputPath,
} from '../utils/index.js';
import type { PipelineContext, SpecRunContext } from '../types/pipeline.js';

export interface CreateSpecRunContextOptions {
    context: PipelineContext;
    args: Record<string, string | boolean>;
}

/**
 * Creates a specialized context for a single spec generation run.
 */
export function createSpecRunContext(options: CreateSpecRunContextOptions): SpecRunContext {
    const { context, args } = options;
    const figmaUrl = context.figmaUrl;
    const explicitNodeId = normalizeNodeId(args['component-set-node-id'] as string || '');
    const rawComponentName = String(args['component-name'] || '').trim();
    const normalizedName = normalizeComponentName(rawComponentName);
    const componentName = normalizedName.displayName;
    const componentSlug = normalizedName.fileSlug;

    const specRoot = (args['spec-root'] as string) || context.system.paths.specs;
    const resolvedSpecRoot = context.paths.resolvedSpecRoot;
    const docsRootDir = context.paths.docsRootDir;
    const templatePath = context.paths.templatePath;
    const registryPath = context.paths.tokenRegistryPath;

    const force = context.flags.force;
    const skipValidation = context.flags.skipValidation;
    const allowNonEvidenceUpdates = context.flags.allowNonEvidenceUpdates;
    const agent = context.flags.agent || 'auto';

    assertBypassPolicy({ force, skipValidation, allowNonEvidenceUpdates });

    const { fileKeyFromUrl, nodeId } = resolveFigmaSource({
        figmaUrl,
        nodeId: explicitNodeId,
        rawComponentName,
    });

    const outputPath = buildSpecOutputPath(args, specRoot, componentSlug, nodeId);
    assertOutputPath(outputPath);

    const overviewPath = context.paths.overviewPath;
    const databaseUrl = context.paths.databaseUrl;
    const allowedWritePaths = [outputPath, overviewPath];

    return {
        figmaUrl,
        componentName,
        componentSlug,
        specRoot,
        resolvedSpecRoot,
        docsRootDir,
        templatePath,
        registryPath,
        skipValidation,
        allowNonEvidenceUpdates,
        agent,
        fileKeyFromUrl,
        nodeId,
        outputPath,
        overviewPath,
        databaseUrl,
        allowedWritePaths,
    };
}
