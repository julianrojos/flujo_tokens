/**
 * Token and context types for the CSS variables generator.
 */

// --- Token types ---

export interface TokenValue {
    $value: string | number | boolean | null | any[] | Record<string, any>;
    $type?: string;
    $extensions?: {
        mode?: Record<string, string>;
        [key: string]: any;
    };
    [key: string]: any;
}

export interface VariableAliasObject {
    type: 'VARIABLE_ALIAS';
    id?: string;
}

// --- Summary types ---

export interface ExecutionSummary {
    totalTokens: number;
    successCount: number;
    unresolvedRefs: string[];
    invalidNames: string[];
    circularDeps: number;
    depthLimitHits: number;

    /** Distinct tokens mapping to the same `--var-name` (CSS is last-write-wins). */
    cssVarNameCollisions: number;
    cssVarNameCollisionDetails: string[];
    invalidTokens: string[];
    tokenTypeCounts: Record<string, number>;
}

// --- Collision types ---

export type CssVarOwner = { tokenKey: string; tokenPath: string; id?: string };
export type CssVarCollision = { first: CssVarOwner; others: Map<string, CssVarOwner> };

// --- Context types ---

/**
 * Read-only context passed across phases.
 *
 * `Object.freeze()` is shallow: top-level properties cannot be reassigned, but internal Maps/Sets
 * are intentionally mutable for incremental construction.
 */
export type BaseContext = Readonly<{
    summary: ExecutionSummary;
    cssVarNameOwners?: Map<string, CssVarOwner>;
    cssVarNameCollisionMap?: Map<string, CssVarCollision>;
}>;

export type IndexingContext = BaseContext &
    Readonly<{
        refMap: Map<string, string>;
        valueMap: Map<string, TokenValue>;
        collisionKeys: Set<string>;
        idToVarName: Map<string, string>;
        idToTokenKey: Map<string, string>; // $id -> normalized token key (alias deps + cycle graph)
    }>;

export type EmissionContext = IndexingContext &
    Readonly<{
        tokensData: Record<string, any>;
        cycleStatus: Map<string, boolean>;
        emittableKeys: Set<string>;
    }>;

export type ProcessingContext = IndexingContext | EmissionContext;

// --- Walk types ---

export type WalkPrimitive = string | number | boolean;

export type WalkHandlers = {
    onTokenValue?: (ctx: {
        obj: any;
        prefix: string[];
        currentPath: string[];
        depth: number;
        inModeBranch: boolean;
        inheritedType?: string;
    }) => void;
    onLegacyPrimitive?: (ctx: {
        value: WalkPrimitive;
        key: string;
        normalizedKey: string;
        prefix: string[];
        currentPath: string[];
        depth: number;
        inModeBranch: boolean;
        inheritedType?: string;
    }) => void;
};

// --- Type guards ---

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVariableAlias(value: unknown): value is VariableAliasObject {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
}

/**
 * Detects keys representing mode branches (e.g., `modeDefault`, `modeDark`, `mode_1`).
 * This is intentionally conservative to avoid false positives such as "model" / "modeled".
 */
export function isModeKey(key: string): boolean {
    if (!key) return false;
    if (!/^mode/i.test(key)) return false;

    const tail = key.slice(4);
    if (!tail) return true;
    if (tail.toLowerCase() === 'default') return true;

    const first = tail[0];
    return /[A-Z0-9_-]/.test(first);
}

export function shouldSkipKey(key: string): boolean {
    // Skip metadata ($...) and mode branches; the selected mode branch is traversed separately.
    return key.startsWith('$') || isModeKey(key);
}
