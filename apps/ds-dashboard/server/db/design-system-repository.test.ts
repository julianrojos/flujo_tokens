/**
 * Design System Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Sql } from 'postgres';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DesignSystemRepository, isValidSystemId, resolveSystemPaths } from './design-system-repository.js';
import { createTestDatabase } from './test-db-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('DesignSystemRepository', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let repo: DesignSystemRepository;

    before(async () => {
        ({ sql, cleanup } = await createTestDatabase());
        repo = new DesignSystemRepository(sql);
    });

    after(async () => {
        await cleanup();
    });

    describe('resolveSystemPaths', () => {
        it('derives paths from ds_id and repoRoot', () => {
            const paths = resolveSystemPaths('sys-01', '/project');
            assert.strictEqual(paths.inputDir, '/project/design-systems/sys-01/input');
            assert.strictEqual(paths.outputDir, '/project/design-systems/sys-01/output');
            assert.strictEqual(paths.docsDir, '/project/design-systems/sys-01/docs');
            assert.strictEqual(paths.generatedDir, '/project/design-systems/sys-01/docs/_generated');
            assert.strictEqual(paths.specsDir, '/project/design-systems/sys-01/docs/_spec/components');
            assert.strictEqual(paths.componentsDir, '/project/design-systems/sys-01/docs/components');
        });

        it('rejects invalid system ids', () => {
            assert.strictEqual(isValidSystemId('sys-01'), true);
            assert.strictEqual(isValidSystemId('sys_01'), true);
            assert.strictEqual(isValidSystemId(''), false);
            assert.strictEqual(isValidSystemId('../escape'), false);
            assert.strictEqual(isValidSystemId('sys/01'), false);
            assert.strictEqual(isValidSystemId('sys\\01'), false);
            assert.throws(() => resolveSystemPaths('../escape', '/project'), /Invalid system ID/);
        });
    });

    describe('CRUD operations', () => {
        it('creates a new design system', async () => {
            const entry = await repo.create({
                id: 'test-sys-01',
                name: 'Test System 01',
                appName: 'Test App',
                collections: ['primitives', 'semantic'],
                detectedComponentsCount: 12,
                importedComponentsCount: 9,
                pendingComponentsCount: 3,
                importedComponentNames: ['Core / Button', 'Core / Input'],
                pendingComponentNames: ['Forms / Select'],
            });

            assert.strictEqual(entry.id, 'test-sys-01');
            assert.strictEqual(entry.name, 'Test System 01');
            assert.strictEqual(entry.appName, 'Test App');
            assert.deepStrictEqual(entry.collections, ['primitives', 'semantic']);
            assert.strictEqual(entry.detectedComponentsCount, 12);
            assert.strictEqual(entry.importedComponentsCount, 9);
            assert.strictEqual(entry.pendingComponentsCount, 3);
            assert.deepStrictEqual(entry.importedComponentNames, ['Core / Button', 'Core / Input']);
            assert.deepStrictEqual(entry.pendingComponentNames, ['Forms / Select']);
        });

        it('gets all design systems', async () => {
            const all = await repo.getAll();
            assert.ok(all.length >= 1);
            const testSys = all.find((s) => s.id === 'test-sys-01');
            assert.ok(testSys);
            assert.strictEqual(testSys?.name, 'Test System 01');
        });

        it('gets design system by ID', async () => {
            const entry = await repo.getById('test-sys-01');
            assert.ok(entry);
            assert.strictEqual(entry?.id, 'test-sys-01');
            assert.strictEqual(entry?.name, 'Test System 01');
            assert.strictEqual(entry?.detectedComponentsCount, 12);
            assert.strictEqual(entry?.importedComponentsCount, 9);
            assert.strictEqual(entry?.pendingComponentsCount, 3);
            assert.deepStrictEqual(entry?.importedComponentNames, ['Core / Button', 'Core / Input']);
            assert.deepStrictEqual(entry?.pendingComponentNames, ['Forms / Select']);
        });

        it('returns null for non-existent ID', async () => {
            const entry = await repo.getById('non-existent');
            assert.strictEqual(entry, null);
        });

        it('updates an existing design system', async () => {
            const updated = await repo.update('test-sys-01', {
                name: 'Updated Test System',
                appName: 'Updated App',
            });

            assert.ok(updated);
            assert.strictEqual(updated?.name, 'Updated Test System');
            assert.strictEqual(updated?.appName, 'Updated App');

            // Verify persistence
            const fetched = await repo.getById('test-sys-01');
            assert.strictEqual(fetched?.name, 'Updated Test System');
        });

        it('returns null when updating non-existent system', async () => {
            const updated = await repo.update('non-existent', { name: 'New Name' });
            assert.strictEqual(updated, null);
        });

        it('deletes a design system', async () => {
            // Create a system to delete
            await repo.create({
                id: 'to-delete',
                name: 'To Delete',
            });

            const deleted = await repo.delete('to-delete');
            assert.strictEqual(deleted, true);

            // Verify deletion
            const fetched = await repo.getById('to-delete');
            assert.strictEqual(fetched, null);
        });

        it('returns false when deleting non-existent system', async () => {
            const deleted = await repo.delete('non-existent');
            assert.strictEqual(deleted, false);
        });
    });

    describe('default system', () => {
        it('returns null when no default is set', async () => {
            const defaultId = await repo.getDefaultSystemId();
            assert.strictEqual(defaultId, null);
        });

        it('sets and gets default system ID', async () => {
            await repo.setDefaultSystemId('test-sys-01');
            const defaultId = await repo.getDefaultSystemId();
            assert.strictEqual(defaultId, 'test-sys-01');
        });

        it('clears default system ID when set to null', async () => {
            await repo.setDefaultSystemId(null);
            const defaultId = await repo.getDefaultSystemId();
            assert.strictEqual(defaultId, null);
        });
    });

    describe('getConfig', () => {
        it('returns full config with systems and default', async () => {
            await repo.setDefaultSystemId('test-sys-01');
            const config = await repo.getConfig();

            assert.ok(Array.isArray(config.systems));
            assert.ok(config.systems.length >= 1);
            assert.strictEqual(config.defaultSystem, 'test-sys-01');
        });
    });

    describe('CASCADE delete', () => {
        it('deletes related tokens when design system is deleted', async () => {
            // Create a system with a token
            const systemId = 'cascade-test-sys';
            await repo.create({
                id: systemId,
                name: 'Cascade Test System',
            });

            // Insert a token directly
            await sql`
                INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
                VALUES ('test.token', ${systemId}, 'test/token', '--test-token', 'color', 'test', '{}')
            `;

            // Verify token exists
            const beforeCount = (await sql`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ${systemId}`)[0] as { count: string };
            assert.strictEqual(Number(beforeCount.count), 1);

            // Delete the system
            await repo.delete(systemId);

            // Verify token was deleted by CASCADE
            const afterCount = (await sql`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ${systemId}`)[0] as { count: string };
            assert.strictEqual(Number(afterCount.count), 0);
        });
    });
});

describe('DesignSystemRepository - Empty state', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let repo: DesignSystemRepository;

    before(async () => {
        ({ sql, cleanup } = await createTestDatabase());
        repo = new DesignSystemRepository(sql);
    });

    after(async () => {
        await cleanup();
    });

    it('returns empty array when no systems exist', async () => {
        const all = await repo.getAll();
        assert.deepStrictEqual(all, []);
    });

    it('getConfig returns empty systems and empty default', async () => {
        const config = await repo.getConfig();
        assert.deepStrictEqual(config.systems, []);
        assert.strictEqual(config.defaultSystem, '');
    });
});
