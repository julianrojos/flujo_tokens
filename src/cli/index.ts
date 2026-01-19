/**
 * CLI entrypoint for the CSS variables generator.
 *
 * Orchestrates the pipeline: ingest → index → analyze → emit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Types
import type { ExecutionSummary, TokenValue, CssVarOwner, CssVarCollision } from '../types/tokens.js';

// Runtime
import { resetRuntimeState } from '../runtime/state.js';
import { MAX_SUMMARY_DETAILS } from '../runtime/config.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';

// Utils
import { CSS_DECL_LINE_REGEX } from '../utils/regex.js';
import { toKebabCase } from '../utils/strings.js';

// Core
import { readAndCombineJsons } from '../core/ingest.js';
import { collectTokenMaps } from '../core/indexing.js';
import { buildCycleStatus } from '../core/analyze.js';
import { flattenTokens, buildEmittableKeySet } from '../core/emit.js';
import { readCssVariablesFromFile, formatCssSectionHeader } from '../core/css.js';

// --- Path configuration ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default paths
let jsonDir = path.resolve(__dirname, '../../input');
let outputFile = path.resolve(__dirname, '../../output/custom-properties.css');

// Simple parsing of --input and --output
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
        jsonDir = path.resolve(process.cwd(), args[i + 1]);
        i++;
    } else if (args[i] === '--output' && args[i + 1]) {
        outputFile = path.resolve(process.cwd(), args[i + 1]);
        i++;
    }
}

const JSON_DIR = jsonDir;
const OUTPUT_FILE = outputFile;

// --- Logging helpers ---

function logChangeDetection(previousVariables: Map<string, string>, cssLines: string[]): void {
    console.log('\n----------------------------------------');
    console.log('            CHANGES DETECTED            ');
    console.log('----------------------------------------');

    const newVariables = new Map<string, string>();
    for (const line of cssLines) {
        const match = CSS_DECL_LINE_REGEX.exec(line);
        if (match && match[1] && match[2] !== undefined) {
            newVariables.set(match[1], match[2].trim());
        }
    }

    const removed: string[] = [];
    const added: string[] = [];
    const modified: Array<{ name: string; oldValue: string; newValue: string }> = [];

    previousVariables.forEach((_value, name) => {
        if (!newVariables.has(name)) removed.push(name);
    });

    newVariables.forEach((value, name) => {
        if (!previousVariables.has(name)) {
            added.push(name);
            return;
        }
        const oldValue = previousVariables.get(name);
        if (oldValue !== value) modified.push({ name, oldValue: oldValue || '', newValue: value });
    });

    if (removed.length > 0) {
        console.log(`   🗑️  Variables removed: ${removed.length}`);
        removed.slice(0, 5).forEach(name => console.log(`      - --${name}`));
        if (removed.length > 5) console.log(`      ...`);
    }

    if (added.length > 0) {
        console.log(`   ➕ Variables added: ${added.length}`);
        added.slice(0, 5).forEach(name => console.log(`      + --${name}`));
        if (added.length > 5) console.log(`      ...`);
    }

    if (modified.length > 0) {
        console.log(`   🔄 Variables modified: ${modified.length}`);
        modified.slice(0, 5).forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ --${name}`);
            console.log(`        - ${oldValue} -> ${newValue}`);
        });
        if (modified.length > 5) console.log(`      ...`);
    }

    if (removed.length === 0 && added.length === 0 && modified.length === 0) {
        console.log(`   ✓ No changes (0 added, 0 modified, 0 removed)`);
    }
}

function printExecutionSummary(summary: ExecutionSummary): void {
    console.log('\n========================================');
    console.log('       EXECUTION SUMMARY         ');
    console.log('========================================');
    console.log(`Total Tokens:        ${summary.totalTokens}`);
    console.log(`Generated:           ${summary.successCount}`);
    console.log(`Circular Deps:       ${summary.circularDeps}`);
    console.log(`CSS Var Collisions:  ${summary.cssVarNameCollisions}`);
    console.log(`Unresolved Refs:     ${summary.unresolvedRefs.length}`);
    console.log(`Invalid Names:       ${summary.invalidNames.length}`);
    console.log(`Invalid Tokens:      ${summary.invalidTokens.length}`);
    console.log(`Depth Limit Hits:    ${summary.depthLimitHits}`);
    console.log('========================================');

    if (summary.unresolvedRefs.length > 0) {
        console.log(`\n⚠️  Unresolved Refs Detail (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.unresolvedRefs.slice(0, MAX_SUMMARY_DETAILS).forEach(ref => console.log(`  - ${ref}`));
        if (summary.unresolvedRefs.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... and ${summary.unresolvedRefs.length - MAX_SUMMARY_DETAILS} more`);
        }
    }

    if (summary.invalidNames.length > 0) {
        console.log(`\n⚠️  Invalid Names Detail (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.invalidNames.slice(0, MAX_SUMMARY_DETAILS).forEach(name => console.log(`  - ${name}`));
        if (summary.invalidNames.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... and ${summary.invalidNames.length - MAX_SUMMARY_DETAILS} more`);
        }
    }

    if (summary.cssVarNameCollisionDetails.length > 0) {
        console.log(`\n⚠️  CSS Var Collisions Detail (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.cssVarNameCollisionDetails.slice(0, MAX_SUMMARY_DETAILS).forEach(d => console.log(`  - ${d}`));
        if (summary.cssVarNameCollisionDetails.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... and ${summary.cssVarNameCollisionDetails.length - MAX_SUMMARY_DETAILS} more`);
        }
    }

    if (summary.invalidTokens.length > 0) {
        console.log(`\n❌ Invalid Tokens Detail (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.invalidTokens.slice(0, MAX_SUMMARY_DETAILS).forEach(t => console.log(`  - ${t}`));
        if (summary.invalidTokens.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... and ${summary.invalidTokens.length - MAX_SUMMARY_DETAILS} more`);
        }
    }
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

    const fileEntries = Object.entries(combinedTokens).map(([name, content]) => ({
        originalName: name,
        kebabName: toKebabCase(name),
        content
    }));

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
        collectTokenMaps(indexingCtx, content, [kebabName], [originalName]);
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

        flattenTokens(processingCtx, content, [kebabName], cssLines, [originalName]);

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
        console.log(`\n✅ custom-properties.css completely regenerated`);
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
