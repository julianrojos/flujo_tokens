/**
 * Scoped Write Guard Service
 *
 * Prevents unauthorized file mutations by tracking changes within specific directories
 * and files, and asserting that only allowed paths were modified.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { captureFileSnapshot, restoreFileSnapshot } from '../utils/index.js';
import type { FileSnapshot } from '../utils/index.js';

function resolveUniquePaths(paths: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of paths || []) {
        if (!item) continue;
        const resolved = path.resolve(item);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        result.push(resolved);
    }
    return result;
}

function normalizeExtensions(extensions: string[]): Set<string> {
    const normalized = new Set<string>();
    for (const extension of extensions || []) {
        if (!extension) continue;
        const raw = String(extension).trim();
        if (!raw) continue;
        normalized.add(raw.startsWith('.') ? raw.toLowerCase() : `.${raw.toLowerCase()}`);
    }
    return normalized;
}

/**
 * Normalize optional basename prefixes used to filter tracked files.
 */
function normalizeFileNamePrefixes(prefixes: string[]): string[] {
    const normalized: string[] = [];
    for (const prefix of prefixes || []) {
        const value = String(prefix || '').trim();
        if (!value) continue;
        normalized.push(value);
    }
    return normalized;
}

/**
 * Normalize optional depth limit for directory traversal.
 * Returns null when no limit should be applied.
 */
function normalizeMaxDepth(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const integerDepth = Math.floor(parsed);
    return integerDepth >= 0 ? integerDepth : null;
}

type AllowedPathPrefixMatcher = {
    mode: 'path' | 'literal';
    prefix: string;
};

/**
 * Normalize configured allowed path prefixes into matchers.
 * Use `*` suffix to enable literal prefix mode.
 */
function normalizeAllowedPathPrefixes(prefixes: string[]): AllowedPathPrefixMatcher[] {
    const normalized: AllowedPathPrefixMatcher[] = [];
    for (const rawPrefix of prefixes || []) {
        const value = String(rawPrefix || '').trim();
        if (!value) continue;
        const isLiteralPrefix = value.endsWith('*');
        const normalizedValue = isLiteralPrefix ? value.slice(0, -1) : value;
        if (!normalizedValue) {
            throw new Error(`Invalid allowedPathPrefix "${value}": prefix cannot be empty.`);
        }
        normalized.push({
            mode: isLiteralPrefix ? 'literal' : 'path',
            prefix: path.resolve(normalizedValue),
        });
    }
    return normalized;
}

/**
 * Evaluate whether a tracked path matches an allowed prefix matcher.
 */
function matchesAllowedPathPrefix(trackedPath: string, matcher: AllowedPathPrefixMatcher): boolean {
    if (matcher.mode === 'literal') {
        return trackedPath.startsWith(matcher.prefix);
    }
    return trackedPath === matcher.prefix || trackedPath.startsWith(`${matcher.prefix}${path.sep}`);
}

function shouldTrackFile(
    filePath: string,
    extensionSet: Set<string>,
    fileNamePrefixes: readonly string[],
): boolean {
    if (extensionSet.size === 0) return true;
    if (!extensionSet.has(path.extname(filePath).toLowerCase())) return false;
    if (!fileNamePrefixes || fileNamePrefixes.length === 0) return true;
    const fileName = path.basename(filePath);
    return fileNamePrefixes.some((prefix) => fileName.startsWith(prefix));
}

function walkTrackedFiles(
    dirPath: string,
    extensionSet: Set<string>,
    fileNamePrefixes: readonly string[],
    maxDepth: number | null,
    currentDepth: number,
    sink: Set<string>,
): void {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (maxDepth !== null && currentDepth >= maxDepth) {
                continue;
            }
            walkTrackedFiles(fullPath, extensionSet, fileNamePrefixes, maxDepth, currentDepth + 1, sink);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!shouldTrackFile(fullPath, extensionSet, fileNamePrefixes)) continue;
        sink.add(path.resolve(fullPath));
    }
}

export interface ScopedWriteSnapshot {
    directories: string[];
    files: string[];
    extensions: string[];
    fileNamePrefixes: string[];
    maxDepth?: number | null;
    entries: Map<string, FileSnapshot>;
}

/**
 * Captures a snapshot of all tracked files in the given scopes.
 */
export function captureScopedWriteSnapshot(options: {
    directories?: string[];
    files?: string[];
    extensions?: string[];
    fileNamePrefixes?: string[];
    maxDepth?: number;
}): ScopedWriteSnapshot {
    const { directories = [], files = [], extensions = [], fileNamePrefixes = [], maxDepth = null } = options;
    const trackedDirectories = resolveUniquePaths(directories);
    const trackedFiles = resolveUniquePaths(files);
    const extensionSet = normalizeExtensions(extensions);
    const normalizedFileNamePrefixes = normalizeFileNamePrefixes(fileNamePrefixes);
    const normalizedMaxDepth = normalizeMaxDepth(maxDepth);
    const trackedPathSet = new Set(trackedFiles);

    for (const directory of trackedDirectories) {
        walkTrackedFiles(directory, extensionSet, normalizedFileNamePrefixes, normalizedMaxDepth, 0, trackedPathSet);
    }

    const entries = new Map<string, FileSnapshot>();
    for (const trackedPath of trackedPathSet) {
        entries.set(trackedPath, captureFileSnapshot(trackedPath));
    }

    return {
        directories: trackedDirectories,
        files: trackedFiles,
        extensions: [...extensionSet],
        fileNamePrefixes: normalizedFileNamePrefixes,
        maxDepth: normalizedMaxDepth,
        entries,
    };
}

export interface FileChange {
    path: string;
    changeType: 'added' | 'deleted' | 'modified';
    beforeSnapshot: FileSnapshot;
    afterSnapshot: FileSnapshot;
}

function detectChangeType(beforeSnapshot: FileSnapshot, afterSnapshot: FileSnapshot): FileChange['changeType'] {
    if (!beforeSnapshot.exists && afterSnapshot.exists) return 'added';
    if (beforeSnapshot.exists && !afterSnapshot.exists) return 'deleted';
    return 'modified';
}

function collectCurrentTrackedPaths(snapshot: ScopedWriteSnapshot): Set<string> {
    const extensionSet = normalizeExtensions(snapshot.extensions || []);
    const fileNamePrefixes = normalizeFileNamePrefixes(snapshot.fileNamePrefixes || []);
    const maxDepth = normalizeMaxDepth(snapshot.maxDepth);
    const trackedPathSet = new Set(resolveUniquePaths(snapshot.files || []));

    for (const directory of resolveUniquePaths(snapshot.directories || [])) {
        walkTrackedFiles(directory, extensionSet, fileNamePrefixes, maxDepth, 0, trackedPathSet);
    }

    return trackedPathSet;
}

function buildChangeRecord(filePath: string, beforeSnapshot: FileSnapshot): FileChange | null {
    const afterSnapshot = captureFileSnapshot(filePath);
    if (beforeSnapshot.exists === afterSnapshot.exists) {
        if (!beforeSnapshot.exists) return null;
        if (beforeSnapshot.content === afterSnapshot.content) return null;
    }

    return {
        path: filePath,
        changeType: detectChangeType(beforeSnapshot, afterSnapshot),
        beforeSnapshot,
        afterSnapshot,
    };
}

function formatChange(change: FileChange): string {
    return `- ${change.changeType}: ${change.path}`;
}

/**
 * Asserts that only allowed files were modified since the snapshot.
 * Automatically restores unauthorized changes.
 */
export function assertScopedWritePolicy(options: {
    snapshot: ScopedWriteSnapshot;
    allowedPaths?: string[];
    // Prefix semantics:
    // - "<absolute-path>"   => path boundary mode (exact path or children)
    // - "<absolute-prefix>*" => literal startsWith mode
    allowedPathPrefixes?: string[];
    label?: string;
}): void {
    const { snapshot, allowedPaths = [], allowedPathPrefixes = [], label = 'scoped write' } = options;
    const allowed = new Set(resolveUniquePaths(allowedPaths));
    let allowedPrefixes: AllowedPathPrefixMatcher[] = [];
    let invalidPrefixConfigError: Error | null = null;
    try {
        allowedPrefixes = normalizeAllowedPathPrefixes(allowedPathPrefixes);
    } catch (error) {
        invalidPrefixConfigError = error instanceof Error ? error : new Error(String(error));
    }
    const currentTrackedPaths = collectCurrentTrackedPaths(snapshot);
    const allTrackedPaths = new Set([...snapshot.entries.keys(), ...currentTrackedPaths]);

    const violations: FileChange[] = [];
    for (const trackedPath of allTrackedPaths) {
        const beforeSnapshot = snapshot.entries.get(trackedPath) || { exists: false, content: '' };
        const change = buildChangeRecord(trackedPath, beforeSnapshot);
        if (!change) continue;
        if (allowed.has(trackedPath)) continue;
        if (allowedPrefixes.some((matcher) => matchesAllowedPathPrefix(trackedPath, matcher))) continue;
        violations.push(change);
    }

    if (violations.length === 0) {
        if (invalidPrefixConfigError) {
            throw new Error(
                `Invalid allowedPathPrefixes configuration detected during ${label}: ` +
                `${invalidPrefixConfigError.message}`,
            );
        }
        return;
    }

    for (const violation of violations) {
        restoreFileSnapshot(violation.path, violation.beforeSnapshot);
    }

    const details = violations.map((item) => formatChange(item)).join('\n');
    const prefixConfigDetails = invalidPrefixConfigError
        ? `\nAdditionally, allowedPathPrefixes is invalid: ${invalidPrefixConfigError.message}`
        : '';
    throw new Error(
        `Unexpected file mutations detected during ${label}. ` +
        'Only target files and generated indices are allowed to change.\n' +
        `${details}${prefixConfigDetails}`,
    );
}
