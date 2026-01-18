// NOTE: This file uses TypeScript syntax (types/interfaces). Run it via tsx/ts-node, or compile with tsc.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'output/variables.css');
const MAX_DEPTH = 50;
const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';

// --- W3C ref regexes (centralized) ---
// Keep separate instances (especially /g) to avoid lastIndex interference across calls.
const W3C_REF_REGEX_REPLACE = /\{([A-Za-z0-9_./\s-]+)\}/g; // global: used by String.replace()
const W3C_REF_REGEX_COLLECT = /\{([A-Za-z0-9_./\s-]+)\}/g; // global: used to collect all occurrences

// --- CSS var name validation regexes (precompiled) ---
// ✅ Perf: avoid per-call regex allocations in hot paths.
const STARTS_WITH_DIGIT_REGEX = /^\d/;
const CSS_VAR_NAME_AFTER_DASHES_REGEX = /^[a-zA-Z0-9_-]+$/;

// ✅ Perf (#5): precompile once; used in logChangeDetection()
// ✅ Fix (Pega #1): robust for values containing ";" AND tolerant of trailing /* comments */.
// - Captures value greedily up to the declaration ";" (last ";" that still allows optional trailing comment).
// - Avoids false negatives if a comment is present after the declaration.
// Assumption: cssLines are single-line declarations: "  --name: <value>;" (optionally with trailing "/* ... */")
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

    // ✅ NEW: CSS var namespace collision diagnostics (different tokens -> same "--var-name")
    cssVarNameCollisions: number; // number of distinct CSS var names that collide
    cssVarNameCollisionDetails: string[]; // top-N details
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

// ✅ NEW: collision bookkeeping types
type CssVarOwner = { tokenKey: string; tokenPath: string; id?: string };
type CssVarCollision = { first: CssVarOwner; others: Map<string, CssVarOwner> };
const MAX_COLLISION_DETAILS = 10;
const warnedAliasVarCollisions = new Set<string>();

// ✅ NEW: warn-once guard for duplicate $id mappings (avoids log spam).
const warnedDuplicateTokenIds = new Set<string>();

// ✅ NEW: warn-once guard for depth-limit aborts in findTokenById (avoids log spam).
const warnedFindTokenByIdDepthLimit = new Set<string>();

/**
 * Context types per phase (type-only improvement; runtime unchanged).
 */
type BaseContext = Readonly<{
    summary: ExecutionSummary;

    // ✅ NEW: var-name namespace collision tracking
    cssVarNameOwners?: Map<string, CssVarOwner>; // --var -> first owner
    cssVarNameCollisionMap?: Map<string, CssVarCollision>; // --var -> collision details
}>;

type IndexingContext = BaseContext &
    Readonly<{
        refMap: Map<string, string>;
        valueMap: Map<string, TokenValue>;
        collisionKeys: Set<string>;
        idToVarName: Map<string, string>;
        idToTokenKey: Map<string, string>; // $id -> normalized token key (for cycle graph)
    }>;

type EmissionContext = IndexingContext &
    Readonly<{
        tokensData: Record<string, any>;
        cycleStatus: Map<string, boolean>;
    }>;

type ProcessingContext = IndexingContext | EmissionContext;

function createProcessingContext<T extends ProcessingContext>(args: T): Readonly<T> {
    // Shallow-freeze: prevents reassigning ctx properties (e.g. ctx.refMap = ...),
    // but does NOT make nested Maps/Sets immutable (their contents can still change).
    return Object.freeze({ ...args });
}

// --- Helper Functions ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVariableAlias(value: unknown): value is VariableAliasObject {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
}

/**
 * Conservative mode-key detection to avoid false positives like "model" / "modeled".
 *
 * A key is considered a "mode key" if:
 * - it equals "mode" (any casing), OR
 * - it equals "modeDefault" (any casing), OR
 * - it starts with "mode" and the next char is:
 *   - uppercase (camelCase: modeDark)
 *   - digit (mode1)
 *   - '_' or '-' (mode_dark, mode-dark)
 */
function isModeKey(key: string): boolean {
    if (!key) return false;
    if (!/^mode/i.test(key)) return false;

    const tail = key.slice(4); // content after "mode"
    if (!tail) return true;

    if (tail.toLowerCase() === 'default') return true;

    const first = tail[0];
    return /[A-Z0-9_-]/.test(first);
}

function shouldSkipKey(key: string): boolean {
    // Skip metadata keys ($...) and mode branches; the chosen mode branch is traversed separately.
    return key.startsWith('$') || isModeKey(key);
}

function pickModeKey(keys: string[]): string | undefined {
    // Prefer "modeDefault" (any casing) for deterministic output; otherwise pick the first mode* key.
    return keys.find(k => k.toLowerCase() === 'modedefault') ?? keys.find(isModeKey);
}

// ✅ Perf: deterministic min selection matching default `.sort()` order (UTF-16 code unit order)
function compareByCodeUnit(a: string, b: string): number {
    return a > b ? 1 : a < b ? -1 : 0;
}

/**
 * Deterministic mode-key selection WITHOUT relying on the array order.
 * This preserves the same choice you'd get from `Object.keys(obj).sort()` + pickModeKey(sortedKeys),
 * while allowing us to skip sorting the full keys list in indexing hot paths.
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

// ✅ cache for toKebabCase (hot path). Cleared per run in main() to avoid growth across executions.
const kebabCaseCache = new Map<string, string>();

function toKebabCase(name: string): string {
    // Fast memoized path (use `.get()` so empty-string results are cached correctly).
    const cached = kebabCaseCache.get(name);
    if (cached !== undefined) {
        return cached;
    }

    // Normalize common separators and camelCase into kebab-case (used for CSS variable names).
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
    // CSS custom properties must start with "--" and cannot start with a digit after the dashes.
    if (!name.startsWith('--')) {
        return false;
    }
    const afterDashes = name.slice(2);
    if (!afterDashes || STARTS_WITH_DIGIT_REGEX.test(afterDashes)) {
        return false;
    }
    return CSS_VAR_NAME_AFTER_DASHES_REGEX.test(afterDashes);
}

function pathStr(currentPath: string[]): string {
    // Human-readable path for logs (keeps original key casing).
    return currentPath.join('.');
}

/**
 * ✅ Perf (#1): micro-opt in hot path.
 * Same behavior as: `--${prefix.filter(Boolean).join('-')}`
 *
 * ✅ Perf/Fine-tuning (#2): use an indexed loop to avoid iterator overhead in very hot paths.
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

function checkDepthLimit(summary: ExecutionSummary, depth: number, currentPath: string[]): boolean {
    // Hard safety guard against unexpectedly deep or cyclic JSON structures.
    if (depth <= MAX_DEPTH) {
        return false;
    }
    console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${pathStr(currentPath)}; truncating traversal.`);
    summary.depthLimitHits++;
    return true;
}

function recordUnresolved(summary: ExecutionSummary, currentPath: string[], reason: string): void {
    // Legacy formatter: callers include punctuation in `reason` (e.g. " (Empty ref)").
    // Prefer recordUnresolvedTyped() to keep formatting consistent.
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

/**
 * Adds an unresolved entry in a consistent format: "path (Label: detail)".
 */
function recordUnresolvedTyped(summary: ExecutionSummary, currentPath: string[], label: string, detail: string): void {
    recordUnresolved(summary, currentPath, ` (${label}: ${detail})`);
}

function emitCssVar(
    summary: ExecutionSummary,
    collectedVars: string[],
    varName: string,
    value: string,
    currentPath: string[],
    recordInvalidName: boolean
): void {
    // Centralized guard to avoid emitting invalid custom property names.
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

// ✅ track collisions in the CSS custom property namespace (different tokens -> same --var)
function trackCssVarNameCollision(ctx: BaseContext, varName: string, owner: CssVarOwner): void {
    const { summary, cssVarNameOwners, cssVarNameCollisionMap } = ctx;
    if (!cssVarNameOwners || !cssVarNameCollisionMap) return;
    if (!varName) return;

    const existing = cssVarNameOwners.get(varName);
    if (!existing) {
        cssVarNameOwners.set(varName, owner);
        return;
    }

    // Same token identity (common for mode overrides) => not a collision.
    if (existing.tokenKey === owner.tokenKey) {
        return;
    }

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

    // Track additional colliders (keyed by tokenKey for stability).
    entry.others.set(owner.tokenKey || owner.tokenPath, owner);
}

/**
 * Normalizes dotted paths:
 * - collapses repeated dots ("a...b" -> "a.b")
 * - trims leading/trailing dots (".a.b." -> "a.b")
 */
function normalizeDots(pathKey: string): string {
    return pathKey.replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

function buildPathKey(segments: string[]): string {
    /**
     * Builds the canonical dotted token key used for indexing and resolution.
     * Mode segments are excluded so tokens keep a stable identity across modes.
     */
    const dotted = segments
        .filter(segment => segment && !isModeKey(segment))
        .join('.')
        .replace(/[\\/]+/g, '.')
        .replace(/\s+/g, '.');

    return normalizeDots(dotted);
}

/**
 * Case-insensitive normalization for lookups (we still preserve separators).
 */
function normalizePathKey(pathKey: string): string {
    return pathKey.toLowerCase();
}

// ✅ Memoize canonicalization of ref payloads (common refs repeat heavily in design systems).
// ✅ Cleared per run in main() to avoid growth across multiple executions in the same process (tests/hot-reload).
const refCanonicalCache = new Map<string, string>();

/**
 * Canonicalizes a "{...}" reference payload into a dotted path.
 * Intended for parsing values found inside W3C references.
 */
function canonicalizeRefPath(pathKey: string): string {
    // Use `.has()` so empty-string results are cached correctly.
    if (refCanonicalCache.has(pathKey)) {
        return refCanonicalCache.get(pathKey)!;
    }

    const dotted = pathKey.trim().replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
    const result = normalizeDots(dotted);

    refCanonicalCache.set(pathKey, result);
    return result;
}

// ✅ Shared empty visited set for cycle detection seeds.
// NOTE: treat as ReadonlySet; never mutate it.
const EMPTY_VISITED_REFS: ReadonlySet<string> = new Set<string>();

/**
 * Seeds a visited set for cycle detection using the same canonicalization rules as indexing/resolution.
 *
 * ✅ Simplified (safe in this version): store only normalized keys.
 * All indexed keys in refMap/valueMap are normalized (lowercased), and getResolvedTokenKey
 * resolves to normalized keys in this script.
 */
function buildVisitedRefSet(currentPath: string[]): ReadonlySet<string> {
    const normalized = normalizePathKey(buildPathKey(currentPath));
    return normalized ? new Set([normalized]) : EMPTY_VISITED_REFS;
}

/**
 * Indexes Figma "$id" into both:
 * - idToVarName: $id -> CSS var name (for VARIABLE_ALIAS resolution)
 * - idToTokenKey: $id -> normalized token key (for cycle graph + alias deps)
 *
 * ✅ Fixed: canonicalize IDs with trim(), while keeping backwards compatibility by
 * also storing the raw id when it differs (whitespace edge-cases).
 *
 * ✅ Added: warn-once when the same canonical $id maps to different tokens (helps diagnose bad exports).
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

    // Warn if the canonical ID already exists but points elsewhere.
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

    // Canonical key: trimmed
    idToVarName.set(trimmed, varName);
    if (normalizedTokenKey) {
        idToTokenKey.set(trimmed, normalizedTokenKey);
    }

    // Backward compatibility: also store raw when it differs (e.g., whitespace in export)
    if (idRaw !== trimmed) {
        idToVarName.set(idRaw, varName);
        if (normalizedTokenKey) {
            idToTokenKey.set(idRaw, normalizedTokenKey);
        }
    }
}

/**
 * Resolves a reference path to a key present in the index using:
 * 1) exact canonical key, then 2) case-insensitive normalized key,
 * while failing fast on normalized collisions (ambiguous local refs).
 */
function getResolvedTokenKey(ref: string, ctx: IndexingContext): string | null {
    const canonical = canonicalizeRefPath(ref);
    const normalized = normalizePathKey(canonical);

    const hasKey = (key: string): boolean => {
        return ctx.valueMap.has(key) || ctx.refMap.has(key);
    };

    // Ambiguous local keys (e.g., "{bg}") must not resolve silently.
    if (ctx.collisionKeys.has(normalized)) return null;

    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;
    return null;
}

/**
 * ✅ New helper: resolves using precomputed canonical/normalized strings
 * (avoids repeated canonicalizeRefPath() work).
 */
function getResolvedTokenKeyFromParts(canonical: string, normalized: string, ctx: IndexingContext): string | null {
    const hasKey = (key: string): boolean => {
        return ctx.valueMap.has(key) || ctx.refMap.has(key);
    };

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
 * Token tree walker with stable output:
 * - Traverses plain objects with sorted keys for deterministic results (when sortKeys=true).
 * - Can skip sorting (sortKeys=false) for indexing performance while preserving deterministic mode selection.
 * - Skips $-metadata and mode branches; then traverses exactly one chosen mode branch.
 * - Treats objects containing "$value" as W3C token leaves.
 * - Treats primitive leaves (string/number/boolean without "$value") as legacy tokens.
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
    if (checkDepthLimit(summary, depth, currentPath)) {
        return;
    }

    if (obj && typeof obj === 'object' && '$value' in obj) {
        handlers.onTokenValue?.({ obj, prefix, currentPath, depth, inModeBranch });
        return;
    }

    if (!isPlainObject(obj)) {
        return;
    }

    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    // Preserve the same mode selection you'd get from sorted keys, even when we don't sort the full list.
    const modeKey = sortKeys ? pickModeKey(keys) : pickModeKeyDeterministic(keys);

    for (const key of keys) {
        if (shouldSkipKey(key)) continue;

        const value = (obj as Record<string, any>)[key];
        const normalizedKey = toKebabCase(key);

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            handlers.onLegacyPrimitive?.({
                value,
                key,
                normalizedKey,
                prefix,
                currentPath,
                depth,
                inModeBranch
            });
            continue;
        }

        walkTokenTree(summary, value, [...prefix, normalizedKey], [...currentPath, key], handlers, depth + 1, inModeBranch, sortKeys);
    }

    if (modeKey) {
        /**
         * Traverse the chosen mode branch after normal keys for deterministic ordering (when sorted).
         * Everything under the selected mode is flagged as `inModeBranch` so indexers can treat
         * it as an override of the base token value.
         */
        walkTokenTree(summary, (obj as Record<string, any>)[modeKey], prefix, [...currentPath, modeKey], handlers, depth + 1, true, sortKeys);
    }
}

/**
 * Collects all references from an arbitrary value:
 * - W3C "{...}" references found inside strings
 * - VARIABLE_ALIAS references (via $id -> tokenKey mapping) when available
 *
 * ✅ Perf (#4):
 * - store only canonical refs (avoid duplicated canonical+normalized edges)
 * - use regex.exec loop instead of match() to avoid allocating arrays of matches
 *
 * ✅ Fix (Pega #2): reset lastIndex defensively at function entry (safe across refactors).
 */
function collectRefsFromValue(value: unknown, refs: Set<string>, idToTokenKey?: Map<string, string>): void {
    // IMPORTANT: /g regexes have state; reset at entry for defensive correctness.
    W3C_REF_REGEX_COLLECT.lastIndex = 0;

    // ✅ VARIABLE_ALIAS as an explicit dependency edge in the cycle graph.
    if (isVariableAlias(value)) {
        const id = value.id?.trim();
        if (id && idToTokenKey) {
            const targetKey = idToTokenKey.get(id);
            if (targetKey) {
                // targetKey is already a normalized token key in this script
                refs.add(targetKey);
            }
        }
        return;
    }

    if (typeof value === 'string') {
        let m: RegExpExecArray | null;
        while ((m = W3C_REF_REGEX_COLLECT.exec(value)) !== null) {
            const tokenPath = (m[1] ?? '').trim();
            if (!tokenPath) continue;

            const canonical = canonicalizeRefPath(tokenPath);
            refs.add(canonical);
        }
    } else if (Array.isArray(value)) {
        for (const item of value) {
            collectRefsFromValue(item, refs, idToTokenKey);
        }
    } else if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
            // Ignore metadata fields to reduce noise in dependency graphs.
            if (!key.startsWith('$')) {
                collectRefsFromValue((value as Record<string, unknown>)[key], refs, idToTokenKey);
            }
        }
    }
}

/**
 * Precomputes whether each resolvable token key can reach a cycle via:
 * - W3C "{...}" references
 * - VARIABLE_ALIAS (ID-based) references when idToTokenKey is available
 */
function buildCycleStatus(ctx: IndexingContext): Map<string, boolean> {
    const refsByToken = new Map<string, Set<string>>();

    // Extract refs once per token key.
    for (const [key, token] of ctx.valueMap.entries()) {
        const refs = new Set<string>();
        collectRefsFromValue(token.$value, refs, ctx.idToTokenKey);
        refsByToken.set(key, refs);
    }

    const color = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
    const leadsToCycle = new Map<string, boolean>();

    const dfs = (node: string): boolean => {
        const state = color.get(node) ?? 0;
        if (state === 1) return true; // back-edge => cycle
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
        if (!color.has(key)) {
            dfs(key);
        }
    }

    return leadsToCycle;
}

/**
 * Slow fallback to resolve a VARIABLE_ALIAS by scanning the full token tree for a matching "$id".
 * Only used when the O(1) "$id" index misses (e.g., partial exports).
 *
 * ✅ Fixed: tolerate whitespace differences by comparing both raw and trimmed IDs.
 * ✅ Safety: depth guard to prevent stack overflow on absurdly deep/malicious JSON shapes.
 * ✅ Fix (Pega #2): use for...in to avoid allocating Object.keys arrays at every recursion level.
 * ✅ Fix (Pega #3): log a warn-once when aborting due to depth limit (helps debugging).
 */
function findTokenById(
    tokensData: Record<string, any>,
    targetId: string,
    currentPath: string[] = [],
    depth = 0
): string[] | null {
    if (!isPlainObject(tokensData)) {
        return null;
    }

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
            if (key === '$id' && matchesId(keyValue)) {
                return currentPath;
            }
            continue;
        }

        const value = (tokensData as any)[key];

        // Only recurse into plain objects; arrays are ignored intentionally (token trees are objects).
        if (isPlainObject(value)) {
            const newPath = [...currentPath, key];

            if ('$id' in value && matchesId((value as any).$id)) {
                return newPath;
            }

            const found = findTokenById(value as Record<string, any>, target, newPath, depth + 1);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

// ✅ Perf (#3): cache findTokenById results (including misses) per run
const findTokenByIdCache = new Map<string, string[] | null>();

function findTokenByIdCached(tokensData: Record<string, any>, targetId: string): string[] | null {
    const key = typeof targetId === 'string' ? targetId.trim() : '';
    if (!key) return null;

    if (findTokenByIdCache.has(key)) {
        return findTokenByIdCache.get(key)!;
    }

    const found = findTokenById(tokensData, key);
    findTokenByIdCache.set(key, found);
    return found;
}

function processVariableAlias(ctx: EmissionContext, aliasObj: unknown, currentPath: string[], visitedRefs?: ReadonlySet<string>): string {
    if (isVariableAlias(aliasObj)) {
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
                console.warn(
                    `⚠️  Deep circular dependency reachable via VARIABLE_ALIAS (id=${aliasId}) at ${pathStr(currentPath)}`
                );
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

            // ✅ Perf (#3): cached O(N) scan fallback (including caching misses)
            const tokenPath = findTokenByIdCached(tokensData, aliasId);
            if (tokenPath) {
                const cssPath = tokenPath.map(toKebabCase).join('-');
                const derived = `--${cssPath}`;
                warnIfCollidingVarName(derived);
                return `var(${derived})`;
            }

            console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${pathStr(currentPath)} con ID: ${aliasId}`);
            console.warn(
                `   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`
            );
            console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);

            const placeholderName = toSafePlaceholderName(aliasId);
            recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasId);
            return `var(--unresolved-${placeholderName})`;
        }

        return `var(--${currentPath.map(toKebabCase).join('-')})`;
    }

    return JSON.stringify(aliasObj);
}

/**
 * Formats a shadow token into CSS box-shadow syntax.
 */
function processShadow(ctx: EmissionContext, shadowObj: unknown, currentPath: string[], visitedRefs: ReadonlySet<string>): string {
    if (!isPlainObject(shadowObj)) {
        return JSON.stringify(shadowObj);
    }

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
        if (rawColor == null) {
            return 'rgba(0, 0, 0, 1)';
        }

        if (isVariableAlias(rawColor)) {
            return processVariableAlias(ctx, rawColor, colorPath, visitedRefs);
        }

        if (typeof rawColor === 'string') {
            // ✅ Fix: no cloning needed; visitedRefs is treated as immutable during recursion.
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

    if (type === 'INNER_SHADOW') {
        return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
    }
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
}

/**
 * Produces var(--broken-ref-...) or returns the original match if invalid (and records invalidNames).
 */
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

        if (isCollision) {
            recordUnresolvedTyped(summary, currentPath, 'Collision', tokenPath);
        } else {
            recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);
        }

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
    if (mappedVarName) {
        return `var(${mappedVarName})`;
    }

    console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(currentPath)} (resolved key missing in refMap)`);
    recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

    return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
}

/**
 * Escapes a raw JS string into a valid CSS double-quoted string literal.
 * (Keeps escaping minimal to avoid altering intentional CSS escapes.)
 */
function quoteCssStringLiteral(value: string): string {
    const escapedValue = value.replace(/"/g, '\\"');
    return `"${escapedValue}"`;
}

/**
 * ✅ Fix (Pega #1): For $type === "string" with W3C refs, emit a valid CSS token sequence:
 *   "text " var(--ref) " more"
 *
 * This avoids emitting unquoted bare identifiers (invalid CSS) and preserves the only
 * CSS-native composition model available (token lists, not string interpolation).
 */
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
        if (before) {
            parts.push(quoteCssStringLiteral(before));
        }

        const wholeMatch = m[0];
        const tokenPath = (m[1] ?? '').trim();
        const resolved = resolveReference(ctx, wholeMatch, tokenPath, raw, currentPath, visitedRefs, seenInValue);

        // If we couldn't safely resolve (rare fallback returning the original match),
        // keep it as plain text to guarantee valid CSS output.
        parts.push(resolved === wholeMatch ? quoteCssStringLiteral(wholeMatch) : resolved);

        last = end;
    }

    const tail = raw.slice(last);
    if (tail) {
        parts.push(quoteCssStringLiteral(tail));
    }

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

    if (value === null || value === undefined) {
        return 'null';
    }

    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            // ✅ Fix: no cloning needed; visitedRefs is treated as immutable during recursion.
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
            // ✅ Fix: no cloning needed; visitedRefs is treated as immutable during recursion.
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
        if (value.startsWith('rgba') || value.startsWith('rgb(')) {
            return value;
        }
        if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) {
            return value;
        }

        // ✅ Fix (Pega #1): string tokens must remain valid CSS even when refs exist.
        if (varType === 'string') {
            W3C_REF_REGEX_REPLACE.lastIndex = 0;
            const hasRef = W3C_REF_REGEX_REPLACE.exec(value) !== null;
            W3C_REF_REGEX_REPLACE.lastIndex = 0;

            if (!hasRef) {
                return quoteCssStringLiteral(value);
            }

            return buildCssStringTokenSequence(ctx, value, currentPath, visitedRefs);
        }

        // ✅ Perf: single-pass ref handling via replace() + flag (avoids separate .test()).
        const seenInValue = new Set<string>();
        let hadRef = false;
        W3C_REF_REGEX_REPLACE.lastIndex = 0;

        const replaced = value.replace(W3C_REF_REGEX_REPLACE, (m, tp) => {
            hadRef = true;
            return resolveReference(ctx, m, tp, value, currentPath, visitedRefs, seenInValue);
        });

        if (!hadRef) {
            return value;
        }

        return replaced;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

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

        if (allowOverride) {
            valueMap.set(key, tokenObj);
        } else {
            console.warn(`ℹ️  Duplicate token for normalized key ${key}${debugLabel ? ` (${debugLabel})` : ''}`);
        }
    };

    // ✅ Perf: indexing does NOT need sorted traversal order.
    walkTokenTree(
        summary,
        obj,
        prefix,
        currentPath,
        {
            onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inModeBranch }) => {
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

                const legacyTokenObj: TokenValue = { $value: value as any };

                trackCssVarNameCollision(ctx, varName, {
                    tokenKey: normalizedPathKey,
                    tokenPath: pathStr(leafPath)
                });

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
        false // <-- sortKeys disabled for indexing
    );
}

function extractCssVariables(cssContent: string): Map<string, string> {
    const variables = new Map<string, string>();
    const rootStart = cssContent.indexOf(':root');
    if (rootStart === -1) {
        return variables;
    }

    const braceStart = cssContent.indexOf('{', rootStart);
    if (braceStart === -1) {
        return variables;
    }

    let braceCount = 0;
    let braceEnd = braceStart;
    for (let i = braceStart; i < cssContent.length; i++) {
        if (cssContent[i] === '{') {
            braceCount++;
        } else if (cssContent[i] === '}') {
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
        if (!rootMatch) {
            return variables;
        }
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
        while (i < rootContent.length && /\s/.test(rootContent[i])) {
            i++;
        }

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
        while (i < rootContent.length && /\s/.test(rootContent[i])) {
            i++;
        }
        if (i >= rootContent.length || rootContent[i] !== ':') {
            continue;
        }
        i++;

        while (i < rootContent.length && /\s/.test(rootContent[i])) {
            i++;
        }

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
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                } else if (char === ';' && depth === 0) {
                    break;
                }
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
        if (!ALLOW_JSON_REPAIR) {
            throw error;
        }

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
                const processedValue = processValue(ctx, value as any, undefined, leafPath, visitedRefs);
                if (processedValue === null) return;

                emitCssVar(summary, collectedVars, varName, processedValue, leafPath, false);
            }
        },
        0,
        false,
        true // <-- sortKeys enabled for stable CSS output
    );

    return collectedVars;
}

function logChangeDetection(previousVariables: Map<string, string>, cssLines: string[]): void {
    console.log('\n----------------------------------------');
    console.log('            CAMBIOS DETECTADOS          ');
    console.log('----------------------------------------');

    const newVariables = new Map<string, string>();
    for (const line of cssLines) {
        // ✅ Perf: reuse a precompiled regex object (avoid per-iteration literal allocation)
        const match = CSS_DECL_LINE_REGEX.exec(line);
        if (match && match[1] && match[2] !== undefined) {
            newVariables.set(match[1], match[2].trim());
        }
    }

    const removed: string[] = [];
    const added: string[] = [];
    const modified: Array<{ name: string; oldValue: string; newValue: string }> = [];

    previousVariables.forEach((value, name) => {
        if (!newVariables.has(name)) {
            removed.push(name);
        }
    });

    newVariables.forEach((value, name) => {
        if (!previousVariables.has(name)) {
            added.push(name);
        } else {
            const oldValue = previousVariables.get(name);
            if (oldValue !== value) {
                modified.push({ name, oldValue: oldValue || '', newValue: value });
            }
        }
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

// --- Main Execution ---

async function main() {
    warnedAliasVarCollisions.clear();
    warnedDuplicateTokenIds.clear();
    warnedFindTokenByIdDepthLimit.clear();

    // ✅ Clear memoization caches between runs (keeps benefits within a run, avoids unbounded growth across runs).
    kebabCaseCache.clear();
    refCanonicalCache.clear();
    findTokenByIdCache.clear(); // ✅ Perf (#3): clear per run

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
        if (err.stack) {
            console.error(`   ${err.stack}`);
        }
    } else {
        console.error(err);
    }
    process.exit(1);
});
