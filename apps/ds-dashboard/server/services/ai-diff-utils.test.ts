/**
 * AI Diff Utils Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { computeDocDiff, type DiffResult } from './ai-diff-utils.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ai-diff-utils', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'ai-diff-test-'));
    });

    afterEach(async () => {
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it('returns hasPrevious: false when no existing file', async () => {
        const newContent = '# New Component\n\nThis is new content.';

        const result = await computeDocDiff(newContent, 'new-component', testDir);

        assert.equal(result.hasPrevious, false);
        assert.ok(result.stats.added > 0);
        assert.equal(result.stats.removed, 0);
    });

    it('computes correct diff for changed file', async () => {
        // Create existing file
        const existingContent = '# Old Component\n\nOld content here.\nMore old content.';
        await writeFile(join(testDir, 'test-component.md'), existingContent, 'utf-8');

        const newContent = '# New Component\n\nNew content here.\nEven more new content.';

        const result = await computeDocDiff(newContent, 'test-component', testDir);

        assert.equal(result.hasPrevious, true);
        assert.ok(result.diff !== undefined);
        // Diff should contain changes
        assert.ok(result.stats.added > 0 || result.stats.removed > 0);
    });

    it('rejects path traversal attempts', async () => {
        const newContent = '# Test';
        await assert.rejects(
            computeDocDiff(newContent, '../../etc/passwd', testDir),
            /Path traversal attempt detected/
        );
    });
});
