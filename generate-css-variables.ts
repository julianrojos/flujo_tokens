import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'src/variables.css');

// --- Helper Functions ---

type TokenValueType = string | number | boolean | Record<string, unknown> | null;

interface TokenValue {
    $value: TokenValueType | TokenValueType[];
    $type?: string;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVariableAlias(value: unknown): value is VariableAliasObject {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
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
    value: TokenValueType | TokenValueType[],
    varType?: string,
    currentPath: string[] = [],
    tokensData?: Record<string, any>,
    visitedRefs: Set<string> = new Set()
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
            const tokenPath = value.slice(1, -1);
            if (tokenPath.trim().length === 0) {
                console.warn(`⚠️  Empty W3C reference at ${currentPath.join('.')}`);
                return value;
            }

            if (visitedRefs.has(tokenPath)) {
                console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${currentPath.join('.')}`);
                return `/* circular-ref: ${tokenPath} */`;
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
                return value;
            }
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
    currentPath: string[] = []
): string[] {
    if (obj && typeof obj === 'object' && '$value' in obj) {
        const rawValue = (obj as TokenValue).$value;
        const varType = (obj as TokenValue).$type;
        const visitedRefs = new Set([currentPath.join('.')]);
        const resolvedValue = processValue(rawValue, varType, currentPath, tokensData, visitedRefs);
        const varName = `--${prefix.filter(p => p).join('-')}`;

        if (!isValidCssVariableName(varName)) {
            console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
            return collectedVars;
        }

        collectedVars.push(`  ${varName}: ${resolvedValue};`);
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
            const varName = `--${[...prefix, normalizedKey].filter(p => p).join('-')}`;
            if (!isValidCssVariableName(varName)) {
                console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
                continue;
            }
            // Process the value to handle aliases, colors, and proper escaping
            const visitedRefs = new Set([[...currentPath, key].join('.')]);
            const processedValue = processValue(value, undefined, [...currentPath, key], tokensData, visitedRefs);
            collectedVars.push(`  ${varName}: ${processedValue};`);
            continue;
        }
        flattenTokens(
            value,
            [...prefix, normalizedKey],
            collectedVars,
            tokensData,
            [...currentPath, key]
        );
    }

    if (modeDefault) {
        flattenTokens(
            obj[modeDefault],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeDefault]
        );
    } else if (modeAny) {
        flattenTokens(
            obj[modeAny],
            prefix,
            collectedVars,
            tokensData,
            [...currentPath, modeAny]
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

    // We iterate the top-level files (Colorprimitives, colors, etc.)
    for (const [fileName, fileContent] of Object.entries(combinedTokens)) {
        // We include the filename in the prefix (namespace)
        const normalizedFileName = toKebabCase(fileName);
        flattenTokens(fileContent, [normalizedFileName], cssLines, combinedTokens, [fileName]);
    }

    console.log('📝 Escribiendo archivo CSS...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;

    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
    console.log(`\n✅ Archivo variables.css regenerado completamente`);
    console.log(`   📊 Total de variables: ${cssLines.length}`);

    if (previousVariables.size > 0) {
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
            if (removed.length <= 10) {
                removed.forEach(name => {
                    console.log(`      - --${name}`);
                });
            } else {
                removed.slice(0, 10).forEach(name => {
                    console.log(`      - --${name}`);
                });
                console.log(`      ... y ${removed.length - 10} más`);
            }
        }

        if (added.length > 0) {
            console.log(`   ➕ Variables añadidas: ${added.length}`);
            if (added.length <= 10) {
                added.forEach(name => {
                    console.log(`      + --${name}`);
                });
            } else {
                added.slice(0, 10).forEach(name => {
                    console.log(`      + --${name}`);
                });
                console.log(`      ... y ${added.length - 10} más`);
            }
        }

        if (modified.length > 0) {
            console.log(`   🔄 Variables modificadas: ${modified.length}`);
            if (modified.length <= 10) {
                modified.forEach(({ name, oldValue, newValue }) => {
                    console.log(`      ~ --${name}`);
                    console.log(`        Antes: ${oldValue}`);
                    console.log(`        Ahora: ${newValue}`);
                });
            } else {
                modified.slice(0, 10).forEach(({ name, oldValue, newValue }) => {
                    console.log(`      ~ --${name}`);
                    console.log(`        Antes: ${oldValue}`);
                    console.log(`        Ahora: ${newValue}`);
                });
                console.log(`      ... y ${modified.length - 10} más`);
            }
        }

        if (removed.length === 0 && added.length === 0 && modified.length === 0) {
            console.log(`   ✓ Sin cambios (todas las variables se mantienen igual)`);
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
