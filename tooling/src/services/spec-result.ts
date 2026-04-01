/**
 * Spec Result Builder
 *
 * Standardizes the shape of the spec generation success response.
 */

export interface IndexSyncResult {
    changed: string[];
    written: string[];
    registry: {
        registryDbPath: string;
        fingerprint: string;
    };
    overview: {
        overviewPath: string;
    };
}

export interface SpecGenerationResult {
    ok: boolean;
    outputPath: string;
    componentName: string | null;
    componentSetNodeId: string | null;
    tokenPrefilled: number;
    unresolvedTbdCount: number;
    validation: {
        ok?: boolean;
        errors?: number;
        warnings?: number;
        skipped?: boolean;
    };
    documentationIndices: {
        changed: string[];
        written: string[];
        registryDbPath: string;
        registryFingerprint: string;
        overviewPath: string;
    };
}

export interface BuildSpecResultOptions {
    outputPath: string;
    normalizedSpec: any;
    componentName?: string;
    nodeId?: string;
    prefilledCount: number;
    unresolvedTbdCount: number;
    validationReport?: any;
    indicesSync: IndexSyncResult;
}

/**
 * Builds a standardized results object for spec generation.
 */
export function buildSpecGenerationResult(options: BuildSpecResultOptions): SpecGenerationResult {
    const {
        outputPath,
        normalizedSpec,
        componentName,
        nodeId,
        prefilledCount,
        unresolvedTbdCount,
        validationReport,
        indicesSync,
    } = options;

    return {
        ok: true,
        outputPath,
        componentName: normalizedSpec.name || componentName || null,
        componentSetNodeId: nodeId || null,
        tokenPrefilled: prefilledCount,
        unresolvedTbdCount,
        validation: validationReport
            ? {
                ok: validationReport.ok,
                errors: validationReport.summary.errors,
                warnings: validationReport.summary.warnings,
            }
            : { skipped: true },
        documentationIndices: {
            changed: indicesSync.changed,
            written: indicesSync.written,
            registryDbPath: indicesSync.registry.registryDbPath,
            registryFingerprint: indicesSync.registry.fingerprint,
            overviewPath: indicesSync.overview.overviewPath,
        },
    };
}
