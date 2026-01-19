/**
 * CLI entrypoint for the CSS variables generator.
 *
 * Orchestrates the pipeline: ingest → index → analyze → emit
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { flattenTokens } from '../core/emit.js';
import { readCssVariablesFromFile, formatCssSectionHeader } from '../core/css.js';
// --- Path configuration ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_DIR = path.resolve(__dirname, '../../input');
const OUTPUT_FILE = path.resolve(__dirname, '../../output/custom-properties.css');
// --- Logging helpers ---
function logChangeDetection(previousVariables, cssLines) {
    console.log('\n----------------------------------------');
    console.log('            CAMBIOS DETECTADOS          ');
    console.log('----------------------------------------');
    const newVariables = new Map();
    for (const line of cssLines) {
        const match = CSS_DECL_LINE_REGEX.exec(line);
        if (match && match[1] && match[2] !== undefined) {
            newVariables.set(match[1], match[2].trim());
        }
    }
    const removed = [];
    const added = [];
    const modified = [];
    previousVariables.forEach((_value, name) => {
        if (!newVariables.has(name))
            removed.push(name);
    });
    newVariables.forEach((value, name) => {
        if (!previousVariables.has(name)) {
            added.push(name);
            return;
        }
        const oldValue = previousVariables.get(name);
        if (oldValue !== value)
            modified.push({ name, oldValue: oldValue || '', newValue: value });
    });
    if (removed.length > 0) {
        console.log(`   🗑️  Variables eliminadas: ${removed.length}`);
        removed.slice(0, 5).forEach(name => console.log(`      - --${name}`));
        if (removed.length > 5)
            console.log(`      ...`);
    }
    if (added.length > 0) {
        console.log(`   ➕ Variables añadidas: ${added.length}`);
        added.slice(0, 5).forEach(name => console.log(`      + --${name}`));
        if (added.length > 5)
            console.log(`      ...`);
    }
    if (modified.length > 0) {
        console.log(`   🔄 Variables modificadas: ${modified.length}`);
        modified.slice(0, 5).forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ --${name}`);
            console.log(`        - ${oldValue} -> ${newValue}`);
        });
        if (modified.length > 5)
            console.log(`      ...`);
    }
    if (removed.length === 0 && added.length === 0 && modified.length === 0) {
        console.log(`   ✓ Sin cambios significativos`);
    }
}
function printExecutionSummary(summary) {
    console.log('\n========================================');
    console.log('       RESUMEN DE EJECUCIÓN      ');
    console.log('========================================');
    console.log(`Total Tokens:        ${summary.totalTokens}`);
    console.log(`Generados:           ${summary.successCount}`);
    console.log(`Dependencias Circ.:  ${summary.circularDeps}`);
    console.log(`Colisiones CSS Var:  ${summary.cssVarNameCollisions}`);
    console.log(`Refs no resueltas:   ${summary.unresolvedRefs.length}`);
    console.log(`Nombres inválidos:   ${summary.invalidNames.length}`);
    console.log(`Límite profundidad:  ${summary.depthLimitHits}`);
    console.log('========================================');
    if (summary.unresolvedRefs.length > 0) {
        console.log(`\n⚠️  Detalle de Referencias No Resueltas (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.unresolvedRefs.slice(0, MAX_SUMMARY_DETAILS).forEach(ref => console.log(`  - ${ref}`));
        if (summary.unresolvedRefs.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... y ${summary.unresolvedRefs.length - MAX_SUMMARY_DETAILS} más`);
        }
    }
    if (summary.invalidNames.length > 0) {
        console.log(`\n⚠️  Detalle de Nombres Inválidos (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.invalidNames.slice(0, MAX_SUMMARY_DETAILS).forEach(name => console.log(`  - ${name}`));
        if (summary.invalidNames.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... y ${summary.invalidNames.length - MAX_SUMMARY_DETAILS} más`);
        }
    }
    if (summary.cssVarNameCollisionDetails.length > 0) {
        console.log(`\n⚠️  Detalle de Colisiones CSS Var (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.cssVarNameCollisionDetails.slice(0, MAX_SUMMARY_DETAILS).forEach(d => console.log(`  - ${d}`));
        if (summary.cssVarNameCollisionDetails.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... y ${summary.cssVarNameCollisionDetails.length - MAX_SUMMARY_DETAILS} más`);
        }
    }
}
// --- Main execution ---
async function main() {
    // Reset runtime state for clean execution (important for watch mode/tests).
    resetRuntimeState();
    const summary = createSummary();
    console.log('📖 Leyendo archivos JSON...');
    const combinedTokens = readAndCombineJsons(JSON_DIR);
    const fileEntries = Object.entries(combinedTokens).map(([name, content]) => ({
        originalName: name,
        kebabName: toKebabCase(name),
        content
    }));
    console.log('🔄 Transformando a variables CSS...');
    const cssLines = [];
    const refMap = new Map();
    const valueMap = new Map();
    const collisionKeys = new Set();
    const idToVarName = new Map();
    const idToTokenKey = new Map();
    const cssVarNameOwners = new Map();
    const cssVarNameCollisionMap = new Map();
    let previousVariables = new Map();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            previousVariables = readCssVariablesFromFile(OUTPUT_FILE);
            console.log(`📄 Archivo CSS anterior encontrado con ${previousVariables.size} variables`);
        }
        catch {
            console.warn('⚠️  No se pudo leer el archivo CSS anterior (se creará uno nuevo)');
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
        cssVarNameOwners,
        cssVarNameCollisionMap
    });
    for (const { originalName, kebabName, content } of fileEntries) {
        // Avoid orphan section headers: keep the header only if something was emitted.
        const startLen = cssLines.length;
        if (cssLines.length > 0)
            cssLines.push('');
        cssLines.push(formatCssSectionHeader(originalName));
        flattenTokens(processingCtx, content, [kebabName], cssLines, [originalName]);
        const expectedLenIfEmpty = startLen + (startLen > 0 ? 2 : 1);
        if (cssLines.length === expectedLenIfEmpty) {
            cssLines.pop(); // header
            if (startLen > 0)
                cssLines.pop(); // blank line
        }
    }
    console.log('📝 Escribiendo archivo CSS...');
    const finalCss = `:root {\n${cssLines.join('\n')}\n}\n`;
    const destDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    try {
        fs.writeFileSync(OUTPUT_FILE, finalCss, 'utf-8');
        console.log(`\n✅ Archivo custom-properties.css regenerado completamente`);
    }
    catch (err) {
        console.error(`❌ No se pudo escribir ${OUTPUT_FILE}:`, err);
        process.exit(1);
    }
    printExecutionSummary(summary);
    if (previousVariables.size > 0) {
        logChangeDetection(previousVariables, cssLines);
    }
    console.log(`\n📝 Archivo guardado en: ${OUTPUT_FILE}`);
}
main().catch(err => {
    console.error('❌ Error al generar variables CSS:');
    if (err instanceof Error) {
        console.error(`   ${err.message}`);
        if (err.stack)
            console.error(`   ${err.stack}`);
    }
    else {
        console.error(err);
    }
    process.exit(1);
});
