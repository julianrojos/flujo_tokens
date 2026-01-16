import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'output/variables.css');
const MAX_DEPTH = 50;
const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';

// --- Regex (centralized) ---
// Keep separate instances (especially /g) to avoid lastIndex interference across nested calls.
const W3C_REF_REGEX_DETECT = /\{([A-Za-z0-9_./\s-]+)\}/; // non-global: safe for test()
const W3C_REF_REGEX_REPLACE = /\{([A-Za-z0-9_./\s-]+)\}/g; // global: used by String.replace()
const W3C_REF_REGEX_COLLECT = /\{([A-Za-z0-9_./\s-]+)\}/g; // global: used to collect all occurrences

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

interface ShadowObject {
    type?: 'DROP_SHADOW' | 'INNER_SHADOW';
    /**
     * In practice (Figma + DTCG), shadow.color may be either:
     * - RGBA channels {r,g,b,a}
     * - VARIABLE_ALIAS object
     * - (sometimes) a string (e.g., "{color.token}" or "rgba(...)")
     */
    color?:
    | {
        r: number;
        g: number;
        b: number;
        a?: number;
    }
    | VariableAliasObject
    | string
    | null;
    offset?:
    | {
        x: number;
        y: number;
    }
    | null;
    radius?: number | null;
    spread?: number | null;
}

interface ExecutionSummary {
    totalTokens: number;
    successCount: number;
    unresolvedRefs: string[];
    invalidNames: string[];
    circularDeps: number;
    depthLimitHits: number;
}

function createSummary(): ExecutionSummary {
    return {
        totalTokens: 0,
        successCount: 0,
        unresolvedRefs: [],
        invalidNames: [],
        circularDeps: 0,
        depthLimitHits: 0
    };
}

type ProcessingContext = Readonly<{
    summary: ExecutionSummary;
    tokensData?: Record<string, any>;
    refMap?: Map<string, string>;
    valueMap?: Map<string, TokenValue>;
    collisionKeys?: Set<string>;
    idToVarName?: Map<string, string>;
    cycleStatus?: Map<string, boolean>;
}>;

function createProcessingContext(args: {
    summary: ExecutionSummary;
    tokensData?: Record<string, any>;
    refMap?: Map<string, string>;
    valueMap?: Map<string, TokenValue>;
    collisionKeys?: Set<string>;
    idToVarName?: Map<string, string>;
    cycleStatus?: Map<string, boolean>;
}): ProcessingContext {
    // Freeze to prevent accidental mutation of the shared context object.
    return Object.freeze({ ...args });
}

// --- Helper Functions ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVariableAlias(value: unknown): value is VariableAliasObject {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
}

function isModeKey(key: string): boolean {
    return key.toLowerCase().startsWith('mode');
}

function shouldSkipKey(key: string): boolean {
    // Skip metadata keys ($...) and mode branches; the chosen mode is handled separately.
    return key.startsWith('$') || isModeKey(key);
}

function pickModeKey(keys: string[]): string | undefined {
    // Prefer modeDefault for deterministic output; otherwise use the first mode* key.
    return keys.find(k => k === 'modeDefault') ?? keys.find(isModeKey);
}

function toSafePlaceholderName(id: string): string {
    const placeholderName = id
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return placeholderName || 'unknown';
}

function toKebabCase(name: string): string {
    let result = name.replace(/-/g, ' ');
    result = result.replace(/[\\/]+/g, ' ');
    result = result.replace(/([a-z])([A-Z])/g, '$1-$2');
    result = result.toLowerCase();
    result = result.replace(/[\s-]+/g, '-');
    result = result.replace(/^-+|-+$/g, '');
    return result;
}

function isValidCssVariableName(name: string): boolean {
    if (!name.startsWith('--')) {
        return false;
    }
    const afterDashes = name.slice(2);
    if (!afterDashes || /^\d/.test(afterDashes)) {
        return false;
    }
    return /^[a-zA-Z0-9_-]+$/.test(afterDashes);
}

function pathStr(currentPath: string[]): string {
    return currentPath.join('.');
}

function buildCssVarNameFromPrefix(prefix: string[]): string {
    return `--${prefix.filter(p => p).join('-')}`;
}

function checkDepthLimit(summary: ExecutionSummary, depth: number, currentPath: string[]): boolean {
    if (depth <= MAX_DEPTH) {
        return false;
    }
    console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${pathStr(currentPath)}; truncating traversal.`);
    summary.depthLimitHits++;
    return true;
}

function recordUnresolved(summary: ExecutionSummary, currentPath: string[], reason: string): void {
    // Legacy formatter: callers must include leading space/parens in `reason` (e.g. " (Empty ref)").
    // Prefer recordUnresolvedTyped() for new call sites to keep formatting consistent.
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

/**
 * Typed helper that preserves the unresolvedRefs output format:
 *   "path (Label: detail)"
 * This keeps logs consistent without forcing callers to hand-format punctuation.
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

function buildPathKey(segments: string[]): string {
    // Build a dotted key, excluding mode segments to avoid treating modes as part of identity.
    return segments
        .filter(segment => segment && !isModeKey(segment))
        .join('.')
        .replace(/[\\/]+/g, '.')
        .replace(/\s+/g, '.');
}

/**
 * Lowercase-only normalization used for case-insensitive lookups.
 * Delimiters are preserved to avoid collapsing distinct paths.
 */
function normalizePathKey(pathKey: string): string {
    return pathKey.toLowerCase();
}

/**
 * Canonicalize a reference path by normalizing separators and whitespace to dots.
 * Intended for values found inside "{...}" references.
 */
function canonicalizeRefPath(pathKey: string): string {
    return pathKey.trim().replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
}

/**
 * Initializes a visited set with both exact and normalized forms for robust cycle detection
 * regardless of casing or minor formatting differences.
 */
function buildVisitedRefSet(pathSegments: string[]): Set<string> {
    const exactPath = pathSegments.join('.');
    const normalizedPath = normalizePathKey(exactPath);
    const visited = new Set<string>();
    if (exactPath) visited.add(exactPath);
    if (normalizedPath && normalizedPath !== exactPath) visited.add(normalizedPath);
    return visited;
}

function indexTokenIdToVarName(tokenObj: any, varName: string, idToVarName: Map<string, string>): void {
    // Index Figma $id -> CSS var name for fast VARIABLE_ALIAS resolution.
    const id = tokenObj?.$id;
    if (typeof id === 'string' && id.trim()) {
        idToVarName.set(id, varName);
    }
}

/**
 * Central resolver for "exact -> normalized" token key lookup.
 * Prefer exact matches; only fall back to normalized keys when there is no known collision.
 */
function getResolvedTokenKey(ref: string, ctx: ProcessingContext): string | null {
    const canonical = canonicalizeRefPath(ref);
    const normalized = normalizePathKey(canonical);

    const hasKey = (key: string): boolean => {
        // Defensive: some contexts may omit one of these maps.
        if (ctx.valueMap?.has(key)) return true;
        if (ctx.refMap?.has(key)) return true;
        return false;
    };

    if (hasKey(canonical)) return canonical;
    if (ctx.collisionKeys?.has(normalized)) return null;
    if (hasKey(normalized)) return normalized;
    return null;
}

type WalkPrimitive = string | number | boolean;

type WalkHandlers = {
    onTokenValue?: (ctx: {
        obj: any;
        prefix: string[];
        currentPath: string[];
        depth: number;
        inModeBranch: boolean;
    }) => void;
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
 * Universal walker for token trees.
 * - Traverses plain objects in sorted key order for stable output.
 * - Skips $-metadata and mode branches; then traverses the selected mode branch once.
 * - Treats any object containing "$value" as a W3C token leaf and dispatches to onTokenValue.
 * - Legacy primitives (string/number/boolean leaves without $value) are dispatched via onLegacyPrimitive.
 */
function walkTokenTree(
    summary: ExecutionSummary,
    obj: any,
    prefix: string[],
    currentPath: string[],
    handlers: WalkHandlers,
    depth = 0,
    inModeBranch = false
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

    const keys = Object.keys(obj).sort();
    const modeKey = pickModeKey(keys);

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

        walkTokenTree(summary, value, [...prefix, normalizedKey], [...currentPath, key], handlers, depth + 1, inModeBranch);
    }

    if (modeKey) {
        // Traverse the chosen mode branch after normal keys for deterministic ordering.
        // Everything under the chosen mode branch is treated as "mode override" for indexing purposes.
        walkTokenTree(
            summary,
            (obj as Record<string, any>)[modeKey],
            prefix,
            [...currentPath, modeKey],
            handlers,
            depth + 1,
            true
        );
    }
}

/**
 * Collects all W3C references ({path.to.token}) found within a value.
 * For each reference, both canonical and normalized keys are recorded to support case-insensitive resolution.
 */
function collectRefsFromValue(value: unknown, refs: Set<string>): void {
    if (typeof value === 'string') {
        W3C_REF_REGEX_COLLECT.lastIndex = 0;
        const matches = value.match(W3C_REF_REGEX_COLLECT);
        if (matches) {
            matches.forEach(match => {
                const tokenPath = match.slice(1, -1).trim();
                if (tokenPath) {
                    const canonical = canonicalizeRefPath(tokenPath);
                    refs.add(canonical);
                    refs.add(normalizePathKey(canonical));
                }
            });
        }
    } else if (Array.isArray(value)) {
        for (const item of value) {
            collectRefsFromValue(item, refs);
        }
    } else if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
            // Ignore metadata fields to reduce noise.
            if (!key.startsWith('$')) {
                collectRefsFromValue((value as Record<string, unknown>)[key], refs);
            }
        }
    }
}

/**
 * Fallback deep cycle check (DFS) used when cycleStatus is not available.
 * Note: this can be expensive for large graphs, hence the cycleStatus cache.
 */
function hasCircularDependency(
    startPath: string,
    valueMap?: Map<string, TokenValue>,
    visited: Set<string> = new Set()
): boolean {
    const normalizedPath = normalizePathKey(startPath);
    const lookupKey = normalizedPath || startPath;
    if (visited.has(lookupKey)) {
        return true;
    }

    const token = valueMap?.get(startPath) || (normalizedPath ? valueMap?.get(normalizedPath) : undefined);
    if (!token) {
        return false;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(lookupKey);
    if (normalizedPath && normalizedPath !== lookupKey) nextVisited.add(normalizedPath);

    const nestedRefs = new Set<string>();
    collectRefsFromValue(token.$value, nestedRefs);

    for (const ref of nestedRefs) {
        if (hasCircularDependency(ref, valueMap, nextVisited)) {
            return true;
        }
    }

    return false;
}

/**
 * Precomputes, for each token key, whether it can reach a cycle via references.
 * This is used to short-circuit deep dependency checks during resolution.
 */
function buildCycleStatus(ctx: ProcessingContext): Map<string, boolean> {
    const { valueMap } = ctx;
    if (!valueMap) {
        return new Map<string, boolean>();
    }

    const refsByToken = new Map<string, Set<string>>();

    // Extract references once per token key.
    for (const [key, token] of valueMap.entries()) {
        const refs = new Set<string>();
        collectRefsFromValue(token.$value, refs);
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
                // Follow edges using the same resolution rules used by runtime reference resolution.
                const next = getResolvedTokenKey(ref, ctx);
                if (!next) continue;
                if (dfs(next)) {
                    hitCycle = true;
                    // Keep going to fully color the graph; we already know the answer for `node`.
                }
            }
        }

        color.set(node, 2);
        leadsToCycle.set(node, hitCycle);
        return hitCycle;
    };

    for (const key of refsByToken.keys()) {
        dfs(key);
    }

    return leadsToCycle;
}

/**
 * Fallback recursive scan to resolve VARIABLE_ALIAS ids when the $id index misses.
 * This is intentionally conservative (and potentially expensive) but only used as a last resort.
 */
function findTokenById(tokensData: Record<string, any>, targetId: string, currentPath: string[] = []): string[] | null {
    if (!isPlainObject(tokensData)) {
        return null;
    }

    const keys = Object.keys(tokensData);
    for (const key of keys) {
        if (key.startsWith('$')) {
            const keyValue = tokensData[key];
            if (key === '$id' && typeof keyValue === 'string' && keyValue === targetId) {
                return currentPath;
            }
            continue;
        }

        const newPath = [...currentPath, key];
        const value = tokensData[key];

        if (isPlainObject(value)) {
            if ('$id' in value && typeof (value as any).$id === 'string' && (value as any).$id === targetId) {
                return newPath;
            }

            const found = findTokenById(value as Record<string, any>, targetId, newPath);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

function processVariableAlias(ctx: ProcessingContext, aliasObj: unknown, currentPath: string[]): string {
    if (isVariableAlias(aliasObj)) {
        const { summary, tokensData, idToVarName } = ctx;

        if (aliasObj.id && tokensData) {
            // Fast path: O(1) lookup by $id.
            const direct = idToVarName?.get(aliasObj.id);
            if (direct) {
                return `var(${direct})`;
            }

            // Slow path: attempt to locate the token in the full JSON tree (best-effort).
            const tokenPath = findTokenById(tokensData, aliasObj.id);
            if (tokenPath) {
                const cssPath = tokenPath.map(toKebabCase).join('-');
                return `var(--${cssPath})`;
            }

            console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${pathStr(currentPath)} con ID: ${aliasObj.id}`);
            console.warn(
                `   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`
            );
            console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);

            const placeholderName = toSafePlaceholderName(aliasObj.id);
            recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasObj.id);
            return `var(--unresolved-${placeholderName})`;
        }

        // If we can't resolve the alias id, fall back to a self var() placeholder.
        return `var(--${currentPath.map(toKebabCase).join('-')})`;
    }

    return JSON.stringify(aliasObj);
}

/**
 * Formats a shadow token into CSS box-shadow syntax.
 * Correctly supports `color` as either RGBA channels or a VARIABLE_ALIAS (emitted as var(--...)).
 *
 * Note: We deliberately keep the "color" as the last shadow component. This allows CSS variables
 * (var(--...)) to work, and avoids wrapping var() inside rgba(...), which is invalid.
 */
function processShadow(
    ctx: ProcessingContext,
    shadowObj: unknown,
    currentPath: string[],
    visitedRefs: ReadonlySet<string>
): string {
    if (!isPlainObject(shadowObj)) {
        return JSON.stringify(shadowObj);
    }

    const shadow = shadowObj as Record<string, any>;

    // Null-tolerant parsing: Figma exports may contain nulls; we treat them as missing fields.
    const rawType = shadow.type as unknown;
    const rawColor = shadow.color as unknown;
    const rawOffset = shadow.offset as unknown;
    const rawRadius = shadow.radius as unknown;
    const rawSpread = shadow.spread as unknown;

    const type = rawType === 'INNER_SHADOW' ? 'INNER_SHADOW' : 'DROP_SHADOW';

    const offset =
        isPlainObject(rawOffset) ? (rawOffset as { x?: number | null; y?: number | null }) : { x: 0, y: 0 };
    const offsetX = typeof offset.x === 'number' ? offset.x : 0;
    const offsetY = typeof offset.y === 'number' ? offset.y : 0;

    const radius = typeof rawRadius === 'number' ? rawRadius : rawRadius == null ? 0 : Number(rawRadius) || 0;
    const spread = typeof rawSpread === 'number' ? rawSpread : rawSpread == null ? 0 : Number(rawSpread) || 0;

    const colorPath = [...currentPath, 'color'];

    const colorPart = (() => {
        if (rawColor == null) {
            return 'rgba(0, 0, 0, 1)';
        }

        // If the shadow color is an alias, keep it as var(--...) instead of forcing rgba().
        if (isVariableAlias(rawColor)) {
            return processVariableAlias(ctx, rawColor, colorPath);
        }

        // Some exports may represent colors as strings (including "{ref}" or "rgba(...)").
        if (typeof rawColor === 'string') {
            // Use a fresh visited set so this nested processing can't affect siblings.
            const processed = processValue(ctx, rawColor as any, undefined, colorPath, new Set(visitedRefs));
            return processed ?? rawColor;
        }

        // RGBA channels object.
        if (isPlainObject(rawColor)) {
            const r0 = (rawColor as any).r;
            const g0 = (rawColor as any).g;
            const b0 = (rawColor as any).b;
            const a0 = (rawColor as any).a;

            if (typeof r0 === 'number' && typeof g0 === 'number' && typeof b0 === 'number') {
                // Support both normalized (0..1) and byte (0..255) channels.
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

        // Unknown color shape: keep prior behavior effectively black, but make it explicit.
        console.warn(`⚠️  Unsupported shadow color format at ${pathStr(colorPath)}; defaulting to black`);
        return 'rgba(0, 0, 0, 1)';
    })();

    if (type === 'INNER_SHADOW') {
        return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
    }
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
}

function resolveReference(
    ctx: ProcessingContext,
    match: string,
    tokenPath: string,
    originalValue: string,
    currentPath: string[],
    visitedRefs: ReadonlySet<string>,
    seenInValue: Set<string>
): string {
    const { summary, refMap, valueMap, collisionKeys, cycleStatus } = ctx;

    tokenPath = tokenPath.trim();
    if (!tokenPath) {
        console.warn(`⚠️  Empty W3C reference in "${originalValue}" at ${pathStr(currentPath)}`);
        recordUnresolved(summary, currentPath, ' (Empty ref)');
        return match;
    }

    const canonicalPath = canonicalizeRefPath(tokenPath);
    const normalizedTokenPath = normalizePathKey(canonicalPath);

    // Only run expensive checks once per referenced token within the same string.
    if (!seenInValue.has(normalizedTokenPath)) {
        if (visitedRefs.has(normalizedTokenPath)) {
            console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }

        // Detect deep cycles using cached graph (fallback to DFS when cache missing).
        const keyForCycle =
            (valueMap?.has(canonicalPath) ? canonicalPath : undefined) ??
            (!collisionKeys?.has(normalizedTokenPath) ? normalizedTokenPath : canonicalPath);

        const cachedHasCycle = cycleStatus?.get(keyForCycle);
        if (
            cachedHasCycle === true ||
            (cachedHasCycle === undefined && hasCircularDependency(canonicalPath, valueMap, new Set(visitedRefs)))
        ) {
            console.warn(`⚠️  Deep circular dependency detected starting from: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }

        // IMPORTANT: do not mutate visitedRefs here; it must remain a per-branch seed.
        seenInValue.add(normalizedTokenPath);
    }

    // Resolve: exact key first, then normalized key (unless the normalized form is known to collide).
    const resolvedKey = getResolvedTokenKey(canonicalPath, ctx);
    const mappedVarName = resolvedKey ? refMap?.get(resolvedKey) : undefined;

    if (mappedVarName) {
        return `var(${mappedVarName})`;
    }

    // Keep output deterministic: derive a "broken-ref" var name from the canonical path.
    const cssPath = canonicalPath.split('.').map(toKebabCase).join('-');
    const varName = `--broken-ref-${cssPath || 'unknown'}`;

    console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(currentPath)}`);
    recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

    if (!isValidCssVariableName(varName)) {
        summary.invalidNames.push(`${pathStr(currentPath)} (Ref to invalid name: ${varName})`);
        return match;
    }
    return `var(${varName})`;
}

function processValue(
    ctx: ProcessingContext,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    visitedRefs: ReadonlySet<string> = new Set()
): string | null {
    const { summary } = ctx;

    if (value === null || value === undefined) {
        return 'null';
    }

    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            // Use a fresh visited set per element to avoid sibling contamination.
            return value.map(v => processShadow(ctx, v, currentPath, new Set(visitedRefs))).join(', ');
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    if (typeof value === 'object') {
        if (varType === 'shadow' && !isVariableAlias(value)) {
            return processShadow(ctx, value, currentPath, new Set(visitedRefs));
        }
        if (isVariableAlias(value)) {
            return processVariableAlias(ctx, value, currentPath);
        }
        console.warn(`⚠️  Token compuesto no soportado en ${pathStr(currentPath)}, se omite`);
        recordUnresolved(summary, currentPath, ' (Composite object skipped)');
        return null;
    }

    if (typeof value === 'string') {
        const seenInValue = new Set<string>();

        // Fast exit if no "{...}" references are present.
        if (!W3C_REF_REGEX_DETECT.test(value)) {
            // Preserve already-valid CSS color syntaxes.
            if (value.startsWith('rgba') || value.startsWith('rgb(')) {
                return value;
            }
            if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) {
                return value;
            }

            // Quote string tokens so consumers can distinguish them from raw identifiers.
            if (varType === 'string') {
                const escapedValue = value.replace(/"/g, '\\"');
                return `"${escapedValue}"`;
            }
            return value;
        }

        W3C_REF_REGEX_REPLACE.lastIndex = 0;
        return value.replace(W3C_REF_REGEX_REPLACE, (match, tokenPath) =>
            resolveReference(ctx, match, tokenPath, value, currentPath, visitedRefs, seenInValue)
        );
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return String(value);
}

function collectTokenMaps(ctx: ProcessingContext, obj: any, prefix: string[] = [], currentPath: string[] = []): void {
    const { summary, refMap, valueMap, collisionKeys, idToVarName } = ctx;

    // Indexing is only valid when all maps are present.
    if (!refMap || !valueMap || !collisionKeys || !idToVarName) {
        return;
    }

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

        // Same var name: allow mode branch to override the effective token value for cycle analysis.
        if (allowOverride) {
            valueMap.set(key, tokenObj);
        } else {
            console.warn(`ℹ️  Duplicate token for normalized key ${key}${debugLabel ? ` (${debugLabel})` : ''}`);
        }
    };

    walkTokenTree(summary, obj, prefix, currentPath, {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inModeBranch }) => {
            const tokenPathKey = buildPathKey(tokenPath);
            const normalizedKey = normalizePathKey(tokenPathKey);
            const varName = buildCssVarNameFromPrefix(tokenPrefix);

            indexTokenIdToVarName(tokenObj, varName, idToVarName);

            // Populate the normalized key map (case-insensitive).
            upsertKey(normalizedKey, varName, tokenObj as TokenValue, tokenPathKey, inModeBranch);

            // Also store a "relative" key (without the file segment) to resolve local refs like "{token}".
            const relativePathKey = buildPathKey(tokenPath.slice(1));
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
                upsertKey(relativeNormalizedKey, varName, tokenObj as TokenValue, `relative:${relativePathKey}`, inModeBranch);
            }
        }
        // Legacy primitives are intentionally ignored during indexing (same as previous behavior).
    });
}

/**
 * Extracts CSS variables from a :root { ... } block.
 * This is a conservative parser intended for change detection, not a full CSS parser.
 */
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
        // Fallback: best-effort extraction if braces are unbalanced.
        const rootMatch = cssContent.match(/:root\s*\{([\s\S]+?)\}/);
        if (!rootMatch) {
            return variables;
        }
        rootContent = rootMatch[1];
    } else {
        rootContent = cssContent.substring(braceStart + 1, braceEnd);
    }

    // Strip comments within :root to simplify scanning.
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

        // Repair common Figma export issue: extra "Translations" section appended after the JSON.
        // Conservative on purpose: if this repair attempt fails, rethrow the original error.
        const translationStart = fileContent.indexOf('"Translations"');
        if (translationStart > 0) {
            const firstBrace = fileContent.indexOf('{');
            const jsonContent = fileContent.substring(firstBrace, translationStart).trim().replace(/,\s*$/, '');
            const cleanedContent = jsonContent.endsWith('}') ? jsonContent : `${jsonContent}\n}`;
            try {
                return JSON.parse(cleanedContent);
            } catch {
                throw error; // do not fall through to other repairs
            }
        }

        // Minimal best-effort fix: ensure outer braces exist.
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

/**
 * Reads all JSON files from a directory and merges them into a single object.
 * Each top-level key is the filename (without extension).
 */
function readAndCombineJsons(dir: string): Record<string, any> {
    const combined: Record<string, any> = {};

    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
    }

    // Ensure deterministic output ordering across filesystems/environments.
    const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b));

    for (const file of files) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(dir, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                let json: any = parseJsonWithOptionalRepair(fileContent, file);

                // Some exports wrap the actual tokens under a "Tokens" object.
                // Guard against non-object JSON values to avoid "'in' operator" TypeError.
                if (isPlainObject(json) && 'Tokens' in json && isPlainObject((json as any).Tokens)) {
                    json = (json as any).Tokens;
                }

                // Remove metadata keys not relevant for token processing (only when object-shaped).
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

/**
 * Flattens a token tree into ":root { --var: value; }" lines.
 * Supports:
 * - W3C token objects with "$value"
 * - Legacy primitives (leaf key-value pairs without $value)
 */
function flattenTokens(
    ctx: ProcessingContext,
    obj: any,
    prefix: string[] = [],
    collectedVars: string[] = [],
    currentPath: string[] = []
): string[] {
    const { summary } = ctx;

    walkTokenTree(summary, obj, prefix, currentPath, {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath }) => {
            summary.totalTokens++;
            const rawValue = (tokenObj as TokenValue).$value;
            const varType = (tokenObj as TokenValue).$type;

            if (rawValue === undefined) {
                console.warn(`⚠️  Token sin $value en ${pathStr(tokenPath)}, se omite`);
                return;
            }

            // Seed visited with both exact and normalized paths to catch self-refs regardless of casing.
            const visitedRefs = buildVisitedRefSet(tokenPath);

            const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
            if (resolvedValue === null) {
                return;
            }

            const varName = buildCssVarNameFromPrefix(tokenPrefix);
            emitCssVar(summary, collectedVars, varName, resolvedValue, tokenPath, true);
        },

        onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix }) => {
            // Legacy support: loose key-value tokens without a "$value" wrapper.
            summary.totalTokens++;

            const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
            const leafPath = [...parentPath, key];
            const visitedRefs = buildVisitedRefSet(leafPath);

            const processedValue = processValue(ctx, value as any, undefined, leafPath, visitedRefs);
            if (processedValue === null) {
                return;
            }

            // Keep legacy behavior: invalid var names are warned but not recorded in summary.invalidNames.
            emitCssVar(summary, collectedVars, varName, processedValue, leafPath, false);
        }
    });

    return collectedVars;
}

function logChangeDetection(previousVariables: Map<string, string>, cssLines: string[]): void {
    console.log('\n----------------------------------------');
    console.log('            CAMBIOS DETECTADOS          ');
    console.log('----------------------------------------');

    const newVariables = new Map<string, string>();
    for (const line of cssLines) {
        const match = line.match(/--([a-zA-Z0-9_-]+):\s*([^;]+);/);
        if (match && match[1] && match[2]) {
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
    // Summary report
    console.log('\n========================================');
    console.log('       RESUMEN DE EJECUCIÓN      ');
    console.log('========================================');
    console.log(`Total Tokens:        ${summary.totalTokens}`);
    console.log(`Generados:           ${summary.successCount}`);
    console.log(`Dependencias Circ.:  ${summary.circularDeps}`);
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
}

// --- Main Execution ---

async function main() {
    const summary = createSummary();

    console.log('📖 Leyendo archivos JSON...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);

    // Preprocess entries once (preserves Object.entries order) for reuse across both passes.
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

    let previousVariables = new Map<string, string>();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            previousVariables = readCssVariablesFromFile(OUTPUT_FILE);
            console.log(`📄 Archivo CSS anterior encontrado con ${previousVariables.size} variables`);
        } catch {
            console.warn('⚠️  No se pudo leer el archivo CSS anterior (se creará uno nuevo)');
        }
    }

    // Indexing pass context (no tokensData/cycleStatus needed yet).
    const indexingCtx = createProcessingContext({
        summary,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName
    });

    // Pass 1: index token paths -> CSS var names and values (for reference resolution).
    for (const { originalName, kebabName, content } of fileEntries) {
        collectTokenMaps(indexingCtx, content, [kebabName], [originalName]);
    }

    // Build cycle cache once to avoid repeated deep DFS during reference resolution.
    const cycleStatus = buildCycleStatus(indexingCtx);

    // Full processing context for the flattening pass.
    const processingCtx = createProcessingContext({
        summary,
        tokensData: combinedTokens,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        cycleStatus
    });

    // Pass 2: generate final CSS lines.
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

    // Optional diff-style logging against the previous CSS file.
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
