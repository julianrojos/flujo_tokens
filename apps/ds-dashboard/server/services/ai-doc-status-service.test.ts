/**
 * AI Doc Status Service Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { computeDocStatuses, type DocComponentStatus, type PluginConnectionManagerLike } from './ai-doc-status-service.js';
import { getPluginConnectionManager, resetPluginConnectionManager } from './plugin-connection-manager.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ai-doc-status-service', () => {
    let testDir: string;

    beforeEach(async () => {
        resetPluginConnectionManager();
        // Create temp directory for docs
        testDir = await mkdtemp(join(tmpdir(), 'ai-doc-test-'));
    });

    it('returns missing for components without docs', async () => {
        // Empty directory
        const result = await computeDocStatuses(testDir);

        assert.equal(result.connected, false);
        assert.equal(result.components.length, 0);
    });

    it('returns fresh when doc is newer than last change', async () => {
        // Create a doc file with generated_at in frontmatter
        const content = `---
figma.component_set_node_id: 123:456
ai.generated_at: ${new Date(Date.now() - 60000).toISOString()}
---

# Test Component

Some content here.
`;
        await writeFile(join(testDir, 'test-component.md'), content, 'utf-8');

        // No document changes, so it should be fresh
        const result = await computeDocStatuses(testDir);

        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].status, 'fresh');
        assert.equal(result.components[0].componentId, '123:456');
    });

    it('returns stale when change is newer than doc (with injected manager)', async () => {
        // Create a doc file with old generated_at
        const docTimestamp = new Date(Date.now() - 120000); // 2 minutes ago
        const content = `---
figma.component_set_node_id: 123:456
ai.generated_at: ${docTimestamp.toISOString()}
---

# Test Component

Some content here.
`;
        await writeFile(join(testDir, 'test-component.md'), content, 'utf-8');

        // Create mock manager with document change newer than generated_at
        const changeTimestamp = Date.now(); // Now (more recent than generated_at)
        const mockManager: PluginConnectionManagerLike = {
            getConnectionCount: () => 1,
            getDocumentChangesWithFileKey: () => [
                {
                    changedNodeIds: ['123:456'],
                    timestamp: changeTimestamp,
                    fileKey: 'test-file',
                },
            ],
        };

        const result = await computeDocStatuses(testDir, mockManager);

        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].status, 'stale',
            'Status should be stale when document change is newer than generated_at');
        assert.equal(result.components[0].componentId, '123:456');
    });

    it('returns fresh when no document changes exist', async () => {
        // Create a doc file with old generated_at
        const content = `---
figma.component_set_node_id: 123:456
ai.generated_at: ${new Date(Date.now() - 120000).toISOString()}
---

# Test Component

Some content here.
`;
        await writeFile(join(testDir, 'test-component.md'), content, 'utf-8');

        // Without mock document changes injected, it should be fresh
        const result = await computeDocStatuses(testDir);

        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].status, 'fresh');
    });

    it('returns connected: false when no plugin connection', async () => {
        const content = `---
figma.component_set_node_id: 123:456
ai.generated_at: ${new Date().toISOString()}
---

# Test
`;
        await writeFile(join(testDir, 'test.md'), content, 'utf-8');

        const result = await computeDocStatuses(testDir);

        assert.equal(result.connected, false);
    });

    // Cleanup
    afterEach(async () => {
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });
});
