/**
 * Context creation helpers.
 */
export function createSummary() {
    return {
        totalTokens: 0,
        successCount: 0,
        unresolvedRefs: [],
        invalidNames: [],
        circularDeps: 0,
        depthLimitHits: 0,
        cssVarNameCollisions: 0,
        cssVarNameCollisionDetails: []
    };
}
export function createProcessingContext(args) {
    return Object.freeze({ ...args });
}
