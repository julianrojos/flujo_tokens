/**
 * AI Diff Utils Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { computeDocDiff, computeInMemoryDiff, type DiffResult } from './ai-diff-utils.js';
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

    describe('computeInMemoryDiff', () => {
        it('returns hasPrevious: false when oldContent is null', async () => {
            const result = await computeInMemoryDiff(null, 'new line 1\nnew line 2');
            assert.equal(result.hasPrevious, false);
            assert.equal(result.stats.added, 2);
            assert.equal(result.stats.removed, 0);
            assert.equal(result.diff, '');
        });

        it('counts empty content as 0 lines', async () => {
            const created = await computeInMemoryDiff(null, '');
            assert.equal(created.hasPrevious, false);
            assert.equal(created.stats.added, 0);

            const unchanged = await computeInMemoryDiff('', '');
            assert.equal(unchanged.hasPrevious, true);
            assert.equal(unchanged.stats.unchanged, 0);
        });

        it('returns unchanged diff when content is identical', async () => {
            const content = 'same content\nsame line';
            const result = await computeInMemoryDiff(content, content);
            assert.equal(result.hasPrevious, true);
            assert.equal(result.diff, '');
            assert.equal(result.stats.added, 0);
            assert.equal(result.stats.removed, 0);
            assert.equal(result.stats.unchanged, 2);
        });

        it('returns proper diff when content differs', async () => {
            const result = await computeInMemoryDiff('old line\ncommon line', 'new line\ncommon line');
            assert.equal(result.hasPrevious, true);
            assert.ok(result.diff !== undefined && result.diff.length > 0);
            assert.ok(result.stats.added > 0);
            assert.ok(result.stats.removed > 0);
        });
    });
});
