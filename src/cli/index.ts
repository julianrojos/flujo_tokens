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
import { printExecutionSummary, logChangeDetection, printModeSummary, printModeFallbackSummary } from '../utils/reporting.js';

// Core
import { readAndCombineJsons } from '../core/ingest.js';
import { collectTokenMaps } from '../core/indexing.js';
import { buildCycleStatus } from '../core/analyze.js';
import { flattenTokens, buildEmittableKeySet } from '../core/emit.js';
import { readCssVariablesFromFile, extractCssVariables, formatCssSectionHeader } from '../core/css.js';
import { foundModeKeys, modeFallbackCounts, modeFallbackExamples } from '../runtime/state.js';

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

type ModeScope = {
    selector: string;
    mode?: string;
    skipBaseWhenMode: boolean;
    modeOverridesOnly: boolean;
    allowModeBranches: boolean;
};

function printUsage(): void {
    console.log(`Usage: npm run generate -- [options]

Options:
  -h, --help           Show this help and exit
  -i, --input <dir>    Directory with token JSON files (default: ./input)
  -o, --output <file>  Output CSS file (default: ./output/custom-properties.css)
  -m, --mode <name>    Preferred mode branch (default: none; uses modeDefault or first mode)
      --mode-strict    Fail if preferred mode is missing in any node (default: off)
      --mode-loose     Allow fallback to available mode if preferred is missing (default: on)
      --mode-emit-base Emit base $value even when a mode branch is selected (default: skip)
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
const PREFERRED_MODE = parsed.mode?.trim() || undefined;
const MODE_STRICT = parsed.modeStrict;
const MODE_SKIP_BASE = parsed.modeSkipBase;

function normalizeModeName(modeKey: string | undefined): string {
    if (!modeKey) return '';
    const trimmed = modeKey.trim();
    return trimmed ? toKebabCase(trimmed) : '';
}

function formatModeLabel(modeKey: string | undefined): string {
    const normalized = normalizeModeName(modeKey);
    const withoutPrefix = normalized.replace(/^mode[-_]?/i, '');
    const label = withoutPrefix || normalized || (modeKey ?? '');
    return label.toUpperCase();
}

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
        content
    }));

    if (fileEntries.length === 0) {
        console.error(`❌ No JSON files found in ${JSON_DIR}. Nothing to generate.`);
        process.exit(1);
    }

    console.log('🔄 Transforming to CSS variables...');
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

    for (const { originalName, content } of fileEntries) {
        // Keep file name in currentPath for lookup/resolution, but do not include it in emitted CSS var names.
        collectTokenMaps(indexingCtx, content, [], [originalName], PREFERRED_MODE, MODE_STRICT, MODE_SKIP_BASE);
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

    const modeKeys = Array.from(foundModeKeys);
    const sortedModes = modeKeys.slice().sort((a, b) => normalizeModeName(a).localeCompare(normalizeModeName(b)));

    const scopes: ModeScope[] = [];
    // Base scope: emit only tokens without mode branches or with explicit base values.
    scopes.push({ selector: ':root', mode: undefined, skipBaseWhenMode: false, modeOverridesOnly: false, allowModeBranches: false });

    for (const modeKey of sortedModes) {
        const selectorValue = normalizeModeName(modeKey);
        const selector = `[data-theme="${selectorValue}"]`;
        scopes.push({ selector, mode: modeKey, skipBaseWhenMode: true, modeOverridesOnly: true, allowModeBranches: true });
    }

    const cssBlocks: string[] = [];

    for (const scope of scopes) {
        const scopedPrimitives: string[] = [];
        const scopedAliases: string[] = [];

        for (const { originalName, content } of fileEntries) {
            const { primitives, aliases } = flattenTokens(
                processingCtx,
                content,
                [],
                [originalName],
                scope.mode,
                MODE_STRICT,
                scope.skipBaseWhenMode,
                scope.modeOverridesOnly,
                scope.allowModeBranches
            );

            if (primitives.length > 0) {
                if (scopedPrimitives.length > 0) scopedPrimitives.push('');
                scopedPrimitives.push(formatCssSectionHeader(originalName));
                scopedPrimitives.push(...primitives);
            }

            if (aliases.length > 0) {
                if (scopedAliases.length > 0) scopedAliases.push('');
                scopedAliases.push(formatCssSectionHeader(originalName));
                scopedAliases.push(...aliases);
            }
        }

        const scopedLines: string[] = [];
        scopedLines.push(...scopedPrimitives);
        if (scopedPrimitives.length > 0 && scopedAliases.length > 0) scopedLines.push('');
        scopedLines.push(...scopedAliases);

        if (scopedLines.length === 0) continue;

        const modeLabel = scope.mode ? `/* ========== MODE ${formatModeLabel(scope.mode)} ========== */\n` : '';
        cssBlocks.push(`${modeLabel}${scope.selector} {\n${scopedLines.join('\n')}\n}`);
    }

    console.log('📝 Writing CSS file...');
    const finalCss = `${cssBlocks.join('\n\n')}\n`;

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
    printModeSummary(foundModeKeys);
    printModeFallbackSummary(modeFallbackCounts, modeFallbackExamples);

    if (previousVariables.size > 0) {
        const newVariables = extractCssVariables(finalCss);
        logChangeDetection(previousVariables, newVariables, {
            preferredMode: PREFERRED_MODE,
            foundModes: foundModeKeys,
            modeStrict: MODE_STRICT
        });
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
