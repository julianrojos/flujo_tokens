/**
 * CLI entrypoint for the CSS variables generator.
 *
 * Orchestrates the pipeline: ingest → index → analyze → emit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Types
import type { TokenValue, CssVarOwner, CssVarCollision } from '../types/tokens.js';

// Runtime
import { resetRuntimeState } from '../runtime/state.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';

// Utils
import { toKebabCase } from '../utils/strings.js';
import { printExecutionSummary, logChangeDetection } from '../utils/reporting.js';

// Core
import { readAndCombineJsons } from '../core/ingest.js';
import { collectTokenMaps } from '../core/indexing.js';
import { buildCycleStatus } from '../core/analyze.js';
import { flattenTokens, buildEmittableKeySet } from '../core/emit.js';
import { readCssVariablesFromFile, formatCssSectionHeader } from '../core/css.js';

// --- Path configuration & arg parsing ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type CliOptions = {
    inputDir: string;
    outputFile: string;
    help: boolean;
    mode?: string;
    modeStrict: boolean;
    modeSkipBase: boolean;
};

function printUsage(): void {
    console.log(`Usage: npm run generate -- [options]

Options:
  -h, --help           Show this help and exit
  -i, --input <dir>    Directory with token JSON files (default: ./input)
  -o, --output <file>  Output CSS file (default: ./output/custom-properties.css)
  -m, --mode <name>    Preferred mode branch (default: light)
      --mode-strict    Fail if preferred mode is missing in any node
      --mode-loose     Allow fallback to available mode if preferred is missing (default)
      --mode-emit-base Emit base $value even when a mode branch is selected (default: skip base)
`);
}

function parseArgs(argv: string[]): CliOptions | null {
    let inputDir = path.resolve(__dirname, '../../input');
    let outputFile = path.resolve(__dirname, '../../output/custom-properties.css');
    let help = false;
    let mode: string | undefined;
    let modeStrict = false;
    let modeSkipBase = true;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-h' || arg === '--help') {
            help = true;
            continue;
        }

        if (arg === '-i' || arg === '--input') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --input');
                return null;
            }
            inputDir = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '-o' || arg === '--output') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --output');
                return null;
            }
            outputFile = path.resolve(process.cwd(), argv[i + 1]);
            i++;
            continue;
        }

        if (arg === '-m' || arg === '--mode') {
            if (!argv[i + 1]) {
                console.error('❌ Missing value for --mode');
                return null;
            }
            mode = argv[i + 1];
            i++;
            continue;
        }

        if (arg === '--mode-strict') {
            modeStrict = true;
            continue;
        }

        if (arg === '--mode-loose') {
            modeStrict = false;
            continue;
        }

        if (arg === '--mode-emit-base') {
            modeSkipBase = false;
            continue;
        }

        console.error(`❌ Unknown argument: ${arg}`);
        return null;
    }

    return { inputDir, outputFile, help, mode, modeStrict, modeSkipBase };
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed) {
    printUsage();
    process.exit(1);
}

if (parsed.help) {
    printUsage();
    process.exit(0);
}

const JSON_DIR = parsed.inputDir;
const OUTPUT_FILE = parsed.outputFile;
const PREFERRED_MODE = parsed.mode?.trim() || 'light';
const MODE_STRICT = parsed.modeStrict;
const MODE_SKIP_BASE = parsed.modeSkipBase;

// --- Main execution ---

async function main() {
    // Reset runtime state for clean execution (important for watch mode/tests).
    resetRuntimeState();

    const summary = createSummary();

    console.log('📖 Reading JSON files...');
    let combinedTokens;
    try {
        combinedTokens = readAndCombineJsons(JSON_DIR);
    } catch (e) {
        console.error('❌ Ingestion failed. Aborting.');
        process.exit(1);
    }

    const fileCount = Object.keys(combinedTokens).length;
    console.log(`📂 ${fileCount} JSON ${fileCount === 1 ? 'file' : 'files'} loaded from ${JSON_DIR}`);

    const fileEntries = Object.entries(combinedTokens).map(([name, content]) => ({
        originalName: name,
        kebabName: toKebabCase(name),
        content
    }));

    if (fileEntries.length === 0) {
        console.error(`❌ No JSON files found in ${JSON_DIR}. Nothing to generate.`);
        process.exit(1);
    }

    console.log('🔄 Transforming to CSS variables...');
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
            console.log(`📄 Previous CSS file found with ${previousVariables.size} variables`);
        } catch {
            console.warn('⚠️  Could not read previous CSS file (creating a new one)');
        }
    }

    // Phase 1: indexing (maps, collisions, alias indices).
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
        collectTokenMaps(indexingCtx, content, [kebabName], [originalName], PREFERRED_MODE, MODE_STRICT, MODE_SKIP_BASE);
    }

    const cycleStatus = buildCycleStatus(indexingCtx);
    const emittableKeys = buildEmittableKeySet(indexingCtx);

    // Phase 2: emission (deterministic CSS output).
    const processingCtx = createProcessingContext({
        summary,
        tokensData: combinedTokens,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        idToTokenKey,
        cycleStatus,
        emittableKeys,
        cssVarNameOwners,
        cssVarNameCollisionMap
    });

    for (const { originalName, kebabName, content } of fileEntries) {
        // Avoid orphan section headers: keep the header only if something was emitted.
        const startLen = cssLines.length;

        if (cssLines.length > 0) cssLines.push('');
        cssLines.push(formatCssSectionHeader(originalName));

        flattenTokens(processingCtx, content, [kebabName], cssLines, [originalName], PREFERRED_MODE, MODE_STRICT, MODE_SKIP_BASE);

        const expectedLenIfEmpty = startLen + (startLen > 0 ? 2 : 1);
        if (cssLines.length === expectedLenIfEmpty) {
            cssLines.pop(); // header
            if (startLen > 0) cssLines.pop(); // blank line
        }
    }

    console.log('📝 Writing CSS file...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;

    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
        const outputLabel = path.relative(process.cwd(), OUTPUT_FILE) || OUTPUT_FILE;
        console.log(`\n✅ ${outputLabel} completely regenerated`);
    } catch (err) {
        console.error(`❌ Could not write ${OUTPUT_FILE}:`, err);
        process.exit(1);
    }

    printExecutionSummary(summary);

    if (previousVariables.size > 0) {
        logChangeDetection(previousVariables, cssLines);
    }

    console.log(`\n📝 File saved to: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('❌ Error generating CSS variables:');
    if (err instanceof Error) {
        console.error(`   ${err.message}`);
        if (err.stack) console.error(`   ${err.stack}`);
    } else {
        console.error(err);
    }
    process.exit(1);
});
