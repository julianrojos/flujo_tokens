/**
 * Generates a `variables.css` file (CSS custom properties) from Figma token JSON exports.
 *
 * High-level flow:
 * 1) Read and merge JSON files under `JSON_DIR` (each file becomes a namespace).
 * 2) Index tokens for fast reference resolution, alias resolution, and diagnostics.
 * 3) Emit a deterministic `:root { --vars }` block to `OUTPUT_FILE`.
 *
 * Reference formats supported:
 * - W3C-style references embedded in strings: `{path.to.token}` → `var(--path-to-token)`
 * - Figma `VARIABLE_ALIAS` objects, resolved via `$id` when available.
 *
 * String tokens (`$type === "string"`):
 * CSS does not support true string interpolation. If a string token contains references,
 * the output is emitted as a CSS token sequence (a space-separated list), e.g.:
 *   `"Hello"` var(--name) `"!"`
 */

// NOTE: This file uses TypeScript syntax (types/interfaces). Execute with tsx/ts-node, or compile with tsc.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---

const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'output/variables.css');
const MAX_DEPTH = 50;
const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';

// --- Regular expressions ---

/**
 * W3C reference payloads: `{some.path}`.
 *
 * Global regexes (`/g`) are stateful in JS (`lastIndex`). We keep separate instances to reduce
 * the risk of cross-call interference if this file is refactored (e.g., if `exec()` loops are moved
 * or introduced in more places).
 */
const W3C_REF_REGEX_REPLACE = /\{([A-Za-z0-9_./\s-]+)\}/g; // Used for replacement/scanning.
const W3C_REF_REGEX_COLLECT = /\{([A-Za-z0-9_./\s-]+)\}/g; // Used for dependency collection via exec().

/** Precompiled helpers for validating CSS custom property names. */
const STARTS_WITH_DIGIT_REGEX = /^\d/;
const CSS_VAR_NAME_AFTER_DASHES_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Matches a single generated CSS variable declaration line:
 *   `  --name: <value>;` with an optional trailing block comment.
 *
 * This is used only for change detection over this script's own output (`cssLines`), and is not a
 * general-purpose CSS parser. For robust parsing of existing CSS, see `extractCssVariables()`.
 */
const CSS_DECL_LINE_REGEX = /^\s*--([a-zA-Z0-9_-]+):\s*(.*);\s*(?:\/\*[\s\S]*\*\/\s*)?$/;

// --- Types ---

interface TokenValue {
    $value: string | number | boolean | null | any[] | Record<string, any>;
    $type?: string;
    $extensions?: {
        mode?: Record<string, string>;
        [key: string]: any;
    };
    [key: string]: any;
}

interface VariableAliasObject {
    type: 'VARIABLE_ALIAS';
    id?: string;
}

interface ExecutionSummary {
    totalTokens: number;
    successCount: number;
    unresolvedRefs: string[];
    invalidNames: string[];
    circularDeps: number;
    depthLimitHits: number;

    /** Diagnostics for CSS namespace collisions (distinct tokens mapping to the same `--var-name`). */
    cssVarNameCollisions: number;
    cssVarNameCollisionDetails: string[];
}

function createSummary(): ExecutionSummary {
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

// Collision detection and reporting.
type CssVarOwner = { tokenKey: string; tokenPath: string; id?: string };
type CssVarCollision = { first: CssVarOwner; others: Map<string, CssVarOwner> };

const MAX_COLLISION_DETAILS = 10;

/** Warn-once guards to avoid log spam across repeated occurrences. */
const warnedAliasVarCollisions = new Set<string>();
const warnedDuplicateTokenIds = new Set<string>();
const warnedFindTokenByIdDepthLimit = new Set<string>();

/**
 * Read-only context passed across phases.
 *
 * `Object.freeze()` is shallow: it prevents reassigning top-level properties (e.g., `ctx.refMap = ...`),
 * but the Maps/Sets inside remain mutable by design.
 */
type BaseContext = Readonly<{
    summary: ExecutionSummary;
    cssVarNameOwners?: Map<string, CssVarOwner>;
    cssVarNameCollisionMap?: Map<string, CssVarCollision>;
}>;

type IndexingContext = BaseContext &
    Readonly<{
        refMap: Map<string, string>;
        valueMap: Map<string, TokenValue>;
        collisionKeys: Set<string>;
        idToVarName: Map<string, string>;
        idToTokenKey: Map<string, string>; // $id -> normalized token key (for cycle graph + alias deps)
    }>;

type EmissionContext = IndexingContext &
    Readonly<{
        tokensData: Record<string, any>;
        cycleStatus: Map<string, boolean>;
    }>;

type ProcessingContext = IndexingContext | EmissionContext;

function createProcessingContext<T extends ProcessingContext>(args: T): Readonly<T> {
    return Object.freeze({ ...args });
}

// --- Helper functions ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVariableAlias(value: unknown): value is VariableAliasObject {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
}

/**
 * Detects keys representing mode branches (e.g., `modeDefault`, `modeDark`, `mode_1`).
 * This is intentionally conservative to avoid false positives such as "model" / "modeled".
 */
function isModeKey(key: string): boolean {
    if (!key) return false;
    if (!/^mode/i.test(key)) return false;

    const tail = key.slice(4);
    if (!tail) return true;
    if (tail.toLowerCase() === 'default') return true;

    const first = tail[0];
    return /[A-Z0-9_-]/.test(first);
}

function shouldSkipKey(key: string): boolean {
    // Skip metadata ($...) and mode branches; the chosen mode branch is traversed separately.
    return key.startsWith('$') || isModeKey(key);
}

function pickModeKey(keys: string[]): string | undefined {
    // Prefer "modeDefault" for deterministic output; otherwise pick the first detected mode key.
    return keys.find(k => k.toLowerCase() === 'modedefault') ?? keys.find(isModeKey);
}

/**
 * UTF-16 code unit comparison to match JavaScript's default `.sort()` ordering, without allocating
 * a sorted array. Used to make mode selection deterministic when we intentionally skip sorting keys.
 */
function compareByCodeUnit(a: string, b: string): number {
    return a > b ? 1 : a < b ? -1 : 0;
}

/**
 * Selects a mode key deterministically without sorting the full key list.
 * This preserves the same selection you would get from sorted keys + `pickModeKey()`.
 */
function pickModeKeyDeterministic(keys: string[]): string | undefined {
    let bestDefault: string | undefined;
    let bestMode: string | undefined;

    for (const k of keys) {
        if (k.toLowerCase() === 'modedefault') {
            if (!bestDefault || compareByCodeUnit(k, bestDefault) < 0) bestDefault = k;
            continue;
        }
        if (isModeKey(k)) {
            if (!bestMode || compareByCodeUnit(k, bestMode) < 0) bestMode = k;
        }
    }

    return bestDefault ?? bestMode;
}

function toSafePlaceholderName(id: string): string {
    const placeholderName = id
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return placeholderName || 'unknown';
}

/**
 * Memoization caches are cleared in `main()` so this script can run safely in watch/test environments
 * without unbounded growth across runs.
 */
const kebabCaseCache = new Map<string, string>();
const refCanonicalCache = new Map<string, string>();
const findTokenByIdCache = new Map<string, string[] | null>();

function toKebabCase(name: string): string {
    const cached = kebabCaseCache.get(name);
    if (cached !== undefined) {
        return cached;
    }

    // Convert common separators and camelCase into kebab-case (used in CSS variable names).
    let result = name.replace(/-/g, ' ');
    result = result.replace(/[\\/]+/g, ' ');
    result = result.replace(/([a-z])([A-Z])/g, '$1-$2');
    result = result.toLowerCase();
    result = result.replace(/[\s-]+/g, '-');
    result = result.replace(/^-+|-+$/g, '');

    kebabCaseCache.set(name, result);
    return result;
}

function isValidCssVariableName(name: string): boolean {
    if (!name.startsWith('--')) return false;
    const afterDashes = name.slice(2);
    // Custom properties cannot start with a digit immediately after the dashes.
    if (!afterDashes || STARTS_WITH_DIGIT_REGEX.test(afterDashes)) return false;
    return CSS_VAR_NAME_AFTER_DASHES_REGEX.test(afterDashes);
}

function pathStr(currentPath: string[]): string {
    return currentPath.join('.');
}

/**
 * Builds a CSS custom property name from a kebab-cased prefix:
 *   ["colors", "brand", "primary"] → "--colors-brand-primary"
 *
 * Implemented as an indexed loop to avoid creating intermediate arrays.
 */
function buildCssVarNameFromPrefix(prefix: string[]): string {
    let out = '--';
    let first = true;

    for (let i = 0; i < prefix.length; i++) {
        const p = prefix[i];
        if (!p) continue;
        if (!first) out += '-';
        out += p;
        first = false;
    }

    return out;
}

/**
 * Safety guard against infinite recursion or unexpectedly deep JSON structures.
 */
function checkDepthLimit(summary: ExecutionSummary, depth: number, currentPath: string[]): boolean {
    if (depth <= MAX_DEPTH) return false;
    console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${pathStr(currentPath)}; truncating traversal.`);
    summary.depthLimitHits++;
    return true;
}

function recordUnresolved(summary: ExecutionSummary, currentPath: string[], reason: string): void {
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

function recordUnresolvedTyped(summary: ExecutionSummary, currentPath: string[], label: string, detail: string): void {
    recordUnresolved(summary, currentPath, ` (${label}: ${detail})`);
}

/**
 * Emits a single custom property declaration into `collectedVars`, if the name is valid.
 */
function emitCssVar(
    summary: ExecutionSummary,
    collectedVars: string[],
    varName: string,
    value: string,
    currentPath: string[],
    recordInvalidName: boolean
): void {
    if (!isValidCssVariableName(varName)) {
        console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
        if (recordInvalidName) {
            summary.invalidNames.push(`${pathStr(currentPath)} (Invalid CSS Var: ${varName})`);
        }
        return;
    }

    collectedVars.push(`  ${varName}: ${value};`);
    summary.successCount++;
}

/**
 * Detects namespace collisions where distinct tokens map to the same CSS variable name.
 * In CSS, the last emitted definition wins, so collisions can cause silent overwrites.
 */
function trackCssVarNameCollision(ctx: BaseContext, varName: string, owner: CssVarOwner): void {
    const { summary, cssVarNameOwners, cssVarNameCollisionMap } = ctx;
    if (!cssVarNameOwners || !cssVarNameCollisionMap) return;
    if (!varName) return;

    const existing = cssVarNameOwners.get(varName);
    if (!existing) {
        cssVarNameOwners.set(varName, owner);
        return;
    }

    // Ignore if it's the same token identity (e.g., mode overrides).
    if (existing.tokenKey === owner.tokenKey) return;

    let entry = cssVarNameCollisionMap.get(varName);
    if (!entry) {
        entry = { first: existing, others: new Map<string, CssVarOwner>() };
        cssVarNameCollisionMap.set(varName, entry);
        summary.cssVarNameCollisions++;

        const fmt = (o: CssVarOwner) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
        const detail = `${varName}: ${fmt(existing)} <-> ${fmt(owner)}`;

        if (summary.cssVarNameCollisionDetails.length < MAX_COLLISION_DETAILS) {
            summary.cssVarNameCollisionDetails.push(detail);
        }

        console.warn(
            `⚠️  CSS var name collision for ${varName}: ${fmt(existing)} vs ${fmt(owner)}. ` +
            `In CSS, the last emitted definition wins.`
        );
    }

    entry.others.set(owner.tokenKey || owner.tokenPath, owner);
}

function normalizeDots(pathKey: string): string {
    return pathKey.replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * Builds the canonical dotted token key used for indexing and resolution.
 * Mode segments are excluded to keep token identities stable across modes.
 */
function buildPathKey(segments: string[]): string {
    const dotted = segments
        .filter(segment => segment && !isModeKey(segment))
        .join('.')
        .replace(/[\\/]+/g, '.')
        .replace(/\s+/g, '.');

    return normalizeDots(dotted);
}

/**
 * Case-insensitive normalization used for indexing and lookups.
 */
function normalizePathKey(pathKey: string): string {
    return pathKey.toLowerCase();
}

/**
 * Parses and normalizes a W3C reference payload (e.g., `{token.path}`) into a lookup key.
 * Results are memoized for the duration of a run.
 */
function canonicalizeRefPath(pathKey: string): string {
    if (refCanonicalCache.has(pathKey)) return refCanonicalCache.get(pathKey)!;

    const dotted = pathKey.trim().replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
    const result = normalizeDots(dotted);

    refCanonicalCache.set(pathKey, result);
    return result;
}

/** Shared empty set used as a read-only default for cycle detection seeds. */
const EMPTY_VISITED_REFS: ReadonlySet<string> = new Set<string>();

/**
 * Creates the initial set of visited keys for cycle detection.
 * Stores the normalized key to match the resolution strategy.
 */
function buildVisitedRefSet(currentPath: string[]): ReadonlySet<string> {
    const normalized = normalizePathKey(buildPathKey(currentPath));
    return normalized ? new Set([normalized]) : EMPTY_VISITED_REFS;
}

/**
 * Indexes Figma `$id` properties for O(1) VARIABLE_ALIAS resolution.
 * - Stores the trimmed ID (canonical).
 * - Also stores the raw ID if it differs (backward compatibility with imperfect exports).
 * - Warns once if the same canonical ID maps to multiple tokens.
 */
function indexTokenId(
    tokenObj: any,
    varName: string,
    normalizedTokenKey: string,
    idToVarName: Map<string, string>,
    idToTokenKey: Map<string, string>
): void {
    const idRaw = tokenObj?.$id;
    if (typeof idRaw !== 'string') return;

    const trimmed = idRaw.trim();
    if (!trimmed) return;

    const existingVar = idToVarName.get(trimmed);
    const existingKey = idToTokenKey.get(trimmed);
    const varDiffers = existingVar !== undefined && existingVar !== varName;
    const keyDiffers = existingKey !== undefined && normalizedTokenKey && existingKey !== normalizedTokenKey;

    if ((varDiffers || keyDiffers) && !warnedDuplicateTokenIds.has(trimmed)) {
        warnedDuplicateTokenIds.add(trimmed);
        console.warn(
            `⚠️  Duplicate $id detected: "${trimmed}" is assigned to multiple tokens. ` +
            `First: var=${existingVar ?? 'n/a'}, key=${existingKey ?? 'n/a'}; ` +
            `Next: var=${varName}, key=${normalizedTokenKey || 'n/a'}. ` +
            `VARIABLE_ALIAS resolution will use the latest mapping.`
        );
    }

    idToVarName.set(trimmed, varName);
    if (normalizedTokenKey) idToTokenKey.set(trimmed, normalizedTokenKey);

    if (idRaw !== trimmed) {
        idToVarName.set(idRaw, varName);
        if (normalizedTokenKey) idToTokenKey.set(idRaw, normalizedTokenKey);
    }
}

/**
 * Resolves a reference path using exact canonical match first, then falling back to a case-insensitive
 * normalized match. If the normalized key is ambiguous (collision), resolution fails.
 */
function getResolvedTokenKey(ref: string, ctx: IndexingContext): string | null {
    const canonical = canonicalizeRefPath(ref);
    const normalized = normalizePathKey(canonical);

    const hasKey = (key: string): boolean => ctx.valueMap.has(key) || ctx.refMap.has(key);

    if (ctx.collisionKeys.has(normalized)) return null;
    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;

    return null;
}

/**
 * Optimized resolution helper using precomputed strings to avoid redundant canonicalization.
 */
function getResolvedTokenKeyFromParts(canonical: string, normalized: string, ctx: IndexingContext): string | null {
    const hasKey = (key: string): boolean => ctx.valueMap.has(key) || ctx.refMap.has(key);

    if (ctx.collisionKeys.has(normalized)) return null;
    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;

    return null;
}

type WalkPrimitive = string | number | boolean;

type WalkHandlers = {
    onTokenValue?: (ctx: { obj: any; prefix: string[]; currentPath: string[]; depth: number; inModeBranch: boolean }) => void;
    onLegacyPrimitive?: (ctx: {
        value: WalkPrimitive;
        key: string;
        normalizedKey: string;
        prefix: string[];
        currentPath: string[];
        depth: number;
        inModeBranch: boolean;
    }) => void;
};

/**
 * Traverses the token object tree.
 *
 * Features:
 * - Optional sorted key traversal for deterministic output (`sortKeys=true`).
 * - Mode branch handling: mode keys are skipped during normal traversal and a single selected mode
 *   branch is traversed after base keys.
 * - Leaf detection:
 *   - objects containing `$value` are treated as W3C token leaves
 *   - primitive leaves are treated as legacy tokens
 */
function walkTokenTree(
    summary: ExecutionSummary,
    obj: any,
    prefix: string[],
    currentPath: string[],
    handlers: WalkHandlers,
    depth = 0,
    inModeBranch = false,
    sortKeys = true
): void {
    if (checkDepthLimit(summary, depth, currentPath)) return;

    if (obj && typeof obj === 'object' && '$value' in obj) {
        handlers.onTokenValue?.({ obj, prefix, currentPath, depth, inModeBranch });
        return;
    }

    if (!isPlainObject(obj)) return;

    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    const modeKey = sortKeys ? pickModeKey(keys) : pickModeKeyDeterministic(keys);

    for (const key of keys) {
        if (shouldSkipKey(key)) continue;

        const value = (obj as Record<string, any>)[key];
        const normalizedKey = toKebabCase(key);

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            handlers.onLegacyPrimitive?.({ value, key, normalizedKey, prefix, currentPath, depth, inModeBranch });
            continue;
        }

        walkTokenTree(summary, value, [...prefix, normalizedKey], [...currentPath, key], handlers, depth + 1, inModeBranch, sortKeys);
    }

    if (modeKey) {
        walkTokenTree(summary, (obj as Record<string, any>)[modeKey], prefix, [...currentPath, modeKey], handlers, depth + 1, true, sortKeys);
    }
}

/**
 * Collects reference dependencies from a value for cycle detection.
 * Handles both:
 * - W3C `{...}` references embedded in strings
 * - `VARIABLE_ALIAS` references via `$id` → tokenKey mapping (when available)
 */
function collectRefsFromValue(value: unknown, refs: Set<string>, idToTokenKey?: Map<string, string>): void {
    // Defensive reset: global regexes are stateful.
    W3C_REF_REGEX_COLLECT.lastIndex = 0;

    if (isVariableAlias(value)) {
        const id = value.id?.trim();
        if (id && idToTokenKey) {
            const targetKey = idToTokenKey.get(id);
            if (targetKey) refs.add(targetKey);
        }
        return;
    }

    if (typeof value === 'string') {
        let m: RegExpExecArray | null;
        while ((m = W3C_REF_REGEX_COLLECT.exec(value)) !== null) {
            const tokenPath = (m[1] ?? '').trim();
            if (!tokenPath) continue;
            refs.add(canonicalizeRefPath(tokenPath));
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectRefsFromValue(item, refs, idToTokenKey);
        return;
    }

    if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
            if (!key.startsWith('$')) {
                collectRefsFromValue((value as Record<string, unknown>)[key], refs, idToTokenKey);
            }
        }
    }
}

/**
 * Performs a DFS to determine whether each token can reach a cycle via its dependencies.
 */
function buildCycleStatus(ctx: IndexingContext): Map<string, boolean> {
    const refsByToken = new Map<string, Set<string>>();

    for (const [key, token] of ctx.valueMap.entries()) {
        const refs = new Set<string>();
        collectRefsFromValue(token.$value, refs, ctx.idToTokenKey);
        refsByToken.set(key, refs);
    }

    const color = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=visited
    const leadsToCycle = new Map<string, boolean>();

    const dfs = (node: string): boolean => {
        const state = color.get(node) ?? 0;
        if (state === 1) return true;
        if (state === 2) return leadsToCycle.get(node) ?? false;

        color.set(node, 1);
        let hitCycle = false;

        const refs = refsByToken.get(node);
        if (refs) {
            for (const ref of refs) {
                const next = getResolvedTokenKey(ref, ctx);
                if (!next) continue;
                if (dfs(next)) {
                    hitCycle = true;
                    break;
                }
            }
        }

        color.set(node, 2);
        leadsToCycle.set(node, hitCycle);
        return hitCycle;
    };

    for (const key of refsByToken.keys()) {
        if (!color.has(key)) dfs(key);
    }

    return leadsToCycle;
}

/**
 * Fallback mechanism to resolve a VARIABLE_ALIAS by traversing the entire token tree.
 * Used when the optimized `$id` index misses (e.g., partial exports).
 *
 * Includes:
 * - depth protection (to avoid stack issues on pathological inputs)
 * - warn-once logging when the depth limit aborts the search
 * - `for...in` traversal to avoid allocating key arrays at every recursion level
 */
function findTokenById(
    tokensData: Record<string, any>,
    targetId: string,
    currentPath: string[] = [],
    depth = 0
): string[] | null {
    if (!isPlainObject(tokensData)) return null;

    const target = typeof targetId === 'string' ? targetId.trim() : '';
    if (!target) return null;

    if (depth > MAX_DEPTH) {
        if (!warnedFindTokenByIdDepthLimit.has(target)) {
            warnedFindTokenByIdDepthLimit.add(target);
            const at = currentPath.length ? pathStr(currentPath) : '<root>';
            console.warn(
                `⚠️  findTokenById aborted: depth limit (${MAX_DEPTH}) exceeded while searching for $id="${target}" near ${at}.`
            );
        }
        return null;
    }

    const matchesId = (candidate: unknown): boolean => {
        if (typeof candidate !== 'string') return false;
        return candidate === target || candidate.trim() === target;
    };

    for (const key in tokensData) {
        if (!Object.prototype.hasOwnProperty.call(tokensData, key)) continue;

        if (key.startsWith('$')) {
            const keyValue = (tokensData as any)[key];
            if (key === '$id' && matchesId(keyValue)) return currentPath;
            continue;
        }

        const value = (tokensData as any)[key];

        if (isPlainObject(value)) {
            const newPath = [...currentPath, key];

            if ('$id' in value && matchesId((value as any).$id)) return newPath;

            const found = findTokenById(value as Record<string, any>, target, newPath, depth + 1);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Cached wrapper for `findTokenById()`; caches misses as well.
 * Cleared per run in `main()`.
 */
function findTokenByIdCached(tokensData: Record<string, any>, targetId: string): string[] | null {
    const key = typeof targetId === 'string' ? targetId.trim() : '';
    if (!key) return null;

    if (findTokenByIdCache.has(key)) return findTokenByIdCache.get(key)!;

    const found = findTokenById(tokensData, key);
    findTokenByIdCache.set(key, found);
    return found;
}

// --- (rest of script unchanged up to collectTokenMaps / flattenTokens) ---

function processVariableAlias(ctx: EmissionContext, aliasObj: unknown, currentPath: string[], visitedRefs?: ReadonlySet<string>): string {
    if (!isVariableAlias(aliasObj)) return JSON.stringify(aliasObj);

    const { summary, tokensData, idToVarName, idToTokenKey, cycleStatus, cssVarNameCollisionMap } = ctx;

    const aliasId = aliasObj.id?.trim();
    const targetKey = aliasId ? idToTokenKey.get(aliasId) : undefined;

    if (aliasId && targetKey && visitedRefs?.has(targetKey)) {
        console.warn(`⚠️  Circular VARIABLE_ALIAS reference (id=${aliasId}) at ${pathStr(currentPath)}`);
        summary.circularDeps++;
        return `/* circular-alias: ${aliasId} */`;
    }

    if (aliasId && targetKey) {
        const cachedHasCycle = cycleStatus.get(targetKey);
        if (cachedHasCycle === true) {
            console.warn(`⚠️  Deep circular dependency reachable via VARIABLE_ALIAS (id=${aliasId}) at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-alias: ${aliasId} */`;
        }
    }

    const warnIfCollidingVarName = (varNameWithDashes: string) => {
        const collision = cssVarNameCollisionMap?.get(varNameWithDashes);
        if (!collision || !aliasId) return;

        const warnKey = `${aliasId}|${varNameWithDashes}`;
        if (warnedAliasVarCollisions.has(warnKey)) return;
        warnedAliasVarCollisions.add(warnKey);

        const fmt = (o: CssVarOwner) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
        const sample = Array.from(collision.others.values())[0];
        const total = 1 + collision.others.size;

        console.warn(
            `⚠️  VARIABLE_ALIAS at ${pathStr(currentPath)} (id=${aliasId}) resolved to ${varNameWithDashes}, ` +
            `but this CSS var name collides across ${total} distinct tokens. ` +
            `Last emitted wins; this alias may read an unexpected value. ` +
            `Examples: ${fmt(collision.first)}${sample ? ` | ${fmt(sample)}` : ''}`
        );
    };

    if (aliasId && tokensData) {
        const direct = idToVarName.get(aliasId);
        if (direct) {
            warnIfCollidingVarName(direct);
            return `var(${direct})`;
        }

        const tokenPath = findTokenByIdCached(tokensData, aliasId);
        if (tokenPath) {
            const cssPath = tokenPath.map(toKebabCase).join('-');
            const derived = `--${cssPath}`;
            warnIfCollidingVarName(derived);
            return `var(${derived})`;
        }

        console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${pathStr(currentPath)} con ID: ${aliasId}`);
        console.warn(`   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`);
        console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);

        const placeholderName = toSafePlaceholderName(aliasId);
        recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasId);
        return `var(--unresolved-${placeholderName})`;
    }

    return `var(--${currentPath.map(toKebabCase).join('-')})`;
}

function processShadow(ctx: EmissionContext, shadowObj: unknown, currentPath: string[], visitedRefs: ReadonlySet<string>): string {
    if (!isPlainObject(shadowObj)) return JSON.stringify(shadowObj);

    const shadow = shadowObj as Record<string, any>;

    const rawType = shadow.type as unknown;
    const rawColor = shadow.color as unknown;
    const rawOffset = shadow.offset as unknown;
    const rawRadius = shadow.radius as unknown;
    const rawSpread = shadow.spread as unknown;

    const type = rawType === 'INNER_SHADOW' ? 'INNER_SHADOW' : 'DROP_SHADOW';

    const offset = isPlainObject(rawOffset) ? (rawOffset as { x?: number | null; y?: number | null }) : { x: 0, y: 0 };
    const offsetX = typeof offset.x === 'number' ? offset.x : 0;
    const offsetY = typeof offset.y === 'number' ? offset.y : 0;

    const radius = typeof rawRadius === 'number' ? rawRadius : rawRadius == null ? 0 : Number(rawRadius) || 0;
    const spread = typeof rawSpread === 'number' ? rawSpread : rawSpread == null ? 0 : Number(rawSpread) || 0;

    const colorPath = [...currentPath, 'color'];

    const colorPart = (() => {
        if (rawColor == null) return 'rgba(0, 0, 0, 1)';

        if (isVariableAlias(rawColor)) {
            return processVariableAlias(ctx, rawColor, colorPath, visitedRefs);
        }

        if (typeof rawColor === 'string') {
            const processed = processValue(ctx, rawColor as any, undefined, colorPath, visitedRefs);
            return processed ?? rawColor;
        }

        if (isPlainObject(rawColor)) {
            const r0 = (rawColor as any).r;
            const g0 = (rawColor as any).g;
            const b0 = (rawColor as any).b;
            const a0 = (rawColor as any).a;

            if (typeof r0 === 'number' && typeof g0 === 'number' && typeof b0 === 'number') {
                const isNormalized = (r0 || 0) <= 1 && (g0 || 0) <= 1 && (b0 || 0) <= 1;
                const to255 = (c: number, normalized: boolean): number =>
                    normalized ? Math.round((c || 0) * 255) : Math.round(c || 0);

                const r = to255(r0, isNormalized);
                const g = to255(g0, isNormalized);
                const b = to255(b0, isNormalized);
                const a = typeof a0 === 'number' ? a0 : 1;

                return `rgba(${r}, ${g}, ${b}, ${a})`;
            }
        }

        console.warn(`⚠️  Unsupported shadow color format at ${pathStr(colorPath)}; defaulting to black`);
        return 'rgba(0, 0, 0, 1)';
    })();

    if (type === 'INNER_SHADOW') return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
}

function brokenRefPlaceholder(summary: ExecutionSummary, currentPath: string[], canonicalPath: string, match: string): string {
    const cssPath = canonicalPath.split('.').map(toKebabCase).join('-');
    const varName = `--broken-ref-${cssPath || 'unknown'}`;

    if (!isValidCssVariableName(varName)) {
        summary.invalidNames.push(`${pathStr(currentPath)} (Ref to invalid name: ${varName})`);
        return match;
    }
    return `var(${varName})`;
}

function resolveReference(
    ctx: EmissionContext,
    match: string,
    tokenPath: string,
    originalValue: string,
    currentPath: string[],
    visitedRefs: ReadonlySet<string>,
    seenInValue: Set<string>
): string {
    const { summary, refMap, collisionKeys, cycleStatus } = ctx;

    tokenPath = tokenPath.trim();
    if (!tokenPath) {
        console.warn(`⚠️  Empty W3C reference in "${originalValue}" at ${pathStr(currentPath)}`);
        recordUnresolved(summary, currentPath, ' (Empty ref)');
        return match;
    }

    const canonicalPath = canonicalizeRefPath(tokenPath);
    const normalizedTokenPath = normalizePathKey(canonicalPath);

    const resolvedKey = getResolvedTokenKeyFromParts(canonicalPath, normalizedTokenPath, ctx);
    if (!resolvedKey) {
        const isCollision = collisionKeys.has(normalizedTokenPath);
        console.warn(
            `⚠️  ${isCollision ? 'Ambiguous' : 'Unresolved'} W3C reference ${match} at ${pathStr(currentPath)}${isCollision ? ' (normalized collision)' : ''
            }`
        );

        if (isCollision) recordUnresolvedTyped(summary, currentPath, 'Collision', tokenPath);
        else recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

        return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
    }

    const seenKey = normalizePathKey(resolvedKey);
    if (!seenInValue.has(seenKey)) {
        if (visitedRefs.has(seenKey) || visitedRefs.has(resolvedKey)) {
            console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }

        const cachedHasCycle = cycleStatus.get(resolvedKey);
        if (cachedHasCycle === true) {
            console.warn(`⚠️  Deep circular dependency detected starting from: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }

        seenInValue.add(seenKey);
    }

    const mappedVarName = refMap.get(resolvedKey);
    if (mappedVarName) return `var(${mappedVarName})`;

    console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(currentPath)} (resolved key missing in refMap)`);
    recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

    return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
}

function quoteCssStringLiteral(value: string): string {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r\n|\r|\n/g, ' ');
    return `"${escaped}"`;
}

function buildCssStringTokenSequence(
    ctx: EmissionContext,
    raw: string,
    currentPath: string[],
    visitedRefs: ReadonlySet<string>
): string {
    const parts: string[] = [];
    const seenInValue = new Set<string>();

    W3C_REF_REGEX_REPLACE.lastIndex = 0;

    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = W3C_REF_REGEX_REPLACE.exec(raw)) !== null) {
        const start = m.index;
        const end = W3C_REF_REGEX_REPLACE.lastIndex;

        const before = raw.slice(last, start);
        if (before) parts.push(quoteCssStringLiteral(before));

        const wholeMatch = m[0];
        const tokenPath = (m[1] ?? '').trim();
        const resolved = resolveReference(ctx, wholeMatch, tokenPath, raw, currentPath, visitedRefs, seenInValue);

        parts.push(resolved === wholeMatch ? quoteCssStringLiteral(wholeMatch) : resolved);

        last = end;
    }

    const tail = raw.slice(last);
    if (tail) parts.push(quoteCssStringLiteral(tail));

    return parts.length ? parts.join(' ') : quoteCssStringLiteral('');
}

function processValue(
    ctx: EmissionContext,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    visitedRefs: ReadonlySet<string> = EMPTY_VISITED_REFS
): string | null {
    const { summary } = ctx;

    if (value === null || value === undefined) return 'null';

    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            return value.map(v => processShadow(ctx, v, currentPath, visitedRefs)).join(', ');
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    if (typeof value === 'object') {
        if (varType === 'shadow' && !isVariableAlias(value)) {
            return processShadow(ctx, value, currentPath, visitedRefs);
        }
        if (isVariableAlias(value)) {
            return processVariableAlias(ctx, value, currentPath, visitedRefs);
        }

        console.warn(`⚠️  Token compuesto no soportado en ${pathStr(currentPath)}, se omite`);
        recordUnresolved(summary, currentPath, ' (Composite object skipped)');
        return null;
    }

    if (typeof value === 'string') {
        if (value.startsWith('rgba') || value.startsWith('rgb(')) return value;
        if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) return value;

        if (varType === 'string') {
            W3C_REF_REGEX_REPLACE.lastIndex = 0;
            const hasRef = W3C_REF_REGEX_REPLACE.exec(value) !== null;
            W3C_REF_REGEX_REPLACE.lastIndex = 0;

            if (!hasRef) return quoteCssStringLiteral(value);
            return buildCssStringTokenSequence(ctx, value, currentPath, visitedRefs);
        }

        const seenInValue = new Set<string>();
        let hadRef = false;

        W3C_REF_REGEX_REPLACE.lastIndex = 0;

        const replaced = value.replace(W3C_REF_REGEX_REPLACE, (m, tp) => {
            hadRef = true;
            return resolveReference(ctx, m, tp, value, currentPath, visitedRefs, seenInValue);
        });

        return hadRef ? replaced : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return String(value);
}

function collectTokenMaps(ctx: IndexingContext, obj: any, prefix: string[] = [], currentPath: string[] = []): void {
    const { summary, refMap, valueMap, collisionKeys, idToVarName, idToTokenKey } = ctx;

    const upsertKey = (key: string, varName: string, tokenObj: TokenValue, debugLabel: string, allowOverride: boolean) => {
        if (!key) return;

        if (!refMap.has(key)) {
            refMap.set(key, varName);
            valueMap.set(key, tokenObj);
            return;
        }

        const existing = refMap.get(key);
        if (existing !== varName) {
            console.warn(`ℹ️  Normalized collision${debugLabel ? ` (${debugLabel})` : ''}: key "${key}" maps to multiple vars.`);
            collisionKeys.add(key);
            return;
        }

        if (allowOverride) valueMap.set(key, tokenObj);
        else console.warn(`ℹ️  Duplicate token for normalized key ${key}${debugLabel ? ` (${debugLabel})` : ''}`);
    };

    // Indexing does not require sorted traversal order.
    walkTokenTree(
        summary,
        obj,
        prefix,
        currentPath,
        {
            onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inModeBranch }) => {
                // ✅ (1) Prevent "$value ghost references": only index tokens that will actually be emittable.
                const rawValue = (tokenObj as any)?.$value;
                if (rawValue === undefined) return;

                const tokenPathKey = buildPathKey(tokenPath);
                const normalizedKey = normalizePathKey(tokenPathKey);
                const varName = buildCssVarNameFromPrefix(tokenPrefix);

                indexTokenId(tokenObj, varName, normalizedKey, idToVarName, idToTokenKey);

                trackCssVarNameCollision(ctx, varName, {
                    tokenKey: normalizedKey,
                    tokenPath: pathStr(tokenPath),
                    id: typeof (tokenObj as any)?.$id === 'string' ? (tokenObj as any).$id : undefined
                });

                upsertKey(normalizedKey, varName, tokenObj as TokenValue, tokenPathKey, inModeBranch);

                const relativePathKey = buildPathKey(tokenPath.slice(1));
                const relativeNormalizedKey = normalizePathKey(relativePathKey);
                if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
                    upsertKey(relativeNormalizedKey, varName, tokenObj as TokenValue, `relative:${relativePathKey}`, inModeBranch);
                }
            },

            onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix, inModeBranch }) => {
                const leafPath = [...parentPath, key];
                const leafPrefix = [...parentPrefix, normalizedKey];
                const varName = buildCssVarNameFromPrefix(leafPrefix);

                const tokenPathKey = buildPathKey(leafPath);
                const normalizedPathKey = normalizePathKey(tokenPathKey);

                const legacyTokenObj: TokenValue = { $value: value };

                trackCssVarNameCollision(ctx, varName, { tokenKey: normalizedPathKey, tokenPath: pathStr(leafPath) });

                upsertKey(normalizedPathKey, varName, legacyTokenObj, tokenPathKey, inModeBranch);

                const relativePathKey = buildPathKey(leafPath.slice(1));
                const relativeNormalizedKey = normalizePathKey(relativePathKey);
                if (relativeNormalizedKey && relativeNormalizedKey !== normalizedPathKey) {
                    upsertKey(relativeNormalizedKey, varName, legacyTokenObj, `relative:${relativePathKey}`, inModeBranch);
                }
            }
        },
        0,
        false,
        false
    );
}

// --- rest of file unchanged, except point (3) below in flattenTokens ---

function extractCssVariables(cssContent: string): Map<string, string> {
    const variables = new Map<string, string>();
    const rootStart = cssContent.indexOf(':root');
    if (rootStart === -1) return variables;

    const braceStart = cssContent.indexOf('{', rootStart);
    if (braceStart === -1) return variables;

    let braceCount = 0;
    let braceEnd = braceStart;
    for (let i = braceStart; i < cssContent.length; i++) {
        if (cssContent[i] === '{') braceCount++;
        else if (cssContent[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                braceEnd = i;
                break;
            }
        }
    }

    let rootContent: string;
    if (braceCount !== 0) {
        const rootMatch = cssContent.match(/:root\s*\{([\s\S]+?)\}/);
        if (!rootMatch) return variables;
        rootContent = rootMatch[1];
    } else {
        rootContent = cssContent.substring(braceStart + 1, braceEnd);
    }

    rootContent = rootContent.replace(/\/\*[\s\S]*?\*\//g, '');

    const isEscaped = (pos: number): boolean => {
        let backslashes = 0;
        let idx = pos - 1;
        while (idx >= 0 && rootContent[idx] === '\\') {
            backslashes++;
            idx--;
        }
        return backslashes % 2 === 1;
    };

    let i = 0;
    while (i < rootContent.length) {
        while (i < rootContent.length && /\s/.test(rootContent[i])) i++;

        if (i >= rootContent.length || rootContent.substring(i, i + 2) !== '--') {
            i++;
            continue;
        }

        const nameStart = i + 2;
        let nameEnd = nameStart;
        while (nameEnd < rootContent.length && /[a-zA-Z0-9_-]/.test(rootContent[nameEnd])) {
            nameEnd++;
        }
        const name = rootContent.substring(nameStart, nameEnd);

        i = nameEnd;
        while (i < rootContent.length && /\s/.test(rootContent[i])) i++;
        if (i >= rootContent.length || rootContent[i] !== ':') continue;
        i++;

        while (i < rootContent.length && /\s/.test(rootContent[i])) i++;

        const valueStart = i;
        let depth = 0;
        let inString = false;
        let stringChar = '';

        while (i < rootContent.length) {
            const char = rootContent[i];
            if ((char === '"' || char === "'") && !isEscaped(i)) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                else if (char === ';' && depth === 0) break;
            }

            i++;
        }

        const valueParsed = rootContent.substring(valueStart, i).trim();
        const valueIsSane = valueParsed.length > 0 && !/[\r\n\x00-\x1F]/.test(valueParsed);
        if (name && valueIsSane && isValidCssVariableName(`--${name}`)) {
            variables.set(name, valueParsed);
        }

        i++;
    }

    return variables;
}

function readCssVariablesFromFile(filePath: string): Map<string, string> {
    const previousCss = fs.readFileSync(filePath, 'utf-8');
    return extractCssVariables(previousCss);
}

function parseJsonWithOptionalRepair(fileContent: string, file: string): any {
    try {
        return JSON.parse(fileContent);
    } catch (error) {
        if (!ALLOW_JSON_REPAIR) throw error;

        const translationStart = fileContent.indexOf('"Translations"');
        if (translationStart > 0) {
            const firstBrace = fileContent.indexOf('{');
            const jsonContent = fileContent.substring(firstBrace, translationStart).trim().replace(/,\s*$/, '');
            const cleanedContent = jsonContent.endsWith('}') ? jsonContent : `${jsonContent}\n}`;
            try {
                return JSON.parse(cleanedContent);
            } catch {
                throw error;
            }
        }

        let cleaned = fileContent.trim();
        if (!cleaned.startsWith('{')) cleaned = `{${cleaned}`;
        if (!cleaned.endsWith('}')) cleaned = `${cleaned}}`;

        console.warn(`⚠️  JSON reparado en ${file}; revisa el export si es posible.`);
        try {
            return JSON.parse(cleaned);
        } catch {
            throw error;
        }
    }
}

function readAndCombineJsons(dir: string): Record<string, any> {
    const combined: Record<string, any> = {};

    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b));

    for (const file of files) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(dir, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                let json: any = parseJsonWithOptionalRepair(fileContent, file);

                if (isPlainObject(json) && 'Tokens' in json && isPlainObject((json as any).Tokens)) {
                    json = (json as any).Tokens;
                }

                if (isPlainObject(json)) {
                    delete (json as any)['$schema'];
                    delete (json as any)['Translations'];
                }

                const name = path.basename(file, '.json');
                combined[name] = json;
            } catch (err) {
                console.error(`❌ Error al leer/parsear ${file}:`, err);
            }
        }
    }

    return combined;
}

function flattenTokens(
    ctx: EmissionContext,
    obj: any,
    prefix: string[] = [],
    collectedVars: string[] = [],
    currentPath: string[] = []
): string[] {
    const { summary } = ctx;

    walkTokenTree(
        summary,
        obj,
        prefix,
        currentPath,
        {
            onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath }) => {
                summary.totalTokens++;
                const rawValue = (tokenObj as TokenValue).$value;
                const varType = (tokenObj as TokenValue).$type;

                if (rawValue === undefined) {
                    console.warn(`⚠️  Token sin $value en ${pathStr(tokenPath)}, se omite`);
                    return;
                }

                const visitedRefs = buildVisitedRefSet(tokenPath);
                const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
                if (resolvedValue === null) return;

                const varName = buildCssVarNameFromPrefix(tokenPrefix);
                emitCssVar(summary, collectedVars, varName, resolvedValue, tokenPath, true);
            },

            onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix }) => {
                summary.totalTokens++;

                const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
                const leafPath = [...parentPath, key];

                const visitedRefs = buildVisitedRefSet(leafPath);

                // ✅ (3) Remove unnecessary `as any`: processValue accepts primitives.
                const processedValue = processValue(ctx, value, undefined, leafPath, visitedRefs);
                if (processedValue === null) return;

                emitCssVar(summary, collectedVars, varName, processedValue, leafPath, false);
            }
        },
        0,
        false,
        true
    );

    return collectedVars;
}

function logChangeDetection(previousVariables: Map<string, string>, cssLines: string[]): void {
    console.log('\n----------------------------------------');
    console.log('            CAMBIOS DETECTADOS          ');
    console.log('----------------------------------------');

    const newVariables = new Map<string, string>();
    for (const line of cssLines) {
        const match = CSS_DECL_LINE_REGEX.exec(line);
        if (match && match[1] && match[2] !== undefined) {
            newVariables.set(match[1], match[2].trim());
        }
    }

    const removed: string[] = [];
    const added: string[] = [];
    const modified: Array<{ name: string; oldValue: string; newValue: string }> = [];

    previousVariables.forEach((_value, name) => {
        if (!newVariables.has(name)) removed.push(name);
    });

    newVariables.forEach((value, name) => {
        if (!previousVariables.has(name)) {
            added.push(name);
            return;
        }
        const oldValue = previousVariables.get(name);
        if (oldValue !== value) modified.push({ name, oldValue: oldValue || '', newValue: value });
    });

    if (removed.length > 0) {
        console.log(`   🗑️  Variables eliminadas: ${removed.length}`);
        removed.slice(0, 5).forEach(name => console.log(`      - --${name}`));
        if (removed.length > 5) console.log(`      ...`);
    }

    if (added.length > 0) {
        console.log(`   ➕ Variables añadidas: ${added.length}`);
        added.slice(0, 5).forEach(name => console.log(`      + --${name}`));
        if (added.length > 5) console.log(`      ...`);
    }

    if (modified.length > 0) {
        console.log(`   🔄 Variables modificadas: ${modified.length}`);
        modified.slice(0, 5).forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ --${name}`);
            console.log(`        - ${oldValue} -> ${newValue}`);
        });
        if (modified.length > 5) console.log(`      ...`);
    }

    if (removed.length === 0 && added.length === 0 && modified.length === 0) {
        console.log(`   ✓ Sin cambios significativos`);
    }
}

function printExecutionSummary(summary: ExecutionSummary): void {
    console.log('\n========================================');
    console.log('       RESUMEN DE EJECUCIÓN      ');
    console.log('========================================');
    console.log(`Total Tokens:        ${summary.totalTokens}`);
    console.log(`Generados:           ${summary.successCount}`);
    console.log(`Dependencias Circ.:  ${summary.circularDeps}`);
    console.log(`Colisiones CSS Var:  ${summary.cssVarNameCollisions}`);
    console.log(`Refs no resueltas:   ${summary.unresolvedRefs.length}`);
    console.log(`Nombres inválidos:   ${summary.invalidNames.length}`);
    console.log(`Límite profundidad:  ${summary.depthLimitHits}`);
    console.log('========================================');

    if (summary.unresolvedRefs.length > 0) {
        console.log('\n⚠️  Detalle de Referencias No Resueltas (Top 10):');
        summary.unresolvedRefs.slice(0, 10).forEach(ref => console.log(`  - ${ref}`));
        if (summary.unresolvedRefs.length > 10) console.log(`  ... y ${summary.unresolvedRefs.length - 10} más`);
    }

    if (summary.invalidNames.length > 0) {
        console.log('\n⚠️  Detalle de Nombres Inválidos (Top 10):');
        summary.invalidNames.slice(0, 10).forEach(name => console.log(`  - ${name}`));
        if (summary.invalidNames.length > 10) console.log(`  ... y ${summary.invalidNames.length - 10} más`);
    }

    if (summary.cssVarNameCollisionDetails.length > 0) {
        console.log('\n⚠️  Detalle de Colisiones CSS Var (Top 10):');
        summary.cssVarNameCollisionDetails.slice(0, 10).forEach(d => console.log(`  - ${d}`));
        if (summary.cssVarNameCollisionDetails.length > 10) {
            console.log(`  ... y ${summary.cssVarNameCollisionDetails.length - 10} más`);
        }
    }
}

function formatCssSectionHeader(label: string): string {
    const safe = String(label).replace(/\r\n|\r|\n/g, ' ').replace(/\*\//g, '*\\/').trim();
    return `  /* --- ${safe || 'Section'} --- */`;
}

async function main() {
    warnedAliasVarCollisions.clear();
    warnedDuplicateTokenIds.clear();
    warnedFindTokenByIdDepthLimit.clear();

    kebabCaseCache.clear();
    refCanonicalCache.clear();
    findTokenByIdCache.clear();

    const summary = createSummary();

    console.log('📖 Leyendo archivos JSON...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);

    const fileEntries = Object.entries(combinedTokens).map(([name, content]) => ({
        originalName: name,
        kebabName: toKebabCase(name),
        content
    }));

    console.log('🔄 Transformando a variables CSS...');
    const cssLines: string[] = [];
    const refMap = new Map<string, string>();
    const valueMap = new Map<string, TokenValue>();
    const collisionKeys = new Set<string>();
    const idToVarName = new Map<string, string>();
    const idToTokenKey = new Map<string, string>();

    const cssVarNameOwners = new Map<string, CssVarOwner>();
    const cssVarNameCollisionMap = new Map<string, CssVarCollision>();

    let previousVariables = new Map<string, string>();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            previousVariables = readCssVariablesFromFile(OUTPUT_FILE);
            console.log(`📄 Archivo CSS anterior encontrado con ${previousVariables.size} variables`);
        } catch {
            console.warn('⚠️  No se pudo leer el archivo CSS anterior (se creará uno nuevo)');
        }
    }

    const indexingCtx = createProcessingContext({
        summary,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        idToTokenKey,
        cssVarNameOwners,
        cssVarNameCollisionMap
    });

    for (const { originalName, kebabName, content } of fileEntries) {
        collectTokenMaps(indexingCtx, content, [kebabName], [originalName]);
    }

    const cycleStatus = buildCycleStatus(indexingCtx);

    const processingCtx = createProcessingContext({
        summary,
        tokensData: combinedTokens,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        idToTokenKey,
        cycleStatus,
        cssVarNameOwners,
        cssVarNameCollisionMap
    });

    for (const { originalName, kebabName, content } of fileEntries) {
        if (cssLines.length > 0) cssLines.push('');
        cssLines.push(formatCssSectionHeader(originalName));

        flattenTokens(processingCtx, content, [kebabName], cssLines, [originalName]);
    }

    console.log('📝 Escribiendo archivo CSS...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;

    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
        console.log(`\n✅ Archivo variables.css regenerado completamente`);
    } catch (err) {
        console.error(`❌ No se pudo escribir ${OUTPUT_FILE}:`, err);
        process.exit(1);
    }

    printExecutionSummary(summary);

    if (previousVariables.size > 0) {
        logChangeDetection(previousVariables, cssLines);
    }

    console.log(`\n📝 Archivo guardado en: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('❌ Error al generar variables CSS:');
    if (err instanceof Error) {
        console.error(`   ${err.message}`);
        if (err.stack) console.error(`   ${err.stack}`);
    } else {
        console.error(err);
    }
    process.exit(1);
});
