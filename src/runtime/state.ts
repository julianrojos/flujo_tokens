/**
 * Runtime state: caches and warn-once guards.
 * Call `resetRuntimeState()` before each run to ensure clean state.
 */

// --- Memoization caches ---

export const kebabCaseCache = new Map<string, string>();
export const refCanonicalCache = new Map<string, string>();
export const findTokenByIdCache = new Map<string, string[] | null>();

// --- Warn-once guards ---

export const warnedAliasVarCollisions = new Set<string>();
export const warnedDuplicateTokenIds = new Set<string>();
export const warnedFindTokenByIdDepthLimit = new Set<string>();
export const warnedAmbiguousModeDefaultAt = new Set<string>();
export const warnedMissingPreferredMode = new Set<string>();
export const warnedBaseValueSkippedForMode = new Set<string>();
export const warnedPreferredModeFallback = new Set<string>();
export const foundModeKeys = new Set<string>();
export const modeFallbackCounts = new Map<string, number>();
export const modeFallbackExamples = new Map<string, string[]>();

/**
 * Clears all runtime state for a fresh run.
 * Must be called at the start of each CLI execution.
 */
export function resetRuntimeState(): void {
    kebabCaseCache.clear();
    refCanonicalCache.clear();
    findTokenByIdCache.clear();

    warnedAliasVarCollisions.clear();
    warnedDuplicateTokenIds.clear();
    warnedFindTokenByIdDepthLimit.clear();
    warnedAmbiguousModeDefaultAt.clear();
    warnedMissingPreferredMode.clear();
    warnedBaseValueSkippedForMode.clear();
    warnedPreferredModeFallback.clear();
    foundModeKeys.clear();
    modeFallbackCounts.clear();
    modeFallbackExamples.clear();
}
