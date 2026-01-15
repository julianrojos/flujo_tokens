import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'output/variables.css');
const MAX_DEPTH = 50;
const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';

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
    };
    offset?: {
        x: number;
        y: number;
    };
    radius?: number;
    spread?: number;
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

/**
 * Recursively collects all W3C references ({path.to.token}) from any value structure.
 * Handles strings (including embedded refs), arrays, and nested objects.
 */
function collectRefsFromValue(value: unknown, refs: Set<string>): void {
    if (typeof value === 'string') {
        // Match all occurrences of {token.path} in the string (allowing spaces and slashes)
        const matches = value.match(/\{([A-Za-z0-9_./\s-]+)\}/g);
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

function findTokenById(
    tokensData: Record<string, any>,
    targetId: string,
    currentPath: string[] = []
): string[] | null {
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
            if ('$id' in value && typeof value.$id === 'string' && value.$id === targetId) {
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

function processVariableAlias(
    summary: ExecutionSummary,
    aliasObj: unknown,
    currentPath: string[],
    tokensData?: Record<string, any>
): string {
    if (isVariableAlias(aliasObj)) {
        if (aliasObj.id && tokensData) {
            const tokenPath = findTokenById(tokensData, aliasObj.id);
            if (tokenPath) {
                const cssPath = tokenPath.map(toKebabCase).join('-');
                return `var(--${cssPath})`;
            }
            console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${currentPath.join('.')} con ID: ${aliasObj.id}`);
            console.warn(`   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`);
            console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);
            let placeholderName = aliasObj.id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            placeholderName = placeholderName.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            if (!placeholderName || placeholderName === '-') {
                placeholderName = 'unknown';
            }
            summary.unresolvedRefs.push(`${currentPath.join('.')} (Alias ID: ${aliasObj.id})`);
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
    const type = shadow.type || 'DROP_SHADOW';
    const color = shadow.color || { r: 0, g: 0, b: 0, a: 1 };
    const offset = shadow.offset || { x: 0, y: 0 };
    const radius = shadow.radius || 0;
    const spread = shadow.spread || 0;

    const isNormalized =
        (color.r || 0) <= 1 && (color.g || 0) <= 1 && (color.b || 0) <= 1;
    const r = isNormalized ? Math.round((color.r || 0) * 255) : Math.round(color.r || 0);
    const g = isNormalized ? Math.round((color.g || 0) * 255) : Math.round(color.g || 0);
    const b = isNormalized ? Math.round((color.b || 0) * 255) : Math.round(color.b || 0);
    const a = color.a !== undefined ? color.a : 1;

    const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
    const offsetX = offset.x || 0;
    const offsetY = offset.y || 0;

    if (type === 'INNER_SHADOW') {
        return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
    }
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
}

function processValue(
    summary: ExecutionSummary,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    tokensData?: Record<string, any>,
    visitedRefs: Set<string> = new Set(),
    refMap?: Map<string, string>,
    valueMap?: Map<string, TokenValue>,
    collisionKeys?: Set<string>
): string | null {
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
            return processVariableAlias(summary, value, currentPath, tokensData);
        }
        console.warn(`⚠️  Token compuesto no soportado en ${currentPath.join('.')}, se omite`);
        summary.unresolvedRefs.push(`${currentPath.join('.')} (Composite object skipped)`);
        return null;
    }

    if (typeof value === 'string') {
        // Regex to find all {token.path} references
        const refRegex = /\{([A-Za-z0-9_./\s-]+)\}/g;
        const refDetector = /\{([A-Za-z0-9_./\s-]+)\}/; // non-global to avoid lastIndex side-effects
        const seenInValue = new Set<string>();

        // If no references, return as is (with simple string quoting if needed)
        if (!refDetector.test(value)) {
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

        refRegex.lastIndex = 0; // reset before replace
        return value.replace(refRegex, (match, tokenPath) => {
            tokenPath = tokenPath.trim();
            if (!tokenPath) {
                console.warn(`⚠️  Empty W3C reference in "${value}" at ${currentPath.join('.')}`);
                summary.unresolvedRefs.push(`${currentPath.join('.')} (Empty ref)`);
                return match;
            }

            const canonicalPath = canonicalizeRefPath(tokenPath);
            const normalizedTokenPath = normalizePathKey(canonicalPath);

            if (!seenInValue.has(normalizedTokenPath)) {
                if (visitedRefs.has(normalizedTokenPath)) {
                    console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${currentPath.join('.')}`);
                    summary.circularDeps++;
                    return `/* circular-ref: ${tokenPath} */`;
                }

                // Detect Deep Cycles using normalized map
                if (hasCircularDependency(canonicalPath, valueMap, new Set(visitedRefs))) {
                    console.warn(`⚠️  Deep circular dependency detected starting from: ${tokenPath} at ${currentPath.join('.')}`);
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

            // Resolution Strategy: Exact Match -> Normalized Match
            let mappedVarName = refMap?.get(canonicalPath);
            if (!mappedVarName && !collisionKeys?.has(normalizedTokenPath)) {
                mappedVarName = refMap?.get(normalizedTokenPath);
            }

            if (mappedVarName) {
                return `var(${mappedVarName})`;
            }

            const cssPath = canonicalPath
                .split('.')
                .map(toKebabCase)
                .join('-');
            const varName = `--broken-ref-${cssPath || 'unknown'}`;

            console.warn(`⚠️  Unresolved W3C reference ${match} at ${currentPath.join('.')}`);
            summary.unresolvedRefs.push(`${currentPath.join('.')} (Ref: ${tokenPath})`);
            if (!isValidCssVariableName(varName)) {
                summary.invalidNames.push(`${currentPath.join('.')} (Ref to invalid name: ${varName})`);
                return match;
            }
            return `var(${varName})`;
        });
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return String(value);
}

function collectTokenMaps(
    summary: ExecutionSummary,
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = [],
    refMap: Map<string, string>,
    valueMap: Map<string, TokenValue>,
    collisionKeys: Set<string>,
    depth = 0
): void {
    if (depth > MAX_DEPTH) {
        console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${currentPath.join('.')}; truncating traversal.`);
        summary.depthLimitHits++;
        return;
    }

    if (obj && typeof obj === 'object' && '$value' in obj) {
        const tokenPathKey = buildPathKey(currentPath);
        const normalizedKey = normalizePathKey(tokenPathKey);
        const varName = `--${prefix.filter(p => p).join('-')}`;

        // Populate Normalized Map (case-insensitive)
        if (normalizedKey) {
            if (!refMap.has(normalizedKey)) {
                refMap.set(normalizedKey, varName);
                valueMap.set(normalizedKey, obj as TokenValue);
            } else {
                // Optimization: Only warn if it's NOT an exact-match collision (which handles itself)
                // and implies a "different casing" collision.
                const existing = refMap.get(normalizedKey);
                if (existing !== varName) {
                    // This is the "silent loss" scenario mentioned. We log it but allow exact map to save the day for specific refs.
                    // Normalized lookups will still only find the first one.
                    console.warn(`ℹ️  Normalized collision: ${tokenPathKey} normalized to same key as existing token.`);
                    collisionKeys.add(normalizedKey);
                } else {
                    console.warn(`ℹ️  Duplicate token for normalized key ${normalizedKey} at ${tokenPathKey}`);
                }
            }
        }
        // Also store relative path (without filename) to resolve local refs like {token}
        const relativePathKey = buildPathKey(currentPath.slice(1));
        const relativeNormalizedKey = normalizePathKey(relativePathKey);
        if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
            if (!refMap.has(relativeNormalizedKey)) {
                refMap.set(relativeNormalizedKey, varName);
                valueMap.set(relativeNormalizedKey, obj as TokenValue);
            } else {
                const existingRel = refMap.get(relativeNormalizedKey);
                if (existingRel !== varName) {
                    console.warn(`ℹ️  Normalized collision (relative): ${relativePathKey} normalized to same key as existing token.`);
                    collisionKeys.add(relativeNormalizedKey);
                } else {
                    console.warn(`ℹ️  Duplicate token for normalized key ${relativeNormalizedKey} at ${relativePathKey}`);
                }
            }
        }
        return;
    }

    if (!isPlainObject(obj)) {
        return;
    }

    const keys = Object.keys(obj).sort();
    const modeDefault = keys.find(k => k === 'modeDefault');
    const modeAny = keys.find(k => isModeKey(k));

    for (const key of keys) {
        if (key.startsWith('$')) continue;
        if (isModeKey(key)) {
            continue;
        }
        const value = obj[key];
        const normalizedKey = toKebabCase(key);
        collectTokenMaps(
            summary,
            value,
            [...prefix, normalizedKey],
            [...currentPath, key],
            refMap,
            valueMap,
            collisionKeys,
            depth + 1
        );
    }

    if (modeDefault) {
        collectTokenMaps(
            summary,
            obj[modeDefault],
            prefix,
            [...currentPath, modeDefault],
            refMap,
            valueMap,
            collisionKeys,
            depth + 1
        );
    } else if (modeAny) {
        collectTokenMaps(
            summary,
            obj[modeAny],
            prefix,
            [...currentPath, modeAny],
            refMap,
            valueMap,
            collisionKeys,
            depth + 1
        );
    }
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
        const valueIsSane =
            valueParsed.length > 0 &&
            !/[\r\n\x00-\x1F]/.test(valueParsed) &&
            valueParsed === valueParsed.trim();
        if (name && valueIsSane && isValidCssVariableName(`--${name}`)) {
            variables.set(name, valueParsed);
        }

        i++;
    }

    return variables;
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
                let json: any;
                try {
                    json = JSON.parse(fileContent);
                } catch (error) {
                    if (!ALLOW_JSON_REPAIR) {
                        throw error;
                    }
                    // Try to repair common Figma export issues (like extra "Translations" section)
                    const translationStart = fileContent.indexOf('"Translations"');
                    if (translationStart > 0) {
                        const firstBrace = fileContent.indexOf('{');
                        const jsonContent = fileContent
                            .substring(firstBrace, translationStart)
                            .trim()
                            .replace(/,\s*$/, '');
                        const cleanedContent = jsonContent.endsWith('}')
                            ? jsonContent
                            : `${jsonContent}\n}`;
                        try {
                            json = JSON.parse(cleanedContent);
                        } catch {
                            throw error; // Throw original error if repair fails
                        }
                    } else {
                        // Try to fix malformed JSON by wrapping or closing braces
                        let cleaned = fileContent.trim();
                        if (!cleaned.startsWith('{')) {
                            cleaned = `{${cleaned}`;
                        }
                        if (!cleaned.endsWith('}')) {
                            cleaned = `${cleaned}}`;
                        }
                        try {
                            console.warn(`⚠️  JSON reparado en ${file}; revisa el export si es posible.`);
                            json = JSON.parse(cleaned);
                        } catch {
                            throw error;
                        }
                    }
                }

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
    summary: ExecutionSummary,
    obj: any,
    prefix: string[] = [],
    collectedVars: string[] = [],
    tokensData?: Record<string, any>,
    currentPath: string[] = [],
    refMap?: Map<string, string>,
    valueMap?: Map<string, TokenValue>,
    collisionKeys?: Set<string>,
    depth = 0
): string[] {
    if (depth > MAX_DEPTH) {
        console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${currentPath.join('.')}; truncating traversal.`);
        summary.depthLimitHits++;
        return collectedVars;
    }

    if (obj && typeof obj === 'object' && '$value' in obj) {
        summary.totalTokens++;
        const rawValue = (obj as TokenValue).$value;
        const varType = (obj as TokenValue).$type;

        if (rawValue === undefined) {
            console.warn(`⚠️  Token sin $value en ${currentPath.join('.')}, se omite`);
            return collectedVars;
        }

        // Initialize visited with both exact and normalized paths to catch self-refs regardless of casing
        const visitedRefs = buildVisitedRefSet(currentPath);

        const resolvedValue = processValue(
            summary,
            rawValue,
            varType,
            currentPath,
            tokensData,
            visitedRefs,
            refMap,
            valueMap,
            collisionKeys
        );
        if (resolvedValue === null) {
            return collectedVars;
        }
        const varName = `--${prefix.filter(p => p).join('-')}`;

        if (!isValidCssVariableName(varName)) {
            console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
            summary.invalidNames.push(`${currentPath.join('.')} (Invalid CSS Var: ${varName})`);
            return collectedVars;
        }

        collectedVars.push(`  ${varName}: ${resolvedValue};`);
        summary.successCount++;
        return collectedVars;
    }

    if (!isPlainObject(obj)) {
        return collectedVars;
    }

    const keys = Object.keys(obj).sort();
    const modeDefault = keys.find(k => k === 'modeDefault');
    const modeAny = keys.find(k => k.toLowerCase().startsWith('mode'));

    for (const key of keys) {
        if (key.startsWith('$')) continue;
        if (key.toLowerCase().startsWith('mode')) {
            continue;
        }

        const value = obj[key];
        const normalizedKey = toKebabCase(key);
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            // Legacy support: handle loose key-value tokens without $value wrapper
            const varName = `--${[...prefix, normalizedKey].filter(p => p).join('-')}`;
            if (!isValidCssVariableName(varName)) {
                console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
                continue;
            }
            summary.totalTokens++;
            const visitedRefs = buildVisitedRefSet([...currentPath, key]);
            const processedValue = processValue(
                summary,
                value as any, // Cast as it might be string/number/boolean
                undefined,
                [...currentPath, key],
                tokensData,
                visitedRefs,
                refMap,
                valueMap,
                collisionKeys
            );
            if (processedValue === null) {
                continue;
            }
            collectedVars.push(`  ${varName}: ${processedValue};`);
            summary.successCount++;
            continue;
        } else {
            flattenTokens(
                summary,
                value,
                [...prefix, normalizedKey],
                collectedVars,
                tokensData,
                [...currentPath, key],
                refMap,
                valueMap,
                collisionKeys,
                depth + 1
            );
        }
    }

    if (modeDefault) {
        flattenTokens(
            summary,
            obj[modeDefault],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeDefault],
            refMap,
            valueMap,
            collisionKeys,
            depth + 1
        );
    } else if (modeAny) {
        flattenTokens(
            summary,
            obj[modeAny],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeAny],
            refMap,
            valueMap,
            collisionKeys,
            depth + 1
        );
    }

    return collectedVars;
}

// --- Main Execution ---

async function main() {
    const summary = createSummary();

    console.log('📖 Leyendo archivos JSON...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);

    console.log('🔄 Transformando a variables CSS...');
    const cssLines: string[] = [];
    const refMap = new Map<string, string>();
    const valueMap = new Map<string, TokenValue>();
    const collisionKeys = new Set<string>();

    let previousVariables = new Map<string, string>();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const previousCss = fs.readFileSync(OUTPUT_FILE, 'utf-8');
            previousVariables = extractCssVariables(previousCss);
            console.log(`📄 Archivo CSS anterior encontrado con ${previousVariables.size} variables`);
        } catch {
            console.warn('⚠️  No se pudo leer el archivo CSS anterior (se creará uno nuevo)');
        }
    }

    // We iterate the top-level files (color-primitives, colors, etc.)
    for (const [fileName, fileContent] of Object.entries(combinedTokens)) {
        // We include the filename in the prefix (namespace)
        const normalizedFileName = toKebabCase(fileName);
        collectTokenMaps(
            summary,
            fileContent,
            [normalizedFileName],
            [fileName],
            refMap,
            valueMap,
            collisionKeys
        );
    }

    for (const [fileName, fileContent] of Object.entries(combinedTokens)) {
        const normalizedFileName = toKebabCase(fileName);
        flattenTokens(
            summary,
            fileContent,
            [normalizedFileName],
            cssLines,
            combinedTokens,
            [fileName],
            refMap,
            valueMap,
            collisionKeys
        );
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

    // Change Detection Log
    if (previousVariables.size > 0) {
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
