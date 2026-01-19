/**
 * Context creation helpers.
 */

import type { ExecutionSummary, ProcessingContext } from '../types/tokens.js';

export function createSummary(): ExecutionSummary {
    return {
        totalTokens: 0,
        successCount: 0,
        unresolvedRefs: [],
        invalidNames: [],
        circularDeps: 0,
        depthLimitHits: 0,
        cssVarNameCollisions: 0,
        cssVarNameCollisionDetails: [],
        invalidTokens: [],
        tokenTypeCounts: {}
    };
}

export function createProcessingContext<T extends ProcessingContext>(args: T): Readonly<T> {
    return Object.freeze({ ...args });
}
