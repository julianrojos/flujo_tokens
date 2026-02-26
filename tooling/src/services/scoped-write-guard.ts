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

function shouldTrackFile(filePath: string, extensionSet: Set<string>): boolean {
    if (extensionSet.size === 0) return true;
    return extensionSet.has(path.extname(filePath).toLowerCase());
}

function walkTrackedFiles(dirPath: string, extensionSet: Set<string>, sink: Set<string>): void {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walkTrackedFiles(fullPath, extensionSet, sink);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!shouldTrackFile(fullPath, extensionSet)) continue;
        sink.add(path.resolve(fullPath));
    }
}

export interface ScopedWriteSnapshot {
    directories: string[];
    files: string[];
    extensions: string[];
    entries: Map<string, FileSnapshot>;
}

/**
 * Captures a snapshot of all tracked files in the given scopes.
 */
export function captureScopedWriteSnapshot(options: {
    directories?: string[];
    files?: string[];
    extensions?: string[];
}): ScopedWriteSnapshot {
    const { directories = [], files = [], extensions = [] } = options;
    const trackedDirectories = resolveUniquePaths(directories);
    const trackedFiles = resolveUniquePaths(files);
    const extensionSet = normalizeExtensions(extensions);
    const trackedPathSet = new Set(trackedFiles);

    for (const directory of trackedDirectories) {
        walkTrackedFiles(directory, extensionSet, trackedPathSet);
    }

    const entries = new Map<string, FileSnapshot>();
    for (const trackedPath of trackedPathSet) {
        entries.set(trackedPath, captureFileSnapshot(trackedPath));
    }

    return {
        directories: trackedDirectories,
        files: trackedFiles,
        extensions: [...extensionSet],
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
    const trackedPathSet = new Set(resolveUniquePaths(snapshot.files || []));

    for (const directory of resolveUniquePaths(snapshot.directories || [])) {
        walkTrackedFiles(directory, extensionSet, trackedPathSet);
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
    label?: string;
}): void {
    const { snapshot, allowedPaths = [], label = 'scoped write' } = options;
    const allowed = new Set(resolveUniquePaths(allowedPaths));
    const currentTrackedPaths = collectCurrentTrackedPaths(snapshot);
    const allTrackedPaths = new Set([...snapshot.entries.keys(), ...currentTrackedPaths]);

    const violations: FileChange[] = [];
    for (const trackedPath of allTrackedPaths) {
        const beforeSnapshot = snapshot.entries.get(trackedPath) || { exists: false, content: '' };
        const change = buildChangeRecord(trackedPath, beforeSnapshot);
        if (!change) continue;
        if (allowed.has(trackedPath)) continue;
        violations.push(change);
    }

    if (violations.length === 0) return;

    for (const violation of violations) {
        restoreFileSnapshot(violation.path, violation.beforeSnapshot);
    }

    const details = violations.map((item) => formatChange(item)).join('\n');
    throw new Error(
        `Unexpected file mutations detected during ${label}. ` +
        'Only target files and generated indices are allowed to change.\n' +
        `${details}`,
    );
}
