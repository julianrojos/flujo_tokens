/**
 * JSON ingestion phase.
 */
import fs from 'fs';
import path from 'path';
import { isPlainObject } from '../types/tokens.js';
import { ALLOW_JSON_REPAIR } from '../runtime/config.js';
/**
 * Parses JSON content.
 * When `ALLOW_JSON_REPAIR` is enabled, attempts a best-effort repair for known truncation patterns
 * observed in some exports.
 */
export function parseJsonWithOptionalRepair(fileContent, file) {
    try {
        return JSON.parse(fileContent);
    }
    catch (error) {
        if (!ALLOW_JSON_REPAIR)
            throw error;
        const translationStart = fileContent.indexOf('"Translations"');
        if (translationStart > 0) {
            const firstBrace = fileContent.indexOf('{');
            const jsonContent = fileContent.substring(firstBrace, translationStart).trim().replace(/,\s*$/, '');
            const cleanedContent = jsonContent.endsWith('}') ? jsonContent : `${jsonContent}\n}`;
            try {
                return JSON.parse(cleanedContent);
            }
            catch {
                throw error;
            }
        }
        let cleaned = fileContent.trim();
        if (!cleaned.startsWith('{'))
            cleaned = `{${cleaned}`;
        if (!cleaned.endsWith('}'))
            cleaned = `${cleaned}}`;
        console.warn(`⚠️  JSON reparado en ${file}; revisa el export si es posible.`);
        try {
            return JSON.parse(cleaned);
        }
        catch {
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
export function readAndCombineJsons(dir) {
    const combined = {};
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
                let json = parseJsonWithOptionalRepair(fileContent, file);
                if (isPlainObject(json) && 'Tokens' in json && isPlainObject(json.Tokens)) {
                    json = json.Tokens;
                }
                if (isPlainObject(json)) {
                    delete json['$schema'];
                    delete json['Translations'];
                }
                const name = path.basename(file, '.json');
                combined[name] = json;
            }
            catch (err) {
                console.error(`❌ Error crítico al leer/parsear ${file}:`, err);
                throw new Error(`Fallo en ingesta de ${file}`);
            }
        }
    }
    return combined;
}
