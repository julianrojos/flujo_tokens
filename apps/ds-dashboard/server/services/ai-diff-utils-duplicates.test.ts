import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocDiff } from './ai-diff-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ai-diff-utils - duplicate lines fix', () => {
    const testDir = path.join(__dirname, '../../test-temp-diff');
    
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

    it('should handle duplicate lines correctly in stats', async () => {
        // Create existing file with duplicate lines
        const existingContent = `# Test Component

This is a test component.
This is a test component.
Another line.
This is a test component.`;

        const newContent = `# Test Component

This is a test component.
This is a test component.
Modified line.
This is a test component.
New line added.`;

        const testFile = path.join(testDir, 'test-component.md');
        await fs.writeFile(testFile, existingContent);

        const result = await computeDocDiff(newContent, 'test-component', testDir);

        // Verify stats count duplicates correctly
        assert.equal(result.stats.added, 3); // "Modified line." + "New line added." + "This is a test component."
        assert.equal(result.stats.removed, 2); // "Another line." + "This is a test component."
        assert.equal(result.stats.unchanged, 4); // Header + 2x "This is a test component." + 2 empty lines
        
        assert.ok(result.hasPrevious);
        assert.ok(result.previousPath);
    });

    it('should handle identical duplicate lines', async () => {
        const content = `# Test Component

Line 1
Line 1
Line 2
Line 2`;

        const testFile = path.join(testDir, 'test-dup.md');
        await fs.writeFile(testFile, content);

        const result = await computeDocDiff(content, 'test-dup', testDir);

        // Should count all lines as unchanged, including duplicates
        assert.equal(result.stats.added, 0);
        assert.equal(result.stats.removed, 0);
        assert.equal(result.stats.unchanged, 6); // All lines including duplicates
        assert.ok(result.hasPrevious);
    });
});
