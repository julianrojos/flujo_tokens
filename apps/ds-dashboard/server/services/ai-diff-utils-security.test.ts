import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocDiff } from './ai-diff-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ai-diff-utils - security fixes', () => {
    const testDir = path.join(__dirname, '../../test-temp-security');
    
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

    it('should reject path traversal attempts with realpathSync', async () => {
        const newContent = '# Test Component\n\nTest content.';
        
        // Try various path traversal attempts
        const traversalSlugs = [
            '../etc/passwd',
            '../../etc/passwd',
            '../../../etc/passwd',
            '..\\..\\windows\\system32',
            'docs/../../../etc/passwd',
            'normal/../../../etc/passwd'
        ];

        for (const slug of traversalSlugs) {
            try {
                await computeDocDiff(newContent, slug, testDir);
                assert.fail(`Should have rejected traversal attempt: ${slug}`);
            } catch (error) {
                assert.ok(error instanceof Error && error.message.includes('Path traversal attempt detected'), 
                    `Expected traversal error for ${slug}, got: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });

    it('should allow legitimate paths', async () => {
        const newContent = '# Test Component\n\nTest content.';
        
        // Create a legitimate file
        const testFile = path.join(testDir, 'test-component.md');
        await fs.writeFile(testFile, '# Old Component\n\nOld content.');
        
        const result = await computeDocDiff(newContent, 'test-component', testDir);
        
        assert.ok(result.hasPrevious);
        assert.ok(result.previousPath);
        assert.ok(result.stats);
    });

    it('should include previousPath consistently when hasPrevious is false', async () => {
        const newContent = '# Test Component\n\nTest content.';
        
        const result = await computeDocDiff(newContent, 'nonexistent', testDir);
        
        assert.equal(result.hasPrevious, false);
        assert.equal(result.previousPath, undefined);
        assert.ok(result.stats);
        assert.equal(result.stats.added, 3); // 3 lines: "# Test Component", "", "Test content."
    });
});
