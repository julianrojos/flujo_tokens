/**
 * Component Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

import { ComponentRepository } from './component-repository.js';

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
            name TEXT NOT NULL
        );

        CREATE TABLE components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'needs-review', 'missing')),
            doc_type TEXT NOT NULL DEFAULT 'component' CHECK (doc_type IN ('component', 'pattern', 'guideline')),
            figma_file_url TEXT,
            figma_component_set_node_id TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            UNIQUE(ds_id, slug)
        );

        CREATE TABLE component_specs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            markdown_path TEXT NOT NULL,
            doc_status TEXT NOT NULL DEFAULT 'draft' CHECK (doc_status IN ('draft', 'ready', 'needs-review')),
            coverage REAL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            UNIQUE(component_id, markdown_path)
        );

        CREATE TABLE component_visual_proofs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            image_path TEXT NOT NULL,
            screenshot_url TEXT,
            caption TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            UNIQUE(component_id, image_path)
        );
    `);

    // Insert test design system
    db.exec("INSERT INTO design_systems (id, name) VALUES ('test-sys', 'Test System')");

    return db;
}

describe('ComponentRepository', () => {
    let db: Database.Database;
    let repo: ComponentRepository;

    before(() => {
        db = createTestDb();
        repo = new ComponentRepository(db);
    });

    after(() => {
        if (db) db.close();
    });

    describe('upsertFromRegistry', () => {
        it('inserts new components from registry', () => {
            const count = repo.upsertFromRegistry('test-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                    specs: [
                        {
                            markdownPath: 'components/button.md',
                            docStatus: 'ready',
                            coverage: 85,
                        },
                    ],
                    visualProofs: [
                        {
                            imagePath: 'images/button.png',
                            caption: 'Button component',
                        },
                    ],
                },
            ]);

            assert.strictEqual(count, 1);

            const components = repo.getAll('test-sys');
            assert.strictEqual(components.length, 1);
            const button = components[0];
            assert.strictEqual(button.slug, 'button');
            assert.strictEqual(button.name, 'Button');
            assert.strictEqual(button.status, 'ready');
            assert.ok(button.specs);
            assert.strictEqual(button.specs.length, 1);
            assert.strictEqual(button.specs[0].markdownPath, 'components/button.md');
            assert.strictEqual(button.specs[0].coverage, 85);
            assert.ok(button.visualProofs);
            assert.strictEqual(button.visualProofs.length, 1);
            assert.strictEqual(button.visualProofs[0].imagePath, 'images/button.png');
        });

        it('is idempotent - updating existing components', () => {
            // Upsert same component with updated data
            repo.upsertFromRegistry('test-sys', [
                {
                    slug: 'button',
                    name: 'Button Updated',
                    status: 'needs-review',
                    specs: [
                        {
                            markdownPath: 'components/button.md',
                            docStatus: 'ready',
                            coverage: 90,
                        },
                    ],
                },
            ]);

            const components = repo.getAll('test-sys');
            assert.strictEqual(components.length, 1);
            const button = components[0];
            assert.strictEqual(button.name, 'Button Updated');
            assert.strictEqual(button.status, 'needs-review');
            assert.strictEqual(button.specs[0].coverage, 90);
        });

        it('handles multiple components', () => {
            repo.upsertFromRegistry('test-sys', [
                { slug: 'card', name: 'Card', status: 'ready' },
                { slug: 'input', name: 'Input', status: 'draft' },
            ]);

            const components = repo.getAll('test-sys');
            assert.strictEqual(components.length, 3); // button + card + input
        });
    });

    describe('getBySlug', () => {
        it('gets component by slug', () => {
            const component = repo.getBySlug('test-sys', 'button');
            assert.ok(component);
            assert.strictEqual(component.slug, 'button');
            assert.strictEqual(component.name, 'Button Updated');
        });

        it('returns null for non-existent slug', () => {
            const component = repo.getBySlug('test-sys', 'non-existent');
            assert.strictEqual(component, null);
        });
    });

    describe('getAll', () => {
        it('returns all components for a design system', () => {
            const components = repo.getAll('test-sys');
            assert.ok(components.length >= 3);
            const slugs = components.map((c) => c.slug);
            assert.ok(slugs.includes('button'));
            assert.ok(slugs.includes('card'));
            assert.ok(slugs.includes('input'));
        });

        it('returns empty array for design system with no components', () => {
            const components = repo.getAll('non-existent-sys');
            assert.deepStrictEqual(components, []);
        });
    });

    describe('deleteAll', () => {
        it('deletes all components for a design system', () => {
            // Create a separate system for this test
            db.exec("INSERT INTO design_systems (id, name) VALUES ('delete-test-sys', 'Delete Test')");
            repo.upsertFromRegistry('delete-test-sys', [
                { slug: 'temp', name: 'Temp' },
            ]);

            const count = repo.deleteAll('delete-test-sys');
            assert.strictEqual(count, 1);

            const components = repo.getAll('delete-test-sys');
            assert.deepStrictEqual(components, []);
        });

        it('deletes component specs and visual proofs via CASCADE', () => {
            // Create a separate system for this test
            db.exec("INSERT INTO design_systems (id, name) VALUES ('cascade-sys', 'Cascade Test')");
            repo.upsertFromRegistry('cascade-sys', [
                {
                    slug: 'cascade-test',
                    name: 'Cascade Test',
                    specs: [{ markdownPath: 'cascade.md' }],
                    visualProofs: [{ imagePath: 'cascade.png' }],
                },
            ]);

            const component = repo.getBySlug('cascade-sys', 'cascade-test');
            assert.ok(component);
            const componentId = component.id;

            // Verify specs and proofs exist
            const specsBefore = db.prepare('SELECT COUNT(*) as count FROM component_specs WHERE component_id = ?').get(componentId) as { count: number };
            const proofsBefore = db.prepare('SELECT COUNT(*) as count FROM component_visual_proofs WHERE component_id = ?').get(componentId) as { count: number };
            assert.strictEqual(specsBefore.count, 1);
            assert.strictEqual(proofsBefore.count, 1);

            // Delete all components (which deletes the component, triggering CASCADE)
            repo.deleteAll('cascade-sys');

            // Verify specs and proofs were deleted
            const specsAfter = db.prepare('SELECT COUNT(*) as count FROM component_specs WHERE component_id = ?').get(componentId) as { count: number };
            const proofsAfter = db.prepare('SELECT COUNT(*) as count FROM component_visual_proofs WHERE component_id = ?').get(componentId) as { count: number };
            assert.strictEqual(specsAfter.count, 0);
            assert.strictEqual(proofsAfter.count, 0);
        });
    });

    describe('markMissingComponents', () => {
        it('marks all non-missing components when existingSlugs is empty', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('missing-all-sys', 'Missing All Test')");
            repo.upsertFromRegistry('missing-all-sys', [
                { slug: 'button', name: 'Button', status: 'ready' },
                { slug: 'card', name: 'Card', status: 'draft' },
            ]);

            const changed = repo.markMissingComponents('missing-all-sys', []);
            assert.strictEqual(changed, 2);

            const rows = db.prepare(`
                SELECT slug, status
                FROM components
                WHERE ds_id = ?
                ORDER BY slug
            `).all('missing-all-sys') as Array<{ slug: string; status: string }>;
            assert.deepStrictEqual(rows, [
                { slug: 'button', status: 'missing' },
                { slug: 'card', status: 'missing' },
            ]);
        });
    });
});
