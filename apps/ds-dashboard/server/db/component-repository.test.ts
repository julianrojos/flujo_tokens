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

    describe('editorial contracts', () => {
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

        it('getEditorial returns null when no row exists', () => {
            const editorial = repo.getEditorial(testComponentId);
            assert.strictEqual(editorial, null, 'getEditorial should return null when no row exists');
        });

        it('creates editorial row with expectedUpdatedAt = null', () => {
            const editorialFields = {
                summary: { purpose: 'Test component' },
                bestPractices: { usage: 'Use in forms' },
            };
            const editorial = repo.upsertEditorial(testComponentId, editorialFields, null);

            assert.strictEqual(editorial.componentId, testComponentId);
            assert.deepStrictEqual(editorial.summary, editorialFields.summary);
        });

        it('optimistic locking: incorrect expectedUpdatedAt throws statusCode 409', () => {
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
            const existing = repo.getEditorial(testComponentId);
            assert.ok(existing, 'Editorial row should exist before testing update precondition');
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

    });

    describe('component lookup helpers', () => {
        let testComponentId: number;

        before(() => {
            repo.upsertFromRegistry('test-sys', [{
                slug: 'test-comp-sug',
                name: 'Test Component Suggestions',
                status: 'draft',
                docType: 'component',
                figma: { componentSetNodeId: '68:4097' },
                specs: [],
                visualProofs: [],
            }]);
            const row = repo.db.prepare("SELECT id FROM components WHERE slug = 'test-comp-sug'").get() as { id: number } | undefined;
            testComponentId = row!.id;
        });

        it('resolves component by figma node id with design-system scope', () => {
            const found = repo.getComponentByFigmaNodeId('68:4097', 'test-sys');
            assert.ok(found);
            assert.strictEqual(found?.id, testComponentId);
            assert.strictEqual(found?.slug, 'test-comp-sug');
        });

        it('returns null when figma node id is unknown', () => {
            const found = repo.getComponentByFigmaNodeId('missing-node', 'test-sys');
            assert.strictEqual(found, null);
        });

        it('getComponentIdBySlug respects design system scope', () => {
            db.exec("INSERT INTO design_systems (id, name) VALUES ('sys-02', 'Second System')");
            repo.upsertFromRegistry('sys-02', [
                { slug: 'test-comp-sug', name: 'Shadow Copy', status: 'draft', docType: 'component' },
            ]);

            const scoped = repo.getComponentIdBySlug('test-comp-sug', 'test-sys');
            const other = repo.getComponentIdBySlug('test-comp-sug', 'sys-02');
            assert.strictEqual(scoped, testComponentId);
            assert.ok(other && other !== testComponentId);
        });
    });

    describe('doc staleness timestamps', () => {
        it('returns millisecond timestamps consistently', () => {
            repo.upsertFromRegistry('test-sys', [{
                slug: 'staleness-comp',
                name: 'Staleness Component',
                status: 'draft',
                docType: 'component',
                figma: { componentSetNodeId: '68:5000' },
                specs: [],
                visualProofs: [],
            }]);
            const row = repo.db.prepare("SELECT id FROM components WHERE slug = 'staleness-comp'").get() as { id: number };
            const componentId = row.id;

            repo.upsertEditorial(componentId, {
                summary: { purpose: 'x', when_to_use: '', when_not_to_use: '' },
            });

            const staleness = repo.getComponentDocStaleness(componentId);
            assert.ok(
                staleness.editorialUpdatedAt === null || staleness.editorialUpdatedAt > 1_000_000_000_000,
                'editorialUpdatedAt must be in milliseconds',
            );
            assert.ok(
                staleness.capturedAt === null || staleness.capturedAt > 1_000_000_000_000,
                'capturedAt must be in milliseconds',
            );
        });

        it('lists staleness in batch scoped by design system', () => {
            db.exec("INSERT OR IGNORE INTO design_systems (id, name) VALUES ('sys-batch', 'Batch System')");
            repo.upsertFromRegistry('sys-batch', [
                { slug: 'batch-a', name: 'Batch A', status: 'draft', docType: 'component', figma: { componentSetNodeId: '68:5100' } },
            ]);

            const scopedRows = repo.listComponentDocStaleness('sys-batch');
            assert.ok(scopedRows.some((item) => item.slug === 'batch-a'));
            assert.ok(scopedRows.every((item) => item.id > 0));
        });
    });
});
