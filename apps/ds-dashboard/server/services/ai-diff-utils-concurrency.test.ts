import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocDiff } from './ai-diff-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ai-diff-utils - concurrency fixes', () => {
    const testDir = path.join(__dirname, '../../test-temp-concurrency');
    
    beforeEach(async () => {
        try {
            await fs.mkdir(testDir, { recursive: true });
        } catch {
            // Directory might exist
        }
    });
    
    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it('should handle concurrent diff requests for same slug without collision', async () => {
        const existingContent = '# Test Component\n\nOld content.';
        const newContent1 = '# Test Component\n\nNew content 1.\nExtra line 1.';
        const newContent2 = '# Test Component\n\nNew content 2.\nExtra line 2.\nAnother line.';

        // Create existing file
        const testFile = path.join(testDir, 'test-component.md');
        await fs.writeFile(testFile, existingContent);

        // Run concurrent diffs
        const [result1, result2] = await Promise.all([
            computeDocDiff(newContent1, 'test-component', testDir),
            computeDocDiff(newContent2, 'test-component', testDir),
        ]);

        // Both should succeed with different results
        assert.ok(result1.hasPrevious);
        assert.ok(result2.hasPrevious);
        assert.notEqual(result1.diff, result2.diff);
        assert.notEqual(result1.stats.added, result2.stats.added);
    });

    it('should use unique temp file names for concurrent requests', async () => {
        const existingContent = '# Test Component\n\nOld content.';
        const newContent = '# Test Component\n\nNew content.';

        // Create existing file
        const testFile = path.join(testDir, 'test-component.md');
        await fs.writeFile(testFile, existingContent);

        // Run multiple concurrent diffs
        const promises = Array.from({ length: 5 }, (_, i) => 
            computeDocDiff(`${newContent} ${i}`, 'test-component', testDir)
        );

        const results = await Promise.all(promises);

        // All should succeed
        for (const result of results) {
            assert.ok(result.hasPrevious);
            assert.ok(result.stats);
        }
    });
});
