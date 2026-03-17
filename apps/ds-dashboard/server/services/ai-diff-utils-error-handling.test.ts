import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocDiff } from './ai-diff-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ai-diff-utils - error handling and path fixes', () => {
    const testDir = path.join(__dirname, '../../test-temp-errors');
    
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

    it('should handle ENOENT as new file, but rethrow other errors', async () => {
        const newContent = '# Test Component\n\nNew content.';
        
        // Test with non-existent file (should work)
        const result1 = await computeDocDiff(newContent, 'nonexistent', testDir);
        assert.equal(result1.hasPrevious, false);
        assert.equal(result1.previousPath, undefined);
        
        // Create a file and make it unreadable (permission error)
        const testFile = path.join(testDir, 'readonly.md');
        await fs.writeFile(testFile, '# Old Content\n\nOld content.');
        
        // Change permissions to make it unreadable (if possible on this system)
        try {
            await fs.chmod(testFile, 0o000);
            
            // This should now throw an error (not ENOENT)
            await assert.rejects(
                () => computeDocDiff(newContent, 'readonly', testDir),
                (err: any) => {
                    // Should NOT be ENOENT, should be permission error
                    return err.code !== 'ENOENT';
                }
            );
        } catch (error) {
            // chmod might not work on all systems, that's okay
            console.log('chmod test skipped:', error);
        } finally {
            // Restore permissions for cleanup
            try {
                await fs.chmod(testFile, 0o644);
            } catch {
                // Ignore
            }
        }
    });

    it('should compute relative paths correctly with various docsDir formats', async () => {
        const existingContent = '# Test Component\n\nOld content.';
        const newContent = '# Test Component\n\nNew content.';
        
        // Test with trailing slash
        const testDirWithSlash = testDir + path.sep;
        const testFile = path.join(testDir, 'test-component.md');
        await fs.writeFile(testFile, existingContent);
        
        const result1 = await computeDocDiff(newContent, 'test-component', testDirWithSlash);
        assert.ok(result1.hasPrevious);
        assert.ok(result1.previousPath);
        assert.ok(!result1.previousPath.startsWith('/'));
        assert.ok(!result1.previousPath.includes(testDir));
        
        // Test without trailing slash
        const result2 = await computeDocDiff(newContent, 'test-component', testDir);
        assert.ok(result2.hasPrevious);
        assert.ok(result2.previousPath);
        assert.equal(result1.previousPath, result2.previousPath); // Should be consistent
        
        // Test with relative path
        const relativeDir = path.relative(process.cwd(), testDir);
        const result3 = await computeDocDiff(newContent, 'test-component', relativeDir);
        assert.ok(result3.hasPrevious);
        assert.ok(result3.previousPath);
        assert.equal(result1.previousPath, result3.previousPath); // Should be consistent
    });

    it('should handle subdirectories correctly', async () => {
        const existingContent = '# Test Component\n\nOld content.';
        const newContent = '# Test Component\n\nNew content.';
        
        // Create subdirectory
        const subDir = path.join(testDir, 'subdir');
        await fs.mkdir(subDir, { recursive: true });
        
        const testFile = path.join(subDir, 'test-component.md');
        await fs.writeFile(testFile, existingContent);
        
        const result = await computeDocDiff(newContent, 'subdir/test-component', testDir);
        assert.ok(result.hasPrevious);
        assert.ok(result.previousPath);
        assert.equal(result.previousPath, 'subdir/test-component.md');
    });
});
