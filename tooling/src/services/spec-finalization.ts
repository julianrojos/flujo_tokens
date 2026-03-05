/**
 * Spec Finalization Service
 *
 * Handles post-generation tasks such as indexing and building the final result object.
 */

import * as path from 'node:path';
import { countTbdValues } from '../utils/index.js';
import { buildSpecGenerationResult } from './spec-result.js';
import type { SpecGenerationResult, IndexSyncResult } from './spec-result.js';

interface SyncIndicesLikeResult {
    changed: boolean | string[];
    written: boolean | string[];
    registry: {
        registryPath: string;
        fingerprint: string;
        changed?: boolean;
        written?: boolean;
    };
    overview: {
        overviewPath: string;
        changed?: boolean;
        written?: boolean;
    };
}

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
    syncDocumentationIndicesFn: (opts: any) => SyncIndicesLikeResult;
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

    const syncResult = syncDocumentationIndicesFn({
        specsDir: resolvedSpecRoot,
        docsDir: path.join(docsRootDir, 'components'),
        overviewPath,
        proofsDir: path.join(docsRootDir, '_generated', 'visual-proofs'),
        renderDir: path.join(docsRootDir, '_generated', 'figma_doc_models'),
        registryPath: registryIndexPath,
    });

    // Normalize written: convert boolean to string[] or use existing array
    const written = Array.isArray(syncResult.written)
        ? syncResult.written.map((value) => String(value || '').trim()).filter(Boolean)
        : (() => {
            const paths: string[] = [];
            if (syncResult.registry.written) paths.push(syncResult.registry.registryPath);
            if (syncResult.overview.written) paths.push(syncResult.overview.overviewPath);
            // Removed third branch: don't assume both paths were written if written is true
            return paths;
        })();

    // Normalize changed: check registry.changed and overview.changed individually
    const changed = Array.isArray(syncResult.changed)
        ? syncResult.changed
        : (() => {
            const paths: string[] = [];
            if (syncResult.registry.changed) paths.push(syncResult.registry.registryPath);
            if (syncResult.overview.changed) paths.push(syncResult.overview.overviewPath);
            // Fallback: if top-level changed is true but individual flags missing/undefined,
            // assume both paths changed to preserve backward compatibility
            if (paths.length === 0 && syncResult.changed === true) {
                paths.push(syncResult.registry.registryPath, syncResult.overview.overviewPath);
            }
            return paths;
        })();

    const indicesSync: IndexSyncResult = {
        changed,
        written,
        registry: {
            registryPath: syncResult.registry.registryPath,
            fingerprint: syncResult.registry.fingerprint,
        },
        overview: {
            overviewPath: syncResult.overview.overviewPath,
        },
    };

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
