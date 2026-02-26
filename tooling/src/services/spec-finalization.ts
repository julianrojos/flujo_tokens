/**
 * Spec Finalization Service
 *
 * Handles post-generation tasks such as indexing and building the final result object.
 */

import * as path from 'node:path';
import { countTbdValues } from '../utils/index.js';
import { buildSpecGenerationResult } from './spec-result.js';
import type { SpecGenerationResult, IndexSyncResult } from './spec-result.js';

export interface FinalizeSpecOptions {
    outputPath: string;
    normalizedSpec: any;
    componentName?: string;
    nodeId?: string;
    prefilledCount: number;
    validationReport?: any;
    resolvedSpecRoot: string;
    docsRootDir: string;
    overviewPath: string;
    registryIndexPath: string;
    syncDocumentationIndicesFn: (opts: any) => IndexSyncResult;
}

/**
 * Finalizes the spec generation process by syncing indices and building the result.
 */
export function finalizeSpecResult(options: FinalizeSpecOptions): SpecGenerationResult {
    const {
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
    } = options;

    const indicesSync = syncDocumentationIndicesFn({
        specsDir: resolvedSpecRoot,
        docsDir: path.join(docsRootDir, 'components'),
        overviewPath,
        proofsDir: path.join(docsRootDir, '_generated', 'visual-proofs'),
        renderDir: path.join(docsRootDir, '_generated', 'figma_doc_models'),
        registryPath: registryIndexPath,
    });

    return buildSpecGenerationResult({
        outputPath,
        normalizedSpec,
        componentName,
        nodeId,
        prefilledCount,
        unresolvedTbdCount: countTbdValues(normalizedSpec),
        validationReport,
        indicesSync,
    });
}
