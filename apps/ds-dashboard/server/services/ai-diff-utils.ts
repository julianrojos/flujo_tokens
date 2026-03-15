/**
 * AI Diff Utilities
 * Computes diff between generated and existing documentation
 * 
 * Stats definition:
 * - added: lines in new but not in old
 * - removed: lines in old but not in new
 * - unchanged: common lines
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

/**
 * Run diff command and return output
 */
function runDiff(oldPath: string, newPath: string): Promise<{ stdout: string; code: number }> {
    return new Promise((resolve, reject) => {
        execFile('diff', ['-u', '--label', 'previous', '--label', 'generated', oldPath, newPath],
            (error, stdout, stderr) => {
                if (error) {
                    // diff returns exit code 1 when files differ, 0 when identical
                    if (error && typeof error === 'object' && (error as { code?: number }).code === 1) {
                        resolve({ stdout, code: 1 });
                    } else {
                        reject(error);
                    }
                } else {
                    resolve({ stdout, code: 0 });
                }
            }
        );
    });
}

/**
 * Diff statistics
 * Defined as:
 * - added: lines in new but not in old
 * - removed: lines in old but not in new
 * - unchanged: common lines
 */
export interface DiffStats {
    added: number;
    removed: number;
    unchanged: number;
}

/**
 * Diff result
 */
export interface DiffResult {
    hasPrevious: boolean;
    previousPath?: string;
    diff?: string;
    stats: DiffStats;
}

/**
 * Compute unified diff between new content and existing file
 * Uses the diff command-line tool for proper positional diff
 */
export async function computeDocDiff(
    newContent: string,
    slug: string,
    docsDir: string
): Promise<DiffResult> {
    const resolvedDocsDir = resolve(docsDir);
    const filePath = resolve(resolvedDocsDir, `${slug}.md`);

    // Defense-in-depth: reject any path that escapes docsDir.
    // Use relative to detect traversal attempts more reliably
    const relativePathFromDocs = relative(resolvedDocsDir, filePath);
    if (relativePathFromDocs.startsWith('..') || isAbsolute(relativePathFromDocs)) {
        throw new Error(`Path traversal attempt detected for slug: ${slug}`);
    }

    // Use path.relative for consistent relative path calculation
    const relativePath = relative(resolvedDocsDir, filePath).replace(/^\//, '');

    // Check if file exists
    let existingContent: string;
    let hasPrevious = true;
    try {
        existingContent = await readFile(filePath, 'utf-8');
    } catch (error) {
        if (error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist - this is a new file
            hasPrevious = false;
            existingContent = '';
        } else {
            // Other error (permissions, I/O, etc.) - rethrow
            throw error;
        }
    }

    // Early exit if content is identical
    if (existingContent === newContent) {
        const lines = existingContent.split('\n').length;
        return {
            hasPrevious,
            previousPath: hasPrevious ? relativePath : undefined,
            diff: '',
            stats: { added: 0, removed: 0, unchanged: lines },
        };
    }

    // If no previous file, all content is added
    if (!hasPrevious) {
        const newLines = newContent.split('\n').length;
        return {
            hasPrevious: false,
            previousPath: undefined,
            diff: '',
            stats: { added: newLines, removed: 0, unchanged: 0 },
        };
    }

    // Create temp files for diff command in system temp directory
    const tempDir = tmpdir();
    const uniqueId = randomBytes(8).toString('hex');
    const oldTmpPath = resolve(tempDir, `ai-diff-old-${uniqueId}.tmp`);
    const newTmpPath = resolve(tempDir, `ai-diff-new-${uniqueId}.tmp`);

    try {
        // Write temp files in parallel
        await Promise.all([
            writeFile(oldTmpPath, existingContent, 'utf-8'),
            writeFile(newTmpPath, newContent, 'utf-8'),
        ]);

        const diffResult = await runDiff(oldTmpPath, newTmpPath);
        const diffOutput = diffResult.stdout;

        // Compute stats from diff output
        const added = (diffOutput.match(/^\+[^+]/gm)?.length || 0);
        const removed = (diffOutput.match(/^-[^-]/gm)?.length || 0);
        const unchanged = existingContent.split('\n').length - removed;

        return {
            hasPrevious,
            previousPath: hasPrevious ? relativePath : undefined,
            diff: diffOutput,
            stats: { added, removed, unchanged: Math.max(0, unchanged) },
        };
    } finally {
        // Clean up temp files — attempt directly, ignore if already gone
        await Promise.allSettled([
            unlink(oldTmpPath),
            unlink(newTmpPath),
        ]);
    }
}
