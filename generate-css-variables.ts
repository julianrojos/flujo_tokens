import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'output/variables.css');
const MAX_DEPTH = 50;
const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';

// --- Regex (centralized, safe) ---
// NOTE: we keep separate /g instances to avoid lastIndex interference during nested calls.
const W3C_REF_REGEX_DETECT = /\{([A-Za-z0-9_./\s-]+)\}/; // non-global
const W3C_REF_REGEX_REPLACE = /\{([A-Za-z0-9_./\s-]+)\}/g; // for processValue.replace
const W3C_REF_REGEX_COLLECT = /\{([A-Za-z0-9_./\s-]+)\}/g; // for collectRefsFromValue.match

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

interface ShadowObject {
    type?: 'DROP_SHADOW' | 'INNER_SHADOW';
    color?: {
        r: number;
        g: number;
        b: number;
        a?: number;
    } | null;
    offset?: {
        x: number;
        y: number;
    } | null;
    radius?: number | null;
    spread?: number | null;
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
    return key.startsWith('$') || isModeKey(key);
}

function pickModeKey(keys: string[]): string | undefined {
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
    // reason must include the leading space/paren formatting (e.g. " (Empty ref)")
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

/**
 * Safe typed wrapper around recordUnresolved that preserves the *exact* legacy formatting
 * in summary.unresolvedRefs (so it cannot affect CSS diffs, and keeps log formatting stable).
 *
 * Examples:
 *  - recordUnresolvedTyped(summary, path, "Empty ref") => "path.to.token (Empty ref)"
 *  - recordUnresolvedTyped(summary, path, "Ref", "{foo.bar}") => "path.to.token (Ref: {foo.bar})"
 */
function recordUnresolvedTyped(
    summary: ExecutionSummary,
    currentPath: string[],
    label: string,
    detail?: string
): void {
    const reason = detail !== undefined ? ` (${label}: ${detail})` : ` (${label})`;
    recordUnresolved(summary, currentPath, reason);
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
    return segments
        .filter(segment => segment && !isModeKey(segment))
        .join('.')
        .replace(/[\\/]+/g, '.')
        .replace(/\s+/g, '.');
}

/**
 * Normalizes a path key to lowercase (preserves delimiters to avoid over-collapsing distinct tokens).
 */
function normalizePathKey(pathKey: string): string {
    return pathKey.toLowerCase();
}

/**
 * Canonicalizes a token path by replacing slashes/backslashes and whitespace with dots.
 */
function canonicalizeRefPath(pathKey: string): string {
    return pathKey.trim().replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
}

function buildVisitedRefSet(pathSegments: string[]): Set<string> {
    const exactPath = pathSegments.join('.');
    const normalizedPath = normalizePathKey(exactPath);
    const visited = new Set<string>();
    if (exactPath) visited.add(exactPath);
    if (normalizedPath && normalizedPath !== exactPath) visited.add(normalizedPath);
    return visited;
}

function indexTokenIdToVarName(tokenObj: any, varName: string, idToVarName: Map<string, string>): void {
    const id = tokenObj?.$id;
    if (typeof id === 'string' && id.trim()) {
        idToVarName.set(id, varName);
    }
}

/**
 * Centralized resolver for "exact -> normalized" token key lookup.
 * Mirrors prior behavior: prefer exact; fallback to normalized only if not colliding.
 *
 * Invariant (documented): collectTokenMaps populates valueMap and refMap together.
 * Therefore, valueMap is a sufficient source of truth for token existence here.
 */
function getResolvedTokenKey(ref: string, ctx: ProcessingContext): string | null {
    const canonical = canonicalizeRefPath(ref);
    const normalized = normalizePathKey(canonical);

    if (ctx.valueMap?.has(canonical)) return canonical;
    if (ctx.collisionKeys?.has(normalized)) return null;
    if (ctx.valueMap?.has(normalized)) return normalized;

    return null;
}

type WalkPrimitive = string | number | boolean;

type WalkHandlers = {
    onTokenValue?: (ctx: { obj: any; prefix: string[]; currentPath: string[]; depth: number }) => void;
    onLegacyPrimitive?: (ctx: {
        value: WalkPrimitive;
        key: string;
        normalizedKey: string;
        prefix: string[];
        currentPath: string[];
        depth: number;
    }) => void;
};

/**
 * Conservative universal walker:
 * - Centralizes: depth guard, key sorting, modeKey selection, skipKey logic, recursion.
 * - Does NOT normalize "legacy vs $value" semantics: leaf handling is delegated via callbacks.
 */
function walkTokenTree(
    summary: ExecutionSummary,
    obj: any,
    prefix: string[],
    currentPath: string[],
    handlers: WalkHandlers,
    depth = 0
): void {
    if (checkDepthLimit(summary, depth, currentPath)) {
        return;
    }

    if (obj && typeof obj === 'object' && '$value' in obj) {
        handlers.onTokenValue?.({ obj, prefix, currentPath, depth });
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
                depth
            });
            continue;
        }

        walkTokenTree(summary, value, [...prefix, normalizedKey], [...currentPath, key], handlers, depth + 1);
    }

    if (modeKey) {
        walkTokenTree(
            summary,
            (obj as Record<string, any>)[modeKey],
            prefix,
            [...currentPath, modeKey],
            handlers,
            depth + 1
        );
    }
}

/**
 * Recursively collects all W3C references ({path.to.token}) from any value structure.
 * Handles strings (including embedded refs), arrays, and nested objects.
 */
function collectRefsFromValue(value: unknown, refs: Set<string>): void {
    if (typeof value === 'string') {
        // Match all occurrences of {token.path} in the string (allowing spaces and slashes)
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
            if (!key.startsWith('$')) {
                collectRefsFromValue((value as Record<string, unknown>)[key], refs);
            }
        }
    }
}

/**
 * Checks for circular dependencies by recursively following all references.
 * Returns true if a cycle is detected.
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
 * Builds a cached "leads-to-cycle" map for tokens to avoid repeated deep DFS per reference.
 * The result answers: "starting from this token key, will I hit a cycle?"
 */
function buildCycleStatus(ctx: ProcessingContext): Map<string, boolean> {
    const { valueMap } = ctx;
    if (!valueMap) {
        return new Map<string, boolean>();
    }

    const refsByToken = new Map<string, Set<string>>();

    // Extract refs once per token key (valueMap includes normalized/relative keys; that's ok).
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
                const next = getResolvedTokenKey(ref, ctx);
                if (!next) continue;
                if (dfs(next)) {
                    hitCycle = true;
                    // keep going to fully color the graph; but we already know the answer
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
            // Fast path: O(1) lookup by $id
            const direct = idToVarName?.get(aliasObj.id);
            if (direct) {
                return `var(${direct})`;
            }
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
        return `var(--${currentPath.map(toKebabCase).join('-')})`;
    }
    return JSON.stringify(aliasObj);
}

function processShadow(shadowObj: unknown): string {
    if (!isPlainObject(shadowObj)) {
        return JSON.stringify(shadowObj);
    }

    const shadow = shadowObj as ShadowObject;

    // Destructuring + null-safe defaults (rawX ?? default) to preserve prior tolerance.
    const { type: rawType, color: rawColor, offset: rawOffset, radius: rawRadius, spread: rawSpread } = shadow;

    const type = rawType ?? 'DROP_SHADOW';
    const color = rawColor ?? { r: 0, g: 0, b: 0, a: 1 };
    const offset = rawOffset ?? { x: 0, y: 0 };
    const radius = rawRadius ?? 0;
    const spread = rawSpread ?? 0;

    const isNormalized = (color.r || 0) <= 1 && (color.g || 0) <= 1 && (color.b || 0) <= 1;
    const to255 = (c: number | undefined, normalized: boolean): number =>
        normalized ? Math.round((c || 0) * 255) : Math.round(c || 0);

    const r = to255(color.r, isNormalized);
    const g = to255(color.g, isNormalized);
    const b = to255(color.b, isNormalized);
    const a = color.a ?? 1;

    const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
    const offsetX = offset.x ?? 0;
    const offsetY = offset.y ?? 0;

    if (type === 'INNER_SHADOW') {
        return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
    }
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
}

function resolveReference(
    ctx: ProcessingContext,
    match: string,
    tokenPath: string,
    originalValue: string,
    currentPath: string[],
    visitedRefs: Set<string>,
    seenInValue: Set<string>
): string {
    const { summary, refMap, valueMap, collisionKeys, cycleStatus } = ctx;

    tokenPath = tokenPath.trim();
    if (!tokenPath) {
        console.warn(`⚠️  Empty W3C reference in "${originalValue}" at ${pathStr(currentPath)}`);
        recordUnresolvedTyped(summary, currentPath, 'Empty ref');
        return match;
    }

    const canonicalPath = canonicalizeRefPath(tokenPath);
    const normalizedTokenPath = normalizePathKey(canonicalPath);

    if (!seenInValue.has(normalizedTokenPath)) {
        if (visitedRefs.has(normalizedTokenPath)) {
            console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }

        // Detect deep cycles using cached graph (fallback to old DFS if cache not provided)
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

        // Add to visited AFTER cycle check passes
        visitedRefs.add(normalizedTokenPath);
        if (canonicalPath !== normalizedTokenPath) {
            visitedRefs.add(canonicalPath); // Track exact path too
        }
        seenInValue.add(normalizedTokenPath);
    }

    // Resolution Strategy: Exact Match -> Normalized Match (centralized)
    const resolvedKey = getResolvedTokenKey(canonicalPath, ctx);
    const mappedVarName = resolvedKey ? refMap?.get(resolvedKey) : undefined;

    if (mappedVarName) {
        return `var(${mappedVarName})`;
    }

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
    visitedRefs: Set<string> = new Set()
): string | null {
    const { summary } = ctx;

    if (value === null || value === undefined) {
        return 'null';
    }

    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            return value.map(processShadow).join(', ');
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    if (typeof value === 'object') {
        if (varType === 'shadow' && !isVariableAlias(value)) {
            return processShadow(value);
        }
        if (isVariableAlias(value)) {
            return processVariableAlias(ctx, value, currentPath);
        }
        console.warn(`⚠️  Token compuesto no soportado en ${pathStr(currentPath)}, se omite`);
        recordUnresolvedTyped(summary, currentPath, 'Composite object skipped');
        return null;
    }

    if (typeof value === 'string') {
        const seenInValue = new Set<string>();

        // If no references, return as is (with simple string quoting if needed)
        if (!W3C_REF_REGEX_DETECT.test(value)) {
            // Preserve RGB/RGBA colors
            if (value.startsWith('rgba') || value.startsWith('rgb(')) {
                return value;
            }

            // Preserve hexadecimal colors
            if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) {
                return value;
            }

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

function collectTokenMaps(
    ctx: ProcessingContext,
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = []
): void {
    const { summary, refMap, valueMap, collisionKeys, idToVarName } = ctx;

    if (!refMap || !valueMap || !collisionKeys || !idToVarName) {
        return;
    }

    walkTokenTree(summary, obj, prefix, currentPath, {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath }) => {
            const tokenPathKey = buildPathKey(tokenPath);
            const normalizedKey = normalizePathKey(tokenPathKey);
            const varName = buildCssVarNameFromPrefix(tokenPrefix);

            // Index $id -> varName for fast VARIABLE_ALIAS resolution
            indexTokenIdToVarName(tokenObj, varName, idToVarName);

            // Populate Normalized Map (case-insensitive)
            if (normalizedKey) {
                if (!refMap.has(normalizedKey)) {
                    refMap.set(normalizedKey, varName);
                    valueMap.set(normalizedKey, tokenObj as TokenValue);
                } else {
                    const existing = refMap.get(normalizedKey);
                    if (existing !== varName) {
                        console.warn(`ℹ️  Normalized collision: ${tokenPathKey} normalized to same key as existing token.`);
                        collisionKeys.add(normalizedKey);
                    } else {
                        console.warn(`ℹ️  Duplicate token for normalized key ${normalizedKey} at ${tokenPathKey}`);
                    }
                }
            }

            // Also store relative path (without filename) to resolve local refs like {token}
            const relativePathKey = buildPathKey(tokenPath.slice(1));
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
                if (!refMap.has(relativeNormalizedKey)) {
                    refMap.set(relativeNormalizedKey, varName);
                    valueMap.set(relativeNormalizedKey, tokenObj as TokenValue);
                } else {
                    const existingRel = refMap.get(relativeNormalizedKey);
                    if (existingRel !== varName) {
                        console.warn(
                            `ℹ️  Normalized collision (relative): ${relativePathKey} normalized to same key as existing token.`
                        );
                        collisionKeys.add(relativeNormalizedKey);
                    } else {
                        console.warn(`ℹ️  Duplicate token for normalized key ${relativeNormalizedKey} at ${relativePathKey}`);
                    }
                }
            }
        }
        // legacy primitives intentionally ignored in this pass (same as previous behavior)
    });
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

    // Strip comments only inside :root content
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

        // Try to repair common Figma export issues (like extra "Translations" section)
        const translationStart = fileContent.indexOf('"Translations"');
        if (translationStart > 0) {
            const firstBrace = fileContent.indexOf('{');
            const jsonContent = fileContent.substring(firstBrace, translationStart).trim().replace(/,\s*$/, '');
            const cleanedContent = jsonContent.endsWith('}') ? jsonContent : `${jsonContent}\n}`;
            try {
                return JSON.parse(cleanedContent);
            } catch {
                throw error; // conservative: do not fall through to other repairs
            }
        }

        // Try to fix malformed JSON by wrapping or closing braces
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
 * Reads all JSON files from the directory and combines them into a single object.
 * Keys in the combined object are the filenames (without extension).
 */
function readAndCombineJsons(dir: string): Record<string, any> {
    const combined: Record<string, any> = {};

    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(dir, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                let json: any = parseJsonWithOptionalRepair(fileContent, file);

                // Handle wrapped "Tokens" object structure if present
                if ('Tokens' in json && typeof json.Tokens === 'object' && !Array.isArray(json.Tokens)) {
                    json = json.Tokens;
                }

                // Remove metadata keys
                delete json['$schema'];
                delete json['Translations'];

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
 * Recursive function to flatten the token object into CSS variables.
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

            // Initialize visited with both exact and normalized paths to catch self-refs regardless of casing
            const visitedRefs = buildVisitedRefSet(tokenPath);

            const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
            if (resolvedValue === null) {
                return;
            }

            const varName = buildCssVarNameFromPrefix(tokenPrefix);
            emitCssVar(summary, collectedVars, varName, resolvedValue, tokenPath, true);
        },

        onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix }) => {
            // Legacy support: handle loose key-value tokens without $value wrapper
            summary.totalTokens++;

            const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
            const leafPath = [...parentPath, key];
            const visitedRefs = buildVisitedRefSet(leafPath);

            const processedValue = processValue(ctx, value as any, undefined, leafPath, visitedRefs);
            if (processedValue === null) {
                return;
            }

            // (recordInvalidName=false) to preserve legacy behavior (no invalidNames summary entry)
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
    // Summary Report
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

    // (3) Cache file name normalization once (keeps order identical to Object.entries)
    const fileEntries = Object.entries(combinedTokens).map(([fileName, fileContent]) => ({
        fileName,
        kebabName: toKebabCase(fileName),
        fileContent
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

    // Context for indexing pass (cycleStatus not available yet; tokensData not needed here).
    const indexingCtx = createProcessingContext({
        summary,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName
    });

    // Index pass
    for (const { fileName, kebabName, fileContent } of fileEntries) {
        collectTokenMaps(indexingCtx, fileContent, [kebabName], [fileName]);
    }

    // Build cached cycle info once (massive speedup on large graphs)
    const cycleStatus = buildCycleStatus(indexingCtx);

    // Full processing context (includes tokensData and cycleStatus)
    const processingCtx = createProcessingContext({
        summary,
        tokensData: combinedTokens,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        cycleStatus
    });

    // Flatten pass
    for (const { fileName, kebabName, fileContent } of fileEntries) {
        flattenTokens(processingCtx, fileContent, [kebabName], cssLines, [fileName]);
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

    // Change Detection Log
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
