/**
 * Path key utilities for token resolution.
 */

import { refCanonicalCache } from '../runtime/state.js';
import { isModeKey } from '../types/tokens.js';

export function pathStr(currentPath: string[]): string {
    return currentPath.join('.');
}

export function normalizeDots(pathKey: string): string {
    return pathKey.replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * Builds the canonical dotted token key used for indexing and resolution.
 * Mode segments are excluded so token identities remain stable across modes.
 *
 * `startIndex` avoids allocating `segments.slice(...)` in hot paths.
 */
export function buildPathKey(segments: string[], startIndex = 0): string {
    let out = '';
    let first = true;

    for (let i = startIndex; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg || isModeKey(seg)) continue;

        const cleaned = seg.replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
        if (!cleaned) continue;

        if (!first) out += '.';
        out += cleaned;
        first = false;
    }

    return normalizeDots(out);
}

/**
 * Case-insensitive normalization used for indexing and lookups.
 * Normalized keys can be marked as ambiguous via `collisionKeys`.
 */
export function normalizePathKey(pathKey: string): string {
    return pathKey.toLowerCase();
}

/**
 * Parses and normalizes a W3C reference payload (e.g., `{token.path}`) into a lookup key.
 * Results are memoized for the duration of the run.
 */
export function canonicalizeRefPath(pathKey: string): string {
    if (refCanonicalCache.has(pathKey)) return refCanonicalCache.get(pathKey)!;

    const dotted = pathKey.trim().replace(/[\\/]+/g, '.').replace(/\s+/g, '.');
    const result = normalizeDots(dotted);

    refCanonicalCache.set(pathKey, result);
    return result;
}

/**
 * Creates the initial visited set for cycle detection.
 * The normalized key matches the resolution strategy used elsewhere in the script.
 */
export function buildVisitedRefSet(currentPath: string[]): ReadonlySet<string> {
    const normalized = normalizePathKey(buildPathKey(currentPath));
    return normalized ? new Set([normalized]) : new Set<string>();
}
