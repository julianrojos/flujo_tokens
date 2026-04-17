/**
 * Spec Runner Utility
 *
 * Provides a high-level execution wrapper for spec generation tasks,
 * ensuring scoped writes and automatic rollbacks on failure.
 */

import {
    captureFileSnapshot,
    parseExistingSpecFromSnapshot,
    captureScopedWriteSnapshot,
    assertScopedWritePolicy,
} from '../utils/index.js';

export interface RunSpecWithGuardsOptions {
    outputPath: string;
    resolvedSpecRoot: string;
    docsPath: string;
    allowedWritePaths: string[];
    run: (opts: { existingSpec: any }) => Promise<any> | any;
    label?: string;
    // Dependency injection for testing/flexibility
    captureFileSnapshotFn?: typeof captureFileSnapshot;
    parseExistingSpecFromSnapshotFn?: typeof parseExistingSpecFromSnapshot;
    captureScopedWriteSnapshotFn?: typeof captureScopedWriteSnapshot;
    assertScopedWritePolicyFn?: typeof assertScopedWritePolicy;
}

/**
 * Runs a spec generation task with safety guards.
 */
export async function runSpecWithGuards(options: RunSpecWithGuardsOptions): Promise<any> {
    const {
        outputPath,
        resolvedSpecRoot,
        docsPath,
        allowedWritePaths,
        run,
        label = 'ds-spec-from-figma',
        captureFileSnapshotFn = captureFileSnapshot,
        parseExistingSpecFromSnapshotFn = parseExistingSpecFromSnapshot,
        captureScopedWriteSnapshotFn = captureScopedWriteSnapshot,
        assertScopedWritePolicyFn = assertScopedWritePolicy,
    } = options;

    // We capture the file state here strictly to parse the existing spec for evidence gates.
    const existingFileState = captureFileSnapshotFn(outputPath);
    const existingSpec = parseExistingSpecFromSnapshotFn(existingFileState, outputPath);

    const scopeSnapshot = captureScopedWriteSnapshotFn({
        directories: [resolvedSpecRoot, docsPath],
        extensions: ['.yml', '.md', '.json'],
    });

    try {
        const result = await run({ existingSpec });
        assertScopedWritePolicyFn({
            snapshot: scopeSnapshot,
            allowedPaths: allowedWritePaths,
            label,
        });
        return result;
    } catch (error) {
        let scopeMessage = '';
        try {
            assertScopedWritePolicyFn({
                snapshot: scopeSnapshot,
                allowedPaths: allowedWritePaths,
                label,
            });
        } catch (scopeError) {
            scopeMessage = `\n${scopeError instanceof Error ? scopeError.message : String(scopeError)}`;
        }
        throw new Error(`${error instanceof Error ? error.message : String(error)}${scopeMessage}`);
    }
}
