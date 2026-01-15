import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'src/variables.css');

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
}

const summary: ExecutionSummary = {
    totalTokens: 0,
    successCount: 0,
    unresolvedRefs: [],
    invalidNames: [],
    circularDeps: 0
};

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
    return segments.filter(segment => segment && !isModeKey(segment)).join('.');
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
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    tokensData?: Record<string, any>,
    visitedRefs: Set<string> = new Set(),
    refMap?: Map<string, string>,
    valueMap?: Map<string, TokenValue>
): string {
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
        if (isVariableAlias(value)) {
            return processVariableAlias(value, currentPath, tokensData);
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    if (typeof value === 'string') {
        if (value.startsWith('{') && value.endsWith('}')) {
            const tokenPath = value.slice(1, -1).trim();
            if (tokenPath.trim().length === 0) {
                console.warn(`⚠️  Empty W3C reference at ${currentPath.join('.')}`);
                summary.unresolvedRefs.push(`${currentPath.join('.')} (Empty ref)`);
                return value;
            }

            if (visitedRefs.has(tokenPath)) {
                console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${currentPath.join('.')}`);
                summary.circularDeps++;
                return `/* circular-ref: ${tokenPath} */`;
            }

            visitedRefs.add(tokenPath);
            if (valueMap) {
                const refToken = valueMap.get(tokenPath);
                if (refToken && typeof refToken.$value === 'string') {
                    const nestedValue = refToken.$value.trim();
                    if (nestedValue.startsWith('{') && nestedValue.endsWith('}')) {
                        const nestedPath = nestedValue.slice(1, -1).trim();
                        if (nestedPath) {
                            if (visitedRefs.has(nestedPath)) {
                                console.warn(
                                    `⚠️  Circular W3C reference: ${nestedPath} at ${currentPath.join('.')}`
                                );
                                summary.circularDeps++;
                                return `/* circular-ref: ${nestedPath} */`;
                            }
                            // Recursively check deeper chains
                            processValue(
                                `{${nestedPath}}`,
                                undefined,
                                currentPath,
                                tokensData,
                                visitedRefs,
                                refMap,
                                valueMap
                            );
                        }
                    }
                }
            }

            const mappedVarName = refMap?.get(tokenPath);
            if (mappedVarName) {
                return `var(${mappedVarName})`;
            }

            const cssPath = tokenPath
                .split('.')
                .map(toKebabCase)
                .join('-');
            const varName = `--${cssPath}`;
            if (!isValidCssVariableName(varName)) {
                console.warn(
                    `⚠️  Invalid W3C reference ${value} generates invalid name ${varName} at ${currentPath.join('.')}`
                );
                summary.invalidNames.push(`${currentPath.join('.')} (Ref to invalid name: ${varName})`);
                return value;
            }
            console.warn(`⚠️  Unresolved W3C reference ${value} at ${currentPath.join('.')}`);
            summary.unresolvedRefs.push(`${currentPath.join('.')} (Ref: ${tokenPath})`);
            return `var(${varName})`;
        }

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

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return String(value);
}

function collectTokenMaps(
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = [],
    refMap: Map<string, string>,
    valueMap: Map<string, TokenValue>
): void {
    if (obj && typeof obj === 'object' && '$value' in obj) {
        const tokenPathKey = buildPathKey(currentPath);
        const varName = `--${prefix.filter(p => p).join('-')}`;
        if (tokenPathKey) {
            if (!refMap.has(tokenPathKey)) {
                refMap.set(tokenPathKey, varName);
            } else {
                console.warn(`⚠️  Duplicate token path detected: ${tokenPathKey}`);
            }
            valueMap.set(tokenPathKey, obj as TokenValue);
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
            value,
            [...prefix, normalizedKey],
            [...currentPath, key],
            refMap,
            valueMap
        );
    }

    if (modeDefault) {
        collectTokenMaps(
            obj[modeDefault],
            prefix,
            [...currentPath, modeDefault],
            refMap,
            valueMap
        );
    } else if (modeAny) {
        collectTokenMaps(
            obj[modeAny],
            prefix,
            [...currentPath, modeAny],
            refMap,
            valueMap
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
            if ((char === '"' || char === "'") && (i === 0 || rootContent[i - 1] !== '\\')) {
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
        if (name && valueParsed && isValidCssVariableName(`--${name}`)) {
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
    obj: any,
    prefix: string[] = [],
    collectedVars: string[] = [],
    tokensData?: Record<string, any>,
    currentPath: string[] = [],
    refMap?: Map<string, string>,
    valueMap?: Map<string, TokenValue>
): string[] {
    if (obj && typeof obj === 'object' && '$value' in obj) {
        summary.totalTokens++;
        const rawValue = (obj as TokenValue).$value;
        const varType = (obj as TokenValue).$type;
        const visitedRefs = new Set([currentPath.join('.')]);
        const resolvedValue = processValue(
            rawValue,
            varType,
            currentPath,
            tokensData,
            visitedRefs,
            refMap,
            valueMap
        );
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
             // Handle raw values that aren't strict token objects if needed (fallback)
             // But usually tokens have $value.
             // If this branch is hit, it means structure is loose.
             // We treat it as token value for backward compat?
             // Actually script previously supported deep recursion.
             // But "value" here is just a value.
             // Let's assume this path handles legacy "simple key-value" style if present,
             // or maybe just continues recursion if it's an object?
             // Ah, previous code: if (typeof value === 'string'...)
             // See original lines 591...
             // It treats them as implicit tokens?
             // Yes, let's keep that logic for safety.

             const varName = `--${[...prefix, normalizedKey].filter(p => p).join('-')}`;
             if (!isValidCssVariableName(varName)) {
                 console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
                 continue;
             }
             summary.totalTokens++;
             const visitedRefs = new Set([[...currentPath, key].join('.')]);
             const processedValue = processValue(
                 value as any, // Cast as it might be string/number/boolean
                 undefined,
                 [...currentPath, key],
                 tokensData,
                 visitedRefs,
                 refMap,
                 valueMap
             );
             collectedVars.push(`  ${varName}: ${processedValue};`);
             summary.successCount++;
             continue;
        }

        flattenTokens(
            value,
            [...prefix, normalizedKey],
            collectedVars,
            tokensData,
            [...currentPath, key],
            refMap,
            valueMap
        );
    }

    if (modeDefault) {
        flattenTokens(
            obj[modeDefault],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeDefault],
            refMap,
            valueMap
        );
    } else if (modeAny) {
        flattenTokens(
            obj[modeAny],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeAny],
            refMap,
            valueMap
        );
    }

    return collectedVars;
}

// --- Main Execution ---

async function main() {
    console.log('📖 Leyendo archivos JSON...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);

    console.log('🔄 Transformando a variables CSS...');
    const cssLines: string[] = [];
    const refMap = new Map<string, string>();
    const valueMap = new Map<string, TokenValue>();

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
        collectTokenMaps(fileContent, [normalizedFileName], [fileName], refMap, valueMap);
    }

    for (const [fileName, fileContent] of Object.entries(combinedTokens)) {
        const normalizedFileName = toKebabCase(fileName);
        flattenTokens(
            fileContent,
            [normalizedFileName],
            cssLines,
            combinedTokens,
            [fileName],
            refMap,
            valueMap
        );
    }

    console.log('📝 Escribiendo archivo CSS...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;

    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
    console.log(`\n✅ Archivo variables.css regenerado completamente`);
    
    // Summary Report
    console.log('\n========================================');
    console.log('       RESUMEN DE EJECUCIÓN      ');
    console.log('========================================');
    console.log(`Total Tokens:        ${summary.totalTokens}`);
    console.log(`Generados:           ${summary.successCount}`);
    console.log(`Dependencias Circ.:  ${summary.circularDeps}`);
    console.log(`Refs no resueltas:   ${summary.unresolvedRefs.length}`);
    console.log(`Nombres inválidos:   ${summary.invalidNames.length}`);
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
            if(removed.length > 5) console.log(`      ...`);
        }

        if (added.length > 0) {
            console.log(`   ➕ Variables añadidas: ${added.length}`);
            added.slice(0, 5).forEach(name => console.log(`      + --${name}`));
             if(added.length > 5) console.log(`      ...`);
        }

        if (modified.length > 0) {
            console.log(`   🔄 Variables modificadas: ${modified.length}`);
             modified.slice(0, 5).forEach(({ name, oldValue, newValue }) => {
                console.log(`      ~ --${name}`);
                console.log(`        - ${oldValue} -> ${newValue}`);
            });
            if(modified.length > 5) console.log(`      ...`);
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
