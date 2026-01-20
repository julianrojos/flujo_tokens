/**
 * Reporting helpers shared by CLI and core.
 */

import type { ExecutionSummary } from '../types/tokens.js';
import { MAX_SUMMARY_DETAILS } from '../runtime/config.js';
import { CSS_DECL_LINE_REGEX } from './regex.js';

/**
 * Prints a human-friendly execution summary with optional detail sections.
 */
export function printExecutionSummary(summary: ExecutionSummary): void {
    console.log('\n========================================');
    console.log(' EXECUTION SUMMARY         ');
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

    const typeEntries = Object.entries(summary.tokenTypeCounts);
    if (typeEntries.length > 0) {
        console.log('\nToken Types:');
        typeEntries
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([type, count]) => {
                console.log(`  - ${type}: ${count}`);
            });
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

/**
 * Prints a diff-style change detection summary between previous and current CSS outputs.
 */
export function logChangeDetection(previousVariables: Map<string, string>, cssLines: string[]): void {
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

/**
 * Prints a summary of mode branches encountered during processing.
 */
export function printModeSummary(modeKeys: Set<string>): void {
    console.log('\nModes detected:');
    if (modeKeys.size === 0) {
        console.log('  - None');
        return;
    }

    const stripModePrefix = (k: string): string => {
        if (!k) return k;
        const trimmed = k.trim();
        const lower = trimmed.toLowerCase();
        if (lower.startsWith('mode')) {
            return trimmed.slice(4).replace(/^[-_\s]+/, '') || trimmed;
        }
        return trimmed;
    };

    const sorted = Array.from(modeKeys)
        .map(stripModePrefix)
        .sort((a, b) => a.localeCompare(b));
    console.log(`  - Count: ${modeKeys.size}`);
    console.log(`  - Names: ${sorted.join(', ')}`);
}
