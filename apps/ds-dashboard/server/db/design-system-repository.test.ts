/**
 * Design System Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DesignSystemRepository, resolveSystemPaths } from './design-system-repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create in-memory test database with required schema
 */
function createTestDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Create minimal schema needed for tests
    db.exec(`
        CREATE TABLE design_systems (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            app_name TEXT,
            figma_file_id TEXT,
            figma_api_token TEXT,
            collections TEXT,
            compile_variables_on_capture INTEGER NOT NULL DEFAULT 1 CHECK (compile_variables_on_capture IN (0, 1)),
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE tokens (
            id TEXT PRIMARY KEY,
            ds_id TEXT REFERENCES design_systems(id) ON DELETE CASCADE,
            slash_path TEXT NOT NULL,
            css_var TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            collection TEXT NOT NULL,
            raw_value TEXT NOT NULL
        );
    `);

    return db;
}

describe('DesignSystemRepository', () => {
    let db: Database.Database;
    let repo: DesignSystemRepository;

    before(() => {
        db = createTestDb();
        repo = new DesignSystemRepository(db);
    });

    after(() => {
        if (db) db.close();
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
    });

    describe('CRUD operations', () => {
        it('creates a new design system', () => {
            const entry = repo.create({
                id: 'test-sys-01',
                name: 'Test System 01',
                appName: 'Test App',
                collections: ['primitives', 'semantic'],
                compileVariablesOnCapture: true,
            });

            assert.strictEqual(entry.id, 'test-sys-01');
            assert.strictEqual(entry.name, 'Test System 01');
            assert.strictEqual(entry.appName, 'Test App');
            assert.deepStrictEqual(entry.collections, ['primitives', 'semantic']);
            assert.strictEqual(entry.compileVariablesOnCapture, true);
        });

        it('gets all design systems', () => {
            const all = repo.getAll();
            assert.ok(all.length >= 1);
            const testSys = all.find((s) => s.id === 'test-sys-01');
            assert.ok(testSys);
            assert.strictEqual(testSys?.name, 'Test System 01');
        });

        it('gets design system by ID', () => {
            const entry = repo.getById('test-sys-01');
            assert.ok(entry);
            assert.strictEqual(entry?.id, 'test-sys-01');
            assert.strictEqual(entry?.name, 'Test System 01');
        });

        it('returns null for non-existent ID', () => {
            const entry = repo.getById('non-existent');
            assert.strictEqual(entry, null);
        });

        it('updates an existing design system', () => {
            const updated = repo.update('test-sys-01', {
                name: 'Updated Test System',
                appName: 'Updated App',
            });

            assert.ok(updated);
            assert.strictEqual(updated?.name, 'Updated Test System');
            assert.strictEqual(updated?.appName, 'Updated App');

            // Verify persistence
            const fetched = repo.getById('test-sys-01');
            assert.strictEqual(fetched?.name, 'Updated Test System');
        });

        it('returns null when updating non-existent system', () => {
            const updated = repo.update('non-existent', { name: 'New Name' });
            assert.strictEqual(updated, null);
        });

        it('deletes a design system', () => {
            // Create a system to delete
            repo.create({
                id: 'to-delete',
                name: 'To Delete',
            });

            const deleted = repo.delete('to-delete');
            assert.strictEqual(deleted, true);

            // Verify deletion
            const fetched = repo.getById('to-delete');
            assert.strictEqual(fetched, null);
        });

        it('returns false when deleting non-existent system', () => {
            const deleted = repo.delete('non-existent');
            assert.strictEqual(deleted, false);
        });
    });

    describe('default system', () => {
        it('returns null when no default is set', () => {
            const defaultId = repo.getDefaultSystemId();
            assert.strictEqual(defaultId, null);
        });

        it('sets and gets default system ID', () => {
            repo.setDefaultSystemId('test-sys-01');
            const defaultId = repo.getDefaultSystemId();
            assert.strictEqual(defaultId, 'test-sys-01');
        });

        it('clears default system ID when set to null', () => {
            repo.setDefaultSystemId(null);
            const defaultId = repo.getDefaultSystemId();
            assert.strictEqual(defaultId, null);
        });
    });

    describe('getConfig', () => {
        it('returns full config with systems and default', () => {
            repo.setDefaultSystemId('test-sys-01');
            const config = repo.getConfig();

            assert.ok(Array.isArray(config.systems));
            assert.ok(config.systems.length >= 1);
            assert.strictEqual(config.defaultSystem, 'test-sys-01');
        });
    });

    describe('CASCADE delete', () => {
        it('deletes related tokens when design system is deleted', () => {
            // Create a system with a token
            const systemId = 'cascade-test-sys';
            repo.create({
                id: systemId,
                name: 'Cascade Test System',
            });

            // Insert a token directly
            const stmt = db.prepare(`
                INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run('test.token', systemId, 'test/token', '--test-token', 'color', 'test', '{}');

            // Verify token exists
            const tokenStmt = db.prepare('SELECT COUNT(*) as count FROM tokens WHERE ds_id = ?');
            const beforeCount = tokenStmt.get(systemId) as { count: number };
            assert.strictEqual(beforeCount.count, 1);

            // Delete the system
            repo.delete(systemId);

            // Verify token was deleted by CASCADE
            const afterCount = tokenStmt.get(systemId) as { count: number };
            assert.strictEqual(afterCount.count, 0);
        });
    });
});

describe('DesignSystemRepository - Empty state', () => {
    let db: Database.Database;
    let repo: DesignSystemRepository;

    before(() => {
        db = createTestDb();
        repo = new DesignSystemRepository(db);
    });

    after(() => {
        if (db) db.close();
    });

    it('returns empty array when no systems exist', () => {
        const all = repo.getAll();
        assert.deepStrictEqual(all, []);
    });

    it('getConfig returns empty systems and empty default', () => {
        const config = repo.getConfig();
        assert.deepStrictEqual(config.systems, []);
        assert.strictEqual(config.defaultSystem, '');
    });
});
