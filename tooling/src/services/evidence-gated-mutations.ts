/**
 * Evidence-Gated Mutations Service
 *
 * Implements policies to prevent overwriting known data with unknown/TBD values
 * unless explicit evidence is provided or bypasses are enabled.
 */

import { isPlainObject } from '../utils/index.js';

const UNKNOWN_STRING_MARKER = /^(?:tbd|unknown|unverified|not[-_\s]?defined|n\/a|na)$/i;

function isScalar(value: any): boolean {
    return (
        value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

function scalarToComparable(value: any): string {
    if (value === undefined) return '';
    if (value === null) return '';
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (typeof value === 'string') return value.trim();
    return String(value);
}

function isUnknownScalar(value: any): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return true;
        return UNKNOWN_STRING_MARKER.test(trimmed);
    }
    return false;
}

function pushPath(prefix: string, key: string | number): string {
    if (!prefix) return String(key);
    if (/^\[\d+\]$/.test(String(key))) return `${prefix}${key}`;
    return `${prefix}.${key}`;
}

function flattenScalars(node: any, prefix = '', output = new Map<string, any>()): Map<string, any> {
    if (isScalar(node)) {
        output.set(prefix || '$', node);
        return output;
    }

    if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index += 1) {
            flattenScalars(node[index], pushPath(prefix, `[${index}]`), output);
        }
        return output;
    }

    if (isPlainObject(node)) {
        for (const [key, value] of Object.entries(node)) {
            flattenScalars(value, pushPath(prefix, key), output);
        }
        return output;
    }

    output.set(prefix || '$', scalarToComparable(node));
    return output;
}

function isAllowedKnownToKnown(pathKey: string, allowedPrefixes: readonly string[]): boolean {
    for (const prefixRaw of allowedPrefixes || []) {
        const prefix = String(prefixRaw || '').trim();
        if (!prefix) continue;
        if (pathKey === prefix) return true;
        if (pathKey.startsWith(`${prefix}.`)) return true;
        if (pathKey.startsWith(`${prefix}[`)) return true;
    }
    return false;
}

export interface MutationViolation {
    kind: 'known_to_unknown' | 'non_evidence_update';
    path: string;
    before: any;
    after: any;
}

function formatViolation(violation: MutationViolation): string {
    return (
        `- [${violation.kind}] ${violation.path}: ` +
        `\`${scalarToComparable(violation.before)}\` -> \`${scalarToComparable(violation.after)}\``
    );
}

export interface AssertEvidenceGatedOptions {
    before: any;
    after: any;
    allowedKnownToKnownPrefixes?: readonly string[];
    label?: string;
}

/**
 * Asserts that changes between two objects follow the evidence-gated policy.
 */
export function assertEvidenceGatedScalarChanges(options: AssertEvidenceGatedOptions): void {
    const { before, after, allowedKnownToKnownPrefixes = [], label = 'document' } = options;
    const beforeMap = flattenScalars(before);
    const afterMap = flattenScalars(after);
    const allPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const violations: MutationViolation[] = [];

    for (const pathKey of allPaths) {
        const beforeValue = beforeMap.get(pathKey);
        const afterValue = afterMap.get(pathKey);
        const beforeComparable = scalarToComparable(beforeValue);
        const afterComparable = scalarToComparable(afterValue);
        if (beforeComparable === afterComparable) continue;

        const beforeUnknown = isUnknownScalar(beforeValue);
        const afterUnknown = isUnknownScalar(afterValue);

        if (!beforeUnknown && afterUnknown) {
            violations.push({
                kind: 'known_to_unknown',
                path: pathKey,
                before: beforeValue,
                after: afterValue,
            });
            continue;
        }

        if (!beforeUnknown && !afterUnknown) {
            if (!isAllowedKnownToKnown(pathKey, allowedKnownToKnownPrefixes)) {
                violations.push({
                    kind: 'non_evidence_update',
                    path: pathKey,
                    before: beforeValue,
                    after: afterValue,
                });
            }
        }
    }

    if (violations.length === 0) return;

    const details = violations.map((item) => formatViolation(item)).join('\n');
    throw new Error(
        `Evidence-gated mutation policy violation in ${label}.\n` +
        'Known values can only change with evidence-backed paths.\n' +
        `${details}`,
    );
}

export function readDocStatus(frontmatter: any): string {
    if (!isPlainObject(frontmatter)) return '';
    return String(frontmatter.doc_status || '').trim();
}

export interface AssertDocStatusStableOptions {
    beforeFrontmatter: any;
    afterFrontmatter: any;
    allowDocStatusChange?: boolean;
    label?: string;
}

/**
 * Asserts that doc_status remains stable unless allowed.
 */
export function assertDocStatusStable(options: AssertDocStatusStableOptions): void {
    const { beforeFrontmatter, afterFrontmatter, allowDocStatusChange = false, label = 'markdown frontmatter' } = options;
    if (allowDocStatusChange) return;
    const beforeStatus = readDocStatus(beforeFrontmatter);
    const afterStatus = readDocStatus(afterFrontmatter);
    if (!beforeStatus || !afterStatus || beforeStatus === afterStatus) return;

    throw new Error(
        `Evidence-gated mutation policy violation in ${label}: ` +
        `doc_status changed from \`${beforeStatus}\` to \`${afterStatus}\` without explicit override.`,
    );
}
