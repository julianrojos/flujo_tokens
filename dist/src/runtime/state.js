/**
 * Runtime state: caches and warn-once guards.
 * Call `resetRuntimeState()` before each run to ensure clean state.
 */
// --- Memoization caches ---
export const kebabCaseCache = new Map();
export const refCanonicalCache = new Map();
export const findTokenByIdCache = new Map();
// --- Warn-once guards ---
export const warnedAliasVarCollisions = new Set();
export const warnedDuplicateTokenIds = new Set();
export const warnedFindTokenByIdDepthLimit = new Set();
export const warnedAmbiguousModeDefaultAt = new Set();
/**
 * Clears all runtime state for a fresh run.
 * Must be called at the start of each CLI execution.
 */
export function resetRuntimeState() {
    kebabCaseCache.clear();
    refCanonicalCache.clear();
    findTokenByIdCache.clear();
    warnedAliasVarCollisions.clear();
    warnedDuplicateTokenIds.clear();
    warnedFindTokenByIdDepthLimit.clear();
    warnedAmbiguousModeDefaultAt.clear();
}
