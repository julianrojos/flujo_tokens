/**
 * Reporting helpers shared by CLI and core.
 */

import type { ExecutionSummary } from '../types/tokens.js';
import { MAX_SUMMARY_DETAILS } from '../runtime/config.js';

/**
 * Prints a human-friendly execution summary with optional detail sections.
 */
export function printExecutionSummary(summary: ExecutionSummary): void {
    console.log('\n========================================');
    console.log(' EXECUTION SUMMARY         ');
    console.log('========================================');
    console.log(`Total Tokens (unique): ${summary.totalTokens}`);
    console.log(`Generated (unique):    ${summary.successCount}`);
    console.log(`Circular Deps:       ${summary.circularDeps}`);
    console.log(`CSS Var Collisions:  ${summary.cssVarNameCollisions}`);
    console.log(`Unresolved Refs:     ${summary.unresolvedRefs.length}`);
    console.log(`Invalid Names:       ${summary.invalidNames.length}`);
    console.log(`Invalid Tokens:      ${summary.invalidTokens.length}`);
    console.log(`Depth Limit Hits:    ${summary.depthLimitHits}`);
    console.log('========================================');

    const typeEntries = Object.entries(summary.tokenTypeCounts);
    if (typeEntries.length > 0) {
        console.log('\nToken Types:');
        typeEntries
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([type, count]) => {
                console.log(`  - ${type}: ${count}`);
            });
    }

    if (summary.cssVarNameCollisions > 0) {
        console.log('\n🚨 ATTENTION: CSS VARIABLE NAME COLLISIONS DETECTED');
        console.log(
            `   ${summary.cssVarNameCollisions} colliding name${summary.cssVarNameCollisions === 1 ? '' : 's'} found.`
        );
        console.log('   CSS uses last-write-wins, so token values may be overridden unexpectedly.');
        if (summary.cssVarNameCollisionDetails.length > 0) {
            console.log(`   Examples (Top ${MAX_SUMMARY_DETAILS}):`);
            summary.cssVarNameCollisionDetails.slice(0, MAX_SUMMARY_DETAILS).forEach(name => console.log(`   - ${name}`));
            if (summary.cssVarNameCollisions > summary.cssVarNameCollisionDetails.length) {
                const more = summary.cssVarNameCollisions - summary.cssVarNameCollisionDetails.length;
                console.log(`   ... and ${more} more`);
            }
        }
    }

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

    if (summary.invalidTokens.length > 0) {
        console.log(`\n❌ Invalid Tokens Detail (Top ${MAX_SUMMARY_DETAILS}):`);
        summary.invalidTokens.slice(0, MAX_SUMMARY_DETAILS).forEach(t => console.log(`  - ${t}`));
        if (summary.invalidTokens.length > MAX_SUMMARY_DETAILS) {
            console.log(`  ... and ${summary.invalidTokens.length - MAX_SUMMARY_DETAILS} more`);
        }
    }
}

/**
 * Prints a diff-style change detection summary between previous and current CSS outputs.
 */
export type ModeContext = {
    preferredMode?: string;
    foundModes?: Set<string>; // legacy alias of detectedModes
    detectedModes?: Set<string>;
    emittedModes?: Set<string>;
    modeStrict?: boolean;
};

function stripModePrefix(key: string): string {
    if (!key) return key;
    const trimmed = key.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('mode')) return trimmed;
    return trimmed.slice(4).replace(/^[-_\s]+/, '') || trimmed;
}

function sortedModeLabels(modeKeys?: Set<string>): string[] {
    if (!modeKeys || modeKeys.size === 0) return [];
    return Array.from(modeKeys)
        .map(stripModePrefix)
        .sort((a, b) => a.localeCompare(b));
}

export function logChangeDetection(
    previousVariables: Map<string, string>,
    newVariables: Map<string, string>,
    modeContext?: ModeContext
): void {
    console.log('\n----------------------------------------');
    console.log('            CHANGES DETECTED            ');
    console.log('----------------------------------------');

    const detectedModes = sortedModeLabels(modeContext?.detectedModes ?? modeContext?.foundModes);
    const emittedModes = sortedModeLabels(modeContext?.emittedModes);

    if (detectedModes.length > 0 || emittedModes.length > 0) {
        const preferred = modeContext.preferredMode ?? '<none>';
        const strictLabel = modeContext.modeStrict ? 'strict' : 'loose';
        const details: string[] = [];
        if (emittedModes.length > 0) details.push(`emitted=${emittedModes.join(', ')}`);
        if (detectedModes.length > 0 && (emittedModes.length === 0 || detectedModes.join('|') !== emittedModes.join('|'))) {
            details.push(`detected=${detectedModes.join(', ')}`);
        }
        console.log(`Mode context: preferred=${preferred} (${strictLabel})${details.length > 0 ? `, ${details.join(', ')}` : ''}`);
    }

    const removed: string[] = [];
    const added: string[] = [];
    const modified: Array<{ name: string; oldValue: string; newValue: string }> = [];
    const formatScopedVar = (key: string): string => {
        const separatorIndex = key.indexOf('::');
        if (separatorIndex === -1) {
            return key.startsWith('--') ? key : `--${key}`;
        }
        const scope = key.slice(0, separatorIndex);
        const rawName = key.slice(separatorIndex + 2);
        const normalizedName = rawName.startsWith('--') ? rawName : `--${rawName}`;
        return `${scope} ${normalizedName}`;
    };

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
        removed.slice(0, 5).forEach(name => console.log(`      - ${formatScopedVar(name)}`));
        if (removed.length > 5) console.log(`      ...`);
    }

    if (added.length > 0) {
        console.log(`   ➕ Variables added: ${added.length}`);
        added.slice(0, 5).forEach(name => console.log(`      + ${formatScopedVar(name)}`));
        if (added.length > 5) console.log(`      ...`);
    }

    if (modified.length > 0) {
        console.log(`   🔄 Variables modified: ${modified.length}`);
        modified.slice(0, 5).forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ ${formatScopedVar(name)}`);
            console.log(`        - ${oldValue} -> ${newValue}`);
        });
        if (modified.length > 5) console.log(`      ...`);
    }

    if (removed.length === 0 && added.length === 0 && modified.length === 0) {
        console.log(`   ✓ No changes (0 added, 0 modified, 0 removed)`);
    }
}

/**
 * Prints a summary of mode branches encountered during processing.
 */
export function printModeSummary(modeKeys: Set<string>, label: 'detected' | 'emitted' = 'detected'): void {
    console.log(`\nModes ${label}:`);
    if (modeKeys.size === 0) {
        console.log('  - None');
        return;
    }

    const sorted = sortedModeLabels(modeKeys);
    console.log(`  - Count: ${modeKeys.size}`);
    console.log(`  - Names: ${sorted.join(', ')}`);
}

/**
 * Prints a summary of mode fallbacks when a preferred mode is missing.
 */
export function printModeFallbackSummary(fallbacks: Map<string, number>, examples: Map<string, string[]>): void {
    if (fallbacks.size === 0) return;
    console.log('\nMode fallbacks:');
    const entries = Array.from(fallbacks.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [mode, count] of entries) {
        console.log(`  - Preferred "${mode}" missing in ${count} node${count === 1 ? '' : 's'} (used available mode)`);
        const sample = examples.get(mode);
        if (sample && sample.length > 0) {
            console.log(`    e.g.: ${sample.join(', ')}`);
        }
    }
}
