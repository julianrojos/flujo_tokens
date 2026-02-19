/**
 * JSON ingestion phase.
 */

import fs from 'fs';
import path from 'path';
import { isPlainObject } from '../types/tokens.js';
import { ALLOW_JSON_REPAIR } from '../runtime/config.js';

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
 * Parses JSON content.
 * When `ALLOW_JSON_REPAIR` is enabled, attempts a best-effort repair for known truncation patterns
 * observed in some exports.
 */
function parseJsonWithOptionalRepair(fileContent: string, file: string): any {
    try {
        return JSON.parse(fileContent);
    } catch (error) {
        if (!ALLOW_JSON_REPAIR) throw error;

        const trimmed = fileContent.trim();
        const firstBrace = trimmed.indexOf('{');
        if (firstBrace === -1) throw error;

        const translationStart = findTopLevelObjectKeyStart(trimmed, 'Translations');
        if (translationStart <= firstBrace) throw error;

        const beforeTranslations = trimmed
            .slice(firstBrace, translationStart)
            .trim()
            .replace(/,\s*$/, '');
        const cleaned = beforeTranslations.endsWith('}')
            ? beforeTranslations
            : `${beforeTranslations}\n}`;

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
                console.error(`❌ Critical error reading/parsing ${file}:`, err);
                throw new Error(`Ingestion failed for ${file}`);
            }
        }
    }

    return combined;
}
