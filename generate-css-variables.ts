import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const JSON_DIR = path.resolve(__dirname, 'FigmaJsons');
const OUTPUT_FILE = path.resolve(__dirname, 'src/variables.css');

// --- Helper Functions ---

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
                const content = fs.readFileSync(filePath, 'utf-8');
                const json = JSON.parse(content);
                const name = path.basename(file, '.json');
                combined[name] = json;
            } catch (err) {
                console.error(`Error reading/parsing ${file}:`, err);
            }
        }
    }
    return combined;
}

/**
 * Transforms a W3C Design Token value to a CSS variable value.
 * Handles alias replacement e.g., "{Colorprimitives.neutral.0}" -> "var(--Colorprimitives-neutral-0)"
 */
function transformValue(value: string): string {
    if (typeof value !== 'string') return value;

    // Regex to find aliases like {collection.group.token}
    return value.replace(/\{([^}]+)\}/g, (match, aliasContent) => {
        // Replace dots with dashes in the alias path to match CSS variable naming convention
        const cssVarName = aliasContent.replace(/\./g, '-');
        return `var(--${cssVarName})`;
    });
}

/**
 * Recursive function to flatten the token object into CSS variables.
 */
function flattenTokens(
    obj: any,
    prefix: string[] = [],
    collectedVars: string[] = []
): string[] {

    // 1. Check if this node is a Token (has $value)
    if (obj && typeof obj === 'object' && '$value' in obj) {
        // Resolve value
        const rawValue = obj['$value'];
        const resolvedValue = transformValue(rawValue);

        // Construct CSS variable name
        // Filter out empty parts and join with hyphens
        const varName = `--${prefix.filter(p => p).join('-')}`;

        collectedVars.push(`  ${varName}: ${resolvedValue};`);
        return collectedVars;
    }

    // 2. Iterate keys
    for (const key in obj) {
        if (key.startsWith('$')) continue; // Skip metadata like $description, $type

        const value = obj[key];

        // 3. Handle Modes
        // If the key starts with 'mode', we treat it as a mode selector.
        // We prioritize 'modeDefault', otherwise we might take 'modeMode1' or just the first one we find.
        // We DO NOT add the mode key to the prefix.

        if (key.toLowerCase().startsWith('mode')) {
            // We only process ONE mode to avoid duplication of the same token for different modes in the same root file
            // (unless we wanted to generate classes for modes, but the request asks for 'variables.css', usually root)

            // Current Strategy:
            // If we are iterating and we see 'modeDefault', we go in.
            // If we see 'modeMode1', we only go in if 'modeDefault' is NOT present in the siblings.
            // To do this strictly, we should probably check keys of `obj` before iterating.

            // Let's refine the iteration:
            // proper iteration logic is below outside this loop.
            continue;
        }

        // Normal recursion
        flattenTokens(value, [...prefix, key], collectedVars);
    }

    // 4. Special Handling for Modes at the current level
    // If `obj` contains keys that look like modes, we intentionally pick one to traverse.
    const keys = Object.keys(obj);
    const modeDefault = keys.find(k => k === 'modeDefault');
    const modeAny = keys.find(k => k.toLowerCase().startsWith('mode')); // Fallback

    if (modeDefault) {
        // Traverse into modeDefault, NOT adding it to prefix
        flattenTokens(obj[modeDefault], prefix, collectedVars);
    } else if (modeAny) {
        // If no default, take the first mode found (e.g. modeMode1)
        flattenTokens(obj[modeAny], prefix, collectedVars);
    }

    return collectedVars;
}

// --- Main Execution ---

async function main() {
    console.log('Reading JSON files...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);

    console.log('Transforming to CSS variables...');
    const cssLines: string[] = [];

    // We iterate the top-level files (Colorprimitives, colors, etc.)
    for (const [fileName, fileContent] of Object.entries(combinedTokens)) {
        // We include the filename in the prefix (namespace)
        flattenTokens(fileContent, [fileName], cssLines);
    }

    console.log('Writing output...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;

    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
    console.log(`Successfully generated ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
