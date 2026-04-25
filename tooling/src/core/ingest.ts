/**
 * JSON ingestion phase.
 */

import fs from 'fs';
import path from 'path';
import { isPlainObject } from '../types/tokens.js';
import { ALLOW_JSON_REPAIR } from '../runtime/config.js';

type JsonRecord = Record<string, unknown>;

/**
 * Finds the start offset of a top-level object key (depth=1), outside string literals.
 * Returns -1 when the key is not found in object-key position.
 */
function findTopLevelObjectKeyStart(source: string, keyName: string): number {
    let depth = 0;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];

        if (ch === '{') {
            depth++;
            continue;
        }
        if (ch === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (ch !== '"') continue;

        // Parse JSON string token starting at i.
        let j = i + 1;
        let escaped = false;
        let token = '';

        for (; j < source.length; j++) {
            const current = source[j];
            if (escaped) {
                token += current;
                escaped = false;
                continue;
            }
            if (current === '\\') {
                escaped = true;
                continue;
            }
            if (current === '"') break;
            token += current;
        }

        if (j >= source.length) return -1;

        // Only consider object keys at top level depth.
        if (depth === 1 && token === keyName) {
            let k = j + 1;
            while (k < source.length && /\s/.test(source[k])) k++;
            if (source[k] === ':') return i;
        }

        i = j;
    }

    return -1;
}

/**
 * Finds the full [start, end) range for a top-level object key/property.
 * Includes a leading comma when present to keep resulting JSON valid after removal.
 */
function findTopLevelPropertyRange(
    source: string,
    keyName: string
): { start: number; end: number } | null {
    const keyStart = findTopLevelObjectKeyStart(source, keyName);
    if (keyStart < 0) return null;

    const firstBrace = source.indexOf('{');
    if (firstBrace < 0 || keyStart <= firstBrace) return null;

    // Find end of key string.
    let keyEndQuote = -1;
    let escaped = false;
    for (let i = keyStart + 1; i < source.length; i++) {
        const ch = source[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            keyEndQuote = i;
            break;
        }
    }
    if (keyEndQuote < 0) return null;

    let colonIndex = keyEndQuote + 1;
    while (colonIndex < source.length && /\s/.test(source[colonIndex])) colonIndex++;
    if (source[colonIndex] !== ':') return null;

    let valueStart = colonIndex + 1;
    while (valueStart < source.length && /\s/.test(source[valueStart])) valueStart++;
    if (valueStart >= source.length) return null;

    // Scan JSON value to find the property boundary at top-level object depth.
    let inString = false;
    let strEscaped = false;
    let objectDepth = 0;
    let arrayDepth = 0;
    let valueEnd = source.length;

    for (let i = valueStart; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
            if (strEscaped) {
                strEscaped = false;
                continue;
            }
            if (ch === '\\') {
                strEscaped = true;
                continue;
            }
            if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') {
            objectDepth++;
            continue;
        }
        if (ch === '}') {
            if (objectDepth > 0) {
                objectDepth--;
                continue;
            }
            if (arrayDepth === 0) {
                // End of root object: property ends right before this closing brace.
                valueEnd = i;
                break;
            }
            continue;
        }
        if (ch === '[') {
            arrayDepth++;
            continue;
        }
        if (ch === ']') {
            if (arrayDepth > 0) arrayDepth--;
            continue;
        }
        if (ch === ',' && objectDepth === 0 && arrayDepth === 0) {
            // Property followed by another sibling property.
            valueEnd = i + 1;
            break;
        }
    }

    let start = keyStart;
    // Prefer consuming the leading comma if this isn't the first property.
    let cursor = keyStart - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
    if (cursor >= 0 && source[cursor] === ',') {
        start = cursor;
    }

    return { start, end: valueEnd };
}

/**
 * Parses JSON content.
 * When `ALLOW_JSON_REPAIR` is enabled, attempts a best-effort repair for known truncation patterns
 * observed in some exports.
 */
function parseJsonWithOptionalRepair(fileContent: string, file: string): unknown {
    try {
        return JSON.parse(fileContent);
    } catch (error) {
        if (!ALLOW_JSON_REPAIR) throw error;

        const trimmed = fileContent.trim();
        if (!trimmed.startsWith('{')) throw error;

        const translationRange = findTopLevelPropertyRange(trimmed, 'Translations');
        if (!translationRange) throw error;

        const cleaned = (
            trimmed.slice(0, translationRange.start) + trimmed.slice(translationRange.end)
        )
            .replace(/,\s*}/g, '}')
            .trim();

        try {
            const parsed = JSON.parse(cleaned);
            console.warn(`⚠️  JSON repaired in ${file}; check the export if possible.`);
            return parsed;
        } catch {
            throw error;
        }
    }
}

/**
 * Reads all `.json` files in `dir` (sorted by filename) and combines them into a single object.
 * Each file becomes a namespace root keyed by its basename.
 *
 * Export quirks handled:
 * - Some exports nest tokens under a "Tokens" root.
 * - Known metadata fields (`$schema`, `Translations`) are removed.
 */
export function readAndCombineJsons(dir: string): Record<string, any> {
    const combined: Record<string, any> = {};

    if (!fs.existsSync(dir)) {
        throw new Error(`Directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b));

    for (const file of files) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(dir, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                let json: unknown = parseJsonWithOptionalRepair(fileContent, file);

                if (isPlainObject(json)) {
                    const record = json as JsonRecord;
                    if ('Tokens' in record && isPlainObject(record.Tokens)) {
                        json = record.Tokens;
                    }
                }

                if (isPlainObject(json)) {
                    delete (json as JsonRecord)['$schema'];
                    delete (json as JsonRecord)['Translations'];
                }

                const name = path.basename(file, '.json');
                combined[name] = json;
            } catch (err) {
                console.error(`❌ Critical error reading/parsing ${file}:`, err);
                throw new Error(`Ingestion failed for ${file}`);
            }
        }
    }

    return combined;
}
