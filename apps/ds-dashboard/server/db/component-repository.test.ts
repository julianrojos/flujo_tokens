/**
 * Component Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

import { ComponentRepository } from './component-repository.js';
import { createInMemoryDbFromSchema } from './test-db-helpers.ts';

/**
 * Create in-memory test database with required schema
 */
function createTestDb(): Database.Database {
    return createInMemoryDbFromSchema({
        designSystems: [{ id: 'test-sys', name: 'Test System' }],
    });
}

describe('ComponentRepository', () => {
    let db: Database.Database;
    let repo: ComponentRepository;
    let originalConsoleWarn: typeof console.warn;

    before(() => {
        originalConsoleWarn = console.warn;
        console.warn = () => { };
        db = createTestDb();
        repo = new ComponentRepository(db);
    });

    after(() => {
        if (db) db.close();
        console.warn = originalConsoleWarn;
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
                            screenshotUrl: 'https://example.com/button.png',
                            caption: 'Button component',
                            capturedAt: '2026-03-31T10:00:00.000Z',
                            variantsCount: 2,
                            variants: [
                                { name: 'Variant=Default', image_path: 'images/button-default.png' },
                                { name: 'Variant=Accent', image_path: 'images/button-accent.png' },
                            ],
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
            assert.strictEqual(button.visualProofs[0].screenshotUrl, 'https://example.com/button.png');
            assert.strictEqual(button.visualProofs[0].capturedAt, '2026-03-31T10:00:00.000Z');
            assert.strictEqual(button.visualProofs[0].variantsCount, 2);
            assert.ok(Array.isArray(button.visualProofs[0].variants));
            assert.strictEqual(button.visualProofs[0].variants?.length, 2);
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

        it('handles malformed variants_json gracefully', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('malformed-json-sys', 'Malformed Json Test')");
            db.prepare(`
                INSERT INTO components (ds_id, slug, name, status, doc_type)
                VALUES (?, ?, ?, ?, ?)
            `).run('malformed-json-sys', 'badge', 'Badge', 'draft', 'component');
            const componentRow = db
                .prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?')
                .get('malformed-json-sys', 'badge') as { id: number };
            db.prepare(`
                INSERT INTO component_visual_proofs (component_id, image_path, variants_json)
                VALUES (?, ?, ?)
            `).run(componentRow.id, 'images/badge.png', '{not valid json');

            const components = repo.getAll('malformed-json-sys');
            assert.strictEqual(components.length, 1);
            assert.ok(Array.isArray(components[0].visualProofs));
            assert.strictEqual(components[0].visualProofs?.[0]?.variants, undefined);
        });

        it('parses structured Figma data from structured child tables', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('structured-sys', 'Structured Data Test')");
            repo.upsertFromRegistry('structured-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    figma: {
                        pageName: 'Components',
                        variants: [
                            { name: 'default', properties: { state: 'default', size: 'md' }, nodeId: '10:2' },
                            { name: 'hover', properties: { state: 'hover', size: 'md' }, nodeId: '10:3' },
                        ],
                        tokenBindings: [
                            {
                                nodeId: '10:2',
                                nodeName: 'Button',
                                field: 'fills',
                                variableId: '123:456',
                                tokenPath: 'primitives.blue.500',
                                mode: 'Default',
                            },
                        ],
                        layout: [
                            {
                                nodeId: '10:2',
                                nodeName: 'Button',
                                depth: 0,
                                direction: 'Horizontal',
                                hSizing: 'fill',
                                vSizing: 'hug',
                                alignmentH: 'center',
                                alignmentV: 'center',
                                itemSpacing: 8,
                                padding: { top: 4, right: 8, bottom: 4, left: 8 },
                            },
                        ],
                    },
                },
            ]);

            const component = repo.getBySlug('structured-sys', 'button');
            assert.ok(component);
            assert.strictEqual(component.figma?.pageName, 'Components');
            assert.strictEqual(component.figma?.variants?.length, 2);
            assert.strictEqual(component.figma?.variants?.[0]?.name, 'default');
            assert.strictEqual(component.figma?.variants?.[0]?.nodeId, '10:2');
            assert.strictEqual(component.figma?.tokenBindings?.length, 1);
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.nodeId, '10:2');
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.nodeName, 'Button');
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.field, 'fills');
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.variableId, '123:456');
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.tokenPath, 'primitives.blue.500');
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.mode, 'Default');
            assert.ok(Number.isFinite(component.figma?.tokenBindings?.[0]?.capturedAtEpoch));
            assert.strictEqual(component.figma?.tokenBindings?.[0]?.schemaVersion, 1);
            assert.strictEqual(component.figma?.layout?.length, 1);
            assert.strictEqual(component.figma?.layout?.[0]?.direction, 'Horizontal');
            assert.strictEqual(component.figma?.layout?.[0]?.itemSpacing, 8);
        });

        it('handles missing structured Figma data gracefully', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('no-structured-sys', 'No Structured Data Test')");
            repo.upsertFromRegistry('no-structured-sys', [
                { slug: 'card', name: 'Card' },
            ]);

            const component = repo.getBySlug('no-structured-sys', 'card');
            assert.ok(component);
            assert.strictEqual(component.figma, undefined);
        });

        it('preserves existing structured child rows when capture status is failed', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('preserve-structured-sys', 'Preserve Structured Data Test')");

            repo.upsertFromRegistry('preserve-structured-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        variants: [
                            { name: 'default', properties: { state: 'default' }, nodeId: '10:2' },
                        ],
                        tokenBindings: [
                            {
                                nodeId: '10:2',
                                nodeName: 'Button',
                                field: 'fills',
                                variableId: '123:456',
                                tokenPath: 'primitives.blue.500',
                            },
                        ],
                        layout: [
                            {
                                nodeId: '10:2',
                                nodeName: 'Button',
                                depth: 0,
                                direction: 'Horizontal',
                            },
                        ],
                    },
                },
            ]);

            const component = repo.getBySlug('preserve-structured-sys', 'button');
            assert.ok(component);
            const componentId = component.id;

            const variantsBefore = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_variants WHERE component_id = ?',
            ).get(componentId) as { count: number };
            const bindingsBefore = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_token_bindings WHERE component_id = ?',
            ).get(componentId) as { count: number };
            const layoutBefore = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_layout_rows WHERE component_id = ?',
            ).get(componentId) as { count: number };
            assert.strictEqual(variantsBefore.count, 1);
            assert.strictEqual(bindingsBefore.count, 1);
            assert.strictEqual(layoutBefore.count, 1);

            repo.upsertFromRegistry('preserve-structured-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    figma: {
                        pageName: 'Components',
                        structuredCaptureStatus: 'failed',
                    },
                },
            ]);

            const variantsAfter = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_variants WHERE component_id = ?',
            ).get(componentId) as { count: number };
            const bindingsAfter = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_token_bindings WHERE component_id = ?',
            ).get(componentId) as { count: number };
            const layoutAfter = db.prepare(
                'SELECT COUNT(*) AS count FROM component_figma_layout_rows WHERE component_id = ?',
            ).get(componentId) as { count: number };
            assert.strictEqual(variantsAfter.count, 1);
            assert.strictEqual(bindingsAfter.count, 1);
            assert.strictEqual(layoutAfter.count, 1);
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

        it('marks only missing slugs when existingSlugs exceeds batch size', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('missing-batch-sys', 'Missing Batch Test')");
            const componentEntries = Array.from({ length: 620 }, (_, index) => ({
                slug: `component-${String(index + 1).padStart(3, '0')}`,
                name: `Component ${index + 1}`,
                status: 'ready',
            }));
            repo.upsertFromRegistry('missing-batch-sys', componentEntries);

            const keepSlugs = componentEntries
                .slice(0, 10)
                .map((entry) => entry.slug);
            const changed = repo.markMissingComponents('missing-batch-sys', keepSlugs);
            assert.strictEqual(changed, 610);

            const keptCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM components
                WHERE ds_id = ? AND status != 'missing'
            `).get('missing-batch-sys') as { count: number };
            assert.strictEqual(keptCount.count, 10);
        });
    });

    describe('editorial and anatomy contracts', () => {
        let testComponentId: number;

        before(() => {
            // Create a test component to reference
            db.exec("INSERT INTO design_systems (id, name) VALUES ('editorial-test-sys', 'Editorial Test')");
            const result = db.prepare(`
                INSERT INTO components (ds_id, slug, name, status, doc_type)
                VALUES ('editorial-test-sys', 'test-comp', 'Test Component', 'draft', 'component')
            `).run();
            testComponentId = result.lastInsertRowid as number;
        });

        it('Contract 1: getEditorial returns null when no row exists; getAnatomySpec returns row when data exists', () => {
            // Editorial should be null initially
            const editorial = repo.getEditorial(testComponentId);
            assert.strictEqual(editorial, null, 'getEditorial should return null when no row exists');

            // Insert anatomy data
            const anatomy = [{ id: 'node-1', name: 'Root', type: 'FRAME' }];
            const properties = [{ name: 'Variant', type: 'VARIANT', defaultValue: 'default' }];
            const result = repo.upsertAnatomySpec(testComponentId, anatomy, properties, 'test-run-1');

            assert.strictEqual(result.componentId, testComponentId);
            assert.deepStrictEqual(result.anatomy, anatomy);
            assert.deepStrictEqual(result.properties, properties);

            // Retrieve anatomy
            const retrieved = repo.getAnatomySpec(testComponentId);
            assert.ok(retrieved, 'getAnatomySpec should return row when data exists');
            assert.deepStrictEqual(retrieved.anatomy, anatomy);
            assert.deepStrictEqual(retrieved.properties, properties);
        });

        it('Contract 2: upsertEditorial does not modify component_figma_anatomy', () => {
            // Get anatomy before
            const anatomyBefore = repo.getAnatomySpec(testComponentId);
            assert.ok(anatomyBefore, 'Anatomy should exist before editorial upsert');

            // Upsert editorial
            const editorialFields = {
                summary: { purpose: 'Test component' },
                bestPractices: { usage: 'Use in forms' },
            };
            const editorial = repo.upsertEditorial(testComponentId, editorialFields, null);

            assert.strictEqual(editorial.componentId, testComponentId);
            assert.deepStrictEqual(editorial.summary, editorialFields.summary);

            // Verify anatomy unchanged
            const anatomyAfter = repo.getAnatomySpec(testComponentId);
            assert.ok(anatomyAfter, 'Anatomy should still exist after editorial upsert');
            assert.deepStrictEqual(anatomyAfter.anatomy, anatomyBefore.anatomy, 'Anatomy should not be modified');
            assert.deepStrictEqual(anatomyAfter.properties, anatomyBefore.properties, 'Properties should not be modified');
        });

        it('Contract 3: Optimistic locking - upsertEditorial with incorrect expectedUpdatedAt throws statusCode 409', () => {
            const wrongUpdatedAt = 999999;

            assert.throws(
                () => repo.upsertEditorial(testComponentId, { summary: { updated: 'data' } }, wrongUpdatedAt),
                (err: any) => {
                    assert.strictEqual(err.statusCode, 409, 'Error should have statusCode 409');
                    return true;
                },
                'Should throw with statusCode 409 for optimistic lock failure',
            );
        });

        it('requires expectedUpdatedAt for updates and throws statusCode 400 when omitted', () => {
            assert.throws(
                () =>
                    repo.upsertEditorial(
                        testComponentId,
                        { summary: { purpose: 'Undefined lock value update' } },
                        undefined,
                    ),
                (err: any) => {
                    assert.strictEqual(err.statusCode, 400, 'Error should have statusCode 400');
                    return true;
                },
                'Should throw with statusCode 400 when expectedUpdatedAt is omitted for update',
            );
        });

        it('rejects non-finite numeric values in editorial payload', () => {
            assert.throws(
                () =>
                    repo.upsertEditorial(
                        testComponentId,
                        { tokenMapping: { surface: { default: Number.NaN } } as unknown as Record<string, unknown> },
                        repo.getEditorial(testComponentId)?.updatedAt ?? null,
                    ),
                /NaN\/Infinity are not allowed/,
            );
        });

        it('Contract 4: upsertAnatomySpec with empty arrays when row exists is NO-OP (anti-deletion)', () => {
            // Get current anatomy
            const before = repo.getAnatomySpec(testComponentId);
            assert.ok(before, 'Anatomy should exist');
            assert.ok(before.anatomy.length > 0, 'Anatomy should have data');

            // Attempt to upsert with empty arrays
            const result = repo.upsertAnatomySpec(testComponentId, [], [], 'test-run-2');

            // Should return existing data unchanged (NO-OP)
            assert.deepStrictEqual(result.anatomy, before.anatomy, 'Anatomy should be unchanged (anti-deletion)');
            assert.deepStrictEqual(result.properties, before.properties, 'Properties should be unchanged (anti-deletion)');

            // Verify in DB
            const after = repo.getAnatomySpec(testComponentId);
            assert.deepStrictEqual(after?.anatomy, before.anatomy, 'DB should reflect no change');
        });

        it('preserves existing side when only one structured array is provided', () => {
            const before = repo.getAnatomySpec(testComponentId);
            assert.ok(before, 'Anatomy should exist');

            const updatedProperties = [{ name: 'State', type: 'enum', values: ['default', 'hover'] }];
            const result = repo.upsertAnatomySpec(testComponentId, [], updatedProperties, 'test-run-3');

            assert.deepStrictEqual(result.anatomy, before.anatomy, 'Anatomy should be preserved when incoming anatomy is empty');
            assert.deepStrictEqual(result.properties, updatedProperties, 'Properties should be updated');

            const persisted = repo.getAnatomySpec(testComponentId);
            assert.ok(persisted);
            assert.deepStrictEqual(persisted.anatomy, before.anatomy, 'Persisted anatomy should remain unchanged');
            assert.deepStrictEqual(persisted.properties, updatedProperties, 'Persisted properties should match update');
        });

    });
});
