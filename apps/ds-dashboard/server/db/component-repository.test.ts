/**
 * Component Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Sql } from 'postgres';

import { ComponentRepository } from './component-repository.js';
import { createTestDatabase } from './test-db-helpers.js';

describe('ComponentRepository', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let repo: ComponentRepository;
    let originalConsoleWarn: typeof console.warn;

    before(async () => {
        originalConsoleWarn = console.warn;
        console.warn = () => { };
        ({ sql, cleanup } = await createTestDatabase({
            designSystems: [{ id: 'test-sys', name: 'Test System' }],
        }));
        repo = new ComponentRepository(sql);
    });

    after(async () => {
        await cleanup();
        console.warn = originalConsoleWarn;
    });

    describe('upsertFromRegistry', () => {
        it('inserts new components from registry', async () => {
            const count = await repo.upsertFromRegistry('test-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                    specs: [
                        {
                            docPath: 'components/button.md',
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
                            imageWidth: 242.42855834960938,
                            imageHeight: 55.6,
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

            const components = await repo.getAll('test-sys');
            assert.strictEqual(components.length, 1);
            const button = components[0];
            assert.strictEqual(button.slug, 'button');
            assert.strictEqual(button.name, 'Button');
            assert.strictEqual(button.status, 'ready');
            assert.ok(button.specs);
            assert.strictEqual(button.specs.length, 1);
            assert.strictEqual(button.specs[0].docPath, 'components/button.md');
            assert.strictEqual(button.specs[0].coverage, 85);
            assert.ok(button.visualProofs);
            assert.strictEqual(button.visualProofs.length, 1);
            assert.strictEqual(button.visualProofs[0].imagePath, 'images/button.png');
            assert.strictEqual(button.visualProofs[0].screenshotUrl, 'https://example.com/button.png');
            assert.strictEqual(button.visualProofs[0].capturedAt, '2026-03-31T10:00:00.000Z');
            assert.strictEqual(button.visualProofs[0].imageWidth, 242);
            assert.strictEqual(button.visualProofs[0].imageHeight, 56);
            assert.strictEqual(button.visualProofs[0].variantsCount, 2);
            assert.ok(Array.isArray(button.visualProofs[0].variants));
            assert.strictEqual(button.visualProofs[0].variants?.length, 2);
        });

        it('is idempotent - updating existing components', async () => {
            await repo.upsertFromRegistry('test-sys', [
                {
                    slug: 'button',
                    name: 'Button Updated',
                    status: 'needs-review',
                    specs: [
                        {
                            docPath: 'components/button.md',
                            docStatus: 'ready',
                            coverage: 90,
                        },
                    ],
                },
            ]);

            const components = await repo.getAll('test-sys');
            assert.strictEqual(components.length, 1);
            const button = components[0];
            assert.strictEqual(button.name, 'Button Updated');
            assert.strictEqual(button.status, 'needs-review');
            assert.strictEqual(button.specs[0].coverage, 90);
        });

        it('upserts by figma node id and updates the existing row on rename', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('figma-node-sys', 'Figma Node Test')`;

            await repo.upsertFromRegistry('figma-node-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: '111:222',
                    contentFingerprint: 'Button||COMPONENT||Components||1',
                },
            ]);

            await repo.upsertFromRegistry('figma-node-sys', [
                {
                    slug: 'button-primary',
                    name: 'Button Primary',
                    status: 'needs-review',
                    docType: 'component',
                    figmaNodeId: '111:222',
                    contentFingerprint: 'Button Primary||COMPONENT||Components||2',
                },
            ]);

            const rows = await sql`
              SELECT slug, name, status, figma_node_id, figma_content_fingerprint, figma_component_set_node_id
              FROM components
              WHERE ds_id = 'figma-node-sys'
            `;

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].slug, 'button-primary');
            assert.strictEqual(rows[0].name, 'Button Primary');
            assert.strictEqual(rows[0].status, 'needs-review');
            assert.strictEqual(rows[0].figma_node_id, '111:222');
            assert.strictEqual(rows[0].figma_component_set_node_id, '111:222');
            assert.strictEqual(
                rows[0].figma_content_fingerprint,
                'Button Primary||COMPONENT||Components||2',
            );
        });

        it('retries figma-node upserts with a unique slug when the preferred slug is already taken', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('slug-collision-sys', 'Slug Collision Test')`;

            await repo.upsertFromRegistry('slug-collision-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                },
            ]);

            const count = await repo.upsertFromRegistry('slug-collision-sys', [
                {
                    slug: 'button',
                    name: 'Button Duplicate',
                    status: 'needs-review',
                    docType: 'component',
                    figmaNodeId: '999:000',
                    contentFingerprint: 'Button Duplicate||COMPONENT||Components||1',
                },
            ]);

            assert.strictEqual(count, 1);

            const rows = await sql`
              SELECT slug, name, status, figma_node_id
              FROM components
              WHERE ds_id = 'slug-collision-sys'
              ORDER BY slug
            `;

            assert.strictEqual(rows.length, 2);
            assert.strictEqual(rows[0].slug, 'button');
            assert.strictEqual(rows[0].figma_node_id, null);
            assert.strictEqual(rows[1].slug, 'button-2');
            assert.strictEqual(rows[1].name, 'Button Duplicate');
            assert.strictEqual(rows[1].figma_node_id, '999:000');
        });

        it('resolves to button-3 when both button and button-2 are already taken', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('multi-slug-sys', 'Multi Slug Test')`;

            await repo.upsertFromRegistry('multi-slug-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                },
            ]);

            await repo.upsertFromRegistry('multi-slug-sys', [
                {
                    slug: 'button',
                    name: 'Button v2',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'aaa:001',
                    contentFingerprint: 'Button v2||COMPONENT||Components||1',
                },
            ]);

            await repo.upsertFromRegistry('multi-slug-sys', [
                {
                    slug: 'button',
                    name: 'Button v3',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'bbb:002',
                    contentFingerprint: 'Button v3||COMPONENT||Components||1',
                },
            ]);

            const rows = await sql`
              SELECT slug
              FROM components
              WHERE ds_id = 'multi-slug-sys'
              ORDER BY slug
            `;

            assert.deepStrictEqual(rows.map((row) => row.slug), [
                'button',
                'button-2',
                'button-3',
            ]);
        });

        it('keeps retrying past button-5 when multiple slug collisions already exist', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('multi-slug-deep-sys', 'Multi Slug Deep Test')`;

            await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    docType: 'component',
                },
            ]);

            await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button v2',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'aaa:001',
                    contentFingerprint: 'Button v2||COMPONENT||Components||1',
                },
            ]);
            await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button v3',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'bbb:002',
                    contentFingerprint: 'Button v3||COMPONENT||Components||1',
                },
            ]);
            await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button v4',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'ccc:003',
                    contentFingerprint: 'Button v4||COMPONENT||Components||1',
                },
            ]);
            await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button v5',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'ddd:004',
                    contentFingerprint: 'Button v5||COMPONENT||Components||1',
                },
            ]);

            const count = await repo.upsertFromRegistry('multi-slug-deep-sys', [
                {
                    slug: 'button',
                    name: 'Button v6',
                    status: 'ready',
                    docType: 'component',
                    figmaNodeId: 'eee:005',
                    contentFingerprint: 'Button v6||COMPONENT||Components||1',
                },
            ]);

            assert.strictEqual(count, 1);

            const rows = await sql`
              SELECT slug
              FROM components
              WHERE ds_id = 'multi-slug-deep-sys'
              ORDER BY slug
            `;

            assert.deepStrictEqual(rows.map((row) => row.slug), [
                'button',
                'button-2',
                'button-3',
                'button-4',
                'button-5',
                'button-6',
            ]);
        });

        it('returns figma-node-backed, legacy, and manual components for diffing', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('diff-sys', 'Diff Test')`;

            await repo.upsertFromRegistry('diff-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    figmaNodeId: '10:1',
                    contentFingerprint: 'Button||COMPONENT||Components||0',
                },
                {
                    slug: 'manual-note',
                    name: 'Manual Note',
                    status: 'draft',
                },
                {
                    slug: 'legacy-button',
                    name: 'Legacy Button',
                    status: 'ready',
                    figma: { componentSetNodeId: '20:5' },
                },
            ]);

            const diffRows = await repo.getComponentsForDiff('diff-sys');
            assert.strictEqual(diffRows.length, 3);
            const bySlug = new Map(diffRows.map((row) => [row.slug, row]));
            assert.strictEqual(bySlug.get('button')?.nodeId, '10:1');
            assert.strictEqual(bySlug.get('button')?.contentFingerprint, 'Button||COMPONENT||Components||0');
            assert.strictEqual(bySlug.get('legacy-button')?.nodeId, '20:5');
            assert.strictEqual(bySlug.get('manual-note')?.nodeId, '');
        });

        it('returns all non-empty slugs for deduplication', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('slug-sys', 'Slug Test')`;

            await repo.upsertFromRegistry('slug-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    figmaNodeId: '10:1',
                },
                {
                    slug: 'manual-note',
                    name: 'Manual Note',
                    status: 'draft',
                },
            ]);

            const slugs = await repo.getExistingSlugs('slug-sys');
            assert.deepStrictEqual(slugs.sort(), ['button', 'manual-note']);
        });

        it('handles multiple components', async () => {
            await repo.upsertFromRegistry('test-sys', [
                { slug: 'card', name: 'Card', status: 'ready' },
                { slug: 'input', name: 'Input', status: 'draft' },
            ]);

            const components = await repo.getAll('test-sys');
            assert.strictEqual(components.length, 3); // button + card + input
        });
    });

    describe('getBySlug', () => {
        it('gets component by slug', async () => {
            const component = await repo.getBySlug('test-sys', 'button');
            assert.ok(component);
            assert.strictEqual(component.slug, 'button');
            assert.strictEqual(component.name, 'Button Updated');
        });

        it('returns null for non-existent slug', async () => {
            const component = await repo.getBySlug('test-sys', 'non-existent');
            assert.strictEqual(component, null);
        });
    });

    describe('getAll', () => {
        it('returns all components for a design system', async () => {
            const components = await repo.getAll('test-sys');
            assert.ok(components.length >= 3);
            const slugs = components.map((c) => c.slug);
            assert.ok(slugs.includes('button'));
            assert.ok(slugs.includes('card'));
            assert.ok(slugs.includes('input'));
        });

        it('returns empty array for design system with no components', async () => {
            const components = await repo.getAll('non-existent-sys');
            assert.deepStrictEqual(components, []);
        });

        it('handles malformed variants_json gracefully', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('malformed-json-sys', 'Malformed Json Test')`;
            await sql`INSERT INTO components (ds_id, slug, name, status, doc_type) VALUES ('malformed-json-sys', 'badge', 'Badge', 'draft', 'component')`;
            const [componentRow] = await sql`SELECT id FROM components WHERE ds_id = 'malformed-json-sys' AND slug = 'badge'`;
            await sql`INSERT INTO component_visual_proofs (component_id, image_path, variants_json) VALUES (${componentRow.id}, 'images/badge.png', ${JSON.stringify('not an array')})`;

            const components = await repo.getAll('malformed-json-sys');
            assert.strictEqual(components.length, 1);
            assert.ok(Array.isArray(components[0].visualProofs));
            assert.strictEqual(components[0].visualProofs?.[0]?.variants, undefined);
        });

        it('parses structured Figma data from structured child tables', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('structured-sys', 'Structured Data Test')`;
            await repo.upsertFromRegistry('structured-sys', [
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

            const component = await repo.getBySlug('structured-sys', 'button');
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

        it('keeps variant description rows out of the structural variant list', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('variant-split-sys', 'Variant Split Test')`;
            await sql`
              INSERT INTO components (ds_id, slug, name, status, doc_type, figma_file_url, figma_component_set_node_id, figma_page_name)
              VALUES ('variant-split-sys', 'button', 'Button', 'ready', 'component', 'https://figma.com/file/test', '10:2', 'Components')
            `;
            const [componentRow] = await sql`
              SELECT id FROM components WHERE ds_id = 'variant-split-sys' AND slug = 'button'
            `;
            await sql`
              INSERT INTO component_figma_variants (
                component_id, variant_name, node_id, properties_json, canonical_key, description
              )
              VALUES (
                ${componentRow.id}, 'default', '10:2', ${JSON.stringify({ state: 'default' })}, null, null
              )
            `;
            await sql`
              INSERT INTO component_figma_variants (
                component_id, variant_name, node_id, properties_json, canonical_key, description
              )
              VALUES (
                ${componentRow.id}, 'State=Default', '10:2', ${JSON.stringify({})}, 'State=Default', 'Default state'
              )
            `;
            await sql`
              UPDATE components
              SET figma_descriptions_synced_at = now()
              WHERE id = ${componentRow.id}
            `;

            const component = await repo.getBySlug('variant-split-sys', 'button');
            assert.ok(component);
            assert.strictEqual(component.figma?.variants?.length, 1);
            assert.strictEqual(component.figma?.variants?.[0]?.name, 'default');

            const figmaDescriptions = await repo.getFigmaDescriptions(Number(componentRow.id));
            assert.ok(figmaDescriptions);
            assert.strictEqual(figmaDescriptions?.variants.length, 2);
          });

        it('handles missing structured Figma data gracefully', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('no-structured-sys', 'No Structured Data Test')`;
            await repo.upsertFromRegistry('no-structured-sys', [
                { slug: 'card', name: 'Card' },
            ]);

            const component = await repo.getBySlug('no-structured-sys', 'card');
            assert.ok(component);
            assert.strictEqual(component.figma, undefined);
        });

        it('preserves existing structured child rows when capture status is failed', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('preserve-structured-sys', 'Preserve Structured Data Test')`;

            await repo.upsertFromRegistry('preserve-structured-sys', [
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

            const component = await repo.getBySlug('preserve-structured-sys', 'button');
            assert.ok(component);
            const componentId = component.id;

            const [variantsBefore] = await sql`SELECT COUNT(*)::int as count FROM component_figma_variants WHERE component_id = ${componentId}`;
            const [bindingsBefore] = await sql`SELECT COUNT(*)::int as count FROM component_figma_token_bindings WHERE component_id = ${componentId}`;
            const [layoutBefore] = await sql`SELECT COUNT(*)::int as count FROM component_figma_layout_rows WHERE component_id = ${componentId}`;
            assert.strictEqual(variantsBefore.count, 1);
            assert.strictEqual(bindingsBefore.count, 1);
            assert.strictEqual(layoutBefore.count, 1);

            await repo.upsertFromRegistry('preserve-structured-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    figma: {
                        pageName: 'Components',
                        structuredCaptureStatus: 'failed',
                    },
                },
            ]);

            const [variantsAfter] = await sql`SELECT COUNT(*)::int as count FROM component_figma_variants WHERE component_id = ${componentId}`;
            const [bindingsAfter] = await sql`SELECT COUNT(*)::int as count FROM component_figma_token_bindings WHERE component_id = ${componentId}`;
            const [layoutAfter] = await sql`SELECT COUNT(*)::int as count FROM component_figma_layout_rows WHERE component_id = ${componentId}`;
            assert.strictEqual(variantsAfter.count, 1);
            assert.strictEqual(bindingsAfter.count, 1);
            assert.strictEqual(layoutAfter.count, 1);
        });
    });

    describe('deleteAll', () => {
        it('deletes all components for a design system', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('delete-test-sys', 'Delete Test')`;
            await repo.upsertFromRegistry('delete-test-sys', [
                { slug: 'temp', name: 'Temp' },
            ]);

            const count = await repo.deleteAll('delete-test-sys');
            assert.strictEqual(count, 1);

            const components = await repo.getAll('delete-test-sys');
            assert.deepStrictEqual(components, []);
        });

        it('deletes component specs and visual proofs via CASCADE', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('cascade-sys', 'Cascade Test')`;
            await repo.upsertFromRegistry('cascade-sys', [
                {
                    slug: 'cascade-test',
                    name: 'Cascade Test',
                    specs: [{ docPath: 'cascade.md' }],
                    visualProofs: [{ imagePath: 'cascade.png' }],
                },
            ]);

            const component = await repo.getBySlug('cascade-sys', 'cascade-test');
            assert.ok(component);
            const componentId = component.id;

            const [specsBefore] = await sql`SELECT COUNT(*)::int as count FROM component_specs WHERE component_id = ${componentId}`;
            const [proofsBefore] = await sql`SELECT COUNT(*)::int as count FROM component_visual_proofs WHERE component_id = ${componentId}`;
            assert.strictEqual(specsBefore.count, 1);
            assert.strictEqual(proofsBefore.count, 1);

            await repo.deleteAll('cascade-sys');

            const [specsAfter] = await sql`SELECT COUNT(*)::int as count FROM component_specs WHERE component_id = ${componentId}`;
            const [proofsAfter] = await sql`SELECT COUNT(*)::int as count FROM component_visual_proofs WHERE component_id = ${componentId}`;
            assert.strictEqual(specsAfter.count, 0);
            assert.strictEqual(proofsAfter.count, 0);
        });
    });

    describe('markMissingComponents', () => {
        it('marks only components with figma node ids when existingNodeIds is empty', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('missing-all-sys', 'Missing All Test')`;
            await repo.upsertFromRegistry('missing-all-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    status: 'ready',
                    figmaNodeId: '10:1',
                },
                {
                    slug: 'card',
                    name: 'Card',
                    status: 'draft',
                    figmaNodeId: '10:2',
                },
                {
                    slug: 'manual-note',
                    name: 'Manual Note',
                    status: 'draft',
                },
            ]);

            const changed = await repo.markMissingComponents('missing-all-sys', []);
            assert.strictEqual(changed, 2);

            const rows = await sql`
              SELECT slug, status, figma_node_id
              FROM components
              WHERE ds_id = 'missing-all-sys'
              ORDER BY slug
            `;
            assert.deepStrictEqual(
                rows.map((r) => ({
                    slug: r.slug,
                    status: r.status,
                    figmaNodeId: r.figma_node_id,
                })),
                [
                    { slug: 'button', status: 'missing', figmaNodeId: '10:1' },
                    { slug: 'card', status: 'missing', figmaNodeId: '10:2' },
                    { slug: 'manual-note', status: 'draft', figmaNodeId: null },
                ]
            );
        });

        it('marks only missing node ids when existingNodeIds exceeds batch size', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('missing-batch-sys', 'Missing Batch Test')`;
            const componentEntries = Array.from({ length: 620 }, (_, index) => ({
                slug: `component-${String(index + 1).padStart(3, '0')}`,
                name: `Component ${index + 1}`,
                status: 'ready',
                figmaNodeId: `10:${index + 1}`,
            }));
            await repo.upsertFromRegistry('missing-batch-sys', componentEntries);

            const keepNodeIds = componentEntries.slice(0, 10).map((entry) => entry.figmaNodeId as string);
            const changed = await repo.markMissingComponents('missing-batch-sys', keepNodeIds);
            assert.strictEqual(changed, 610);

            const [keptCount] = await sql`
              SELECT COUNT(*)::int as count
              FROM components
              WHERE ds_id = 'missing-batch-sys'
                AND status != 'missing'
                AND figma_node_id IS NOT NULL
            `;
            assert.strictEqual(keptCount.count, 10);
        });
    });

    describe('editorial contracts', () => {
        let testComponentId: number;

        before(async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('editorial-test-sys', 'Editorial Test')`;
            const [result] = await sql`
                INSERT INTO components (ds_id, slug, name, status, doc_type)
                VALUES ('editorial-test-sys', 'test-comp', 'Test Component', 'draft', 'component')
                RETURNING id
            `;
            testComponentId = Number(result.id);
        });

        it('getEditorial returns null when no row exists', async () => {
            const editorial = await repo.getEditorial(testComponentId);
            assert.strictEqual(editorial, null, 'getEditorial should return null when no row exists');
        });

        it('creates editorial row with expectedUpdatedAt = null', async () => {
            const editorialFields = {
                summary: { purpose: 'Test component' },
            };
            const editorial = await repo.upsertEditorial(testComponentId, editorialFields, null);

            assert.strictEqual(editorial.componentId, testComponentId);
            assert.deepStrictEqual(editorial.summary, editorialFields.summary);
        });

        it('accepts stringified component ids when reading editorial rows', async () => {
            const editorial = await repo.getEditorial(String(testComponentId) as unknown as number);

            assert.ok(editorial, 'Editorial row should be readable from a string id');
            assert.strictEqual(editorial?.componentId, testComponentId);
        });

        it('round-trips JSONB editorial fields through the database', async () => {
            const editorialFields = {
                summary: {
                    purpose: 'Round-trip component',
                    status: 'stable',
                },
                accessibility: {
                    ariaRole: 'button',
                    keyboardSupport: true,
                },
                accessibilityNotes: ['Use with caution', 'Ensure labels are visible'],
                qa: [{ name: 'keyboard', passed: true }],
                variants: [
                    {
                        name: 'Default',
                        properties: { state: 'default' },
                    },
                ],
            };

            const existing = await repo.getEditorial(testComponentId);
            await repo.upsertEditorial(
                testComponentId,
                editorialFields,
                existing?.updatedAt ?? null,
            );

            const reloaded = await repo.getEditorial(testComponentId);
            assert.ok(reloaded);
            assert.deepStrictEqual(reloaded?.summary, editorialFields.summary);
            assert.deepStrictEqual(
                reloaded?.accessibility,
                editorialFields.accessibility,
            );
            assert.deepStrictEqual(
                reloaded?.accessibilityNotes,
                editorialFields.accessibilityNotes,
            );
            assert.deepStrictEqual(reloaded?.qa, editorialFields.qa);
            assert.deepStrictEqual(reloaded?.variants, editorialFields.variants);
        });

        it('optimistic locking: incorrect expectedUpdatedAt throws statusCode 409', async () => {
            const wrongUpdatedAt = 999999;

            await assert.rejects(
                () => repo.upsertEditorial(testComponentId, { summary: { updated: 'data' } }, wrongUpdatedAt),
                (err: any) => {
                    assert.strictEqual(err.statusCode, 409, 'Error should have statusCode 409');
                    return true;
                },
                'Should throw with statusCode 409 for optimistic lock failure',
            );
        });

        it('requires expectedUpdatedAt for updates and throws statusCode 400 when omitted', async () => {
            const existing = await repo.getEditorial(testComponentId);
            assert.ok(existing, 'Editorial row should exist before testing update precondition');
            await assert.rejects(
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

        it('rejects non-finite numeric values in editorial payload', async () => {
            const existing = await repo.getEditorial(testComponentId);
            await assert.rejects(
                () =>
                    repo.upsertEditorial(
                        testComponentId,
                        { summary: { score: Number.NaN } as unknown as Record<string, unknown> },
                        existing?.updatedAt ?? null,
                    ),
                /NaN\/Infinity are not allowed/,
            );
        });

        it('sanitizes null bytes in editorial payload before persisting', async () => {
            const existing = await repo.getEditorial(testComponentId);
            const editorial = await repo.upsertEditorial(
                testComponentId,
                {
                    summary: { purpose: 'Avatar\u0000 component' },
                },
                existing?.updatedAt ?? null,
            );

            assert.strictEqual(
                (editorial.summary as Record<string, unknown>)?.purpose,
                'Avatar component',
            );
        });

        it('treats non-serializable top-level values as null instead of crashing postgres', async () => {
            const existing = await repo.getEditorial(testComponentId);
            const editorial = await repo.upsertEditorial(
                testComponentId,
                {
                    summary: (() => 'not-serializable') as unknown as Record<string, unknown>,
                },
                existing?.updatedAt ?? null,
            );

            assert.strictEqual(editorial.summary, null);
        });
    });

    describe('component lookup helpers', () => {
        let testComponentId: number;

        before(async () => {
            await repo.upsertFromRegistry('test-sys', [{
                slug: 'test-comp-sug',
                name: 'Test Component Suggestions',
                status: 'draft',
                docType: 'component',
                figma: { componentSetNodeId: '68:4097' },
                specs: [],
                visualProofs: [],
            }]);
            const [row] = await sql`SELECT id FROM components WHERE slug = 'test-comp-sug'`;
            testComponentId = Number(row.id);
        });

        it('resolves component by figma node id with design-system scope', async () => {
            const found = await repo.getComponentByFigmaNodeId('68:4097', 'test-sys');
            assert.ok(found);
            assert.strictEqual(found?.id, testComponentId);
            assert.strictEqual(found?.slug, 'test-comp-sug');
        });

        it('returns null when figma node id is unknown', async () => {
            const found = await repo.getComponentByFigmaNodeId('missing-node', 'test-sys');
            assert.strictEqual(found, null);
        });

        it('getComponentIdBySlug respects design system scope', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('sys-02', 'Second System') ON CONFLICT DO NOTHING`;
            await repo.upsertFromRegistry('sys-02', [
                { slug: 'test-comp-sug', name: 'Shadow Copy', status: 'draft', docType: 'component' },
            ]);

            const scoped = await repo.getComponentIdBySlug('test-comp-sug', 'test-sys');
            const other = await repo.getComponentIdBySlug('test-comp-sug', 'sys-02');
            assert.strictEqual(scoped, testComponentId);
            assert.ok(other && other !== testComponentId);
        });
    });

    describe('doc staleness timestamps', () => {
        it('returns millisecond timestamps consistently', async () => {
            await repo.upsertFromRegistry('test-sys', [{
                slug: 'staleness-comp',
                name: 'Staleness Component',
                status: 'draft',
                docType: 'component',
                figma: { componentSetNodeId: '68:5000' },
                specs: [],
                visualProofs: [],
            }]);
            const [row] = await sql`SELECT id FROM components WHERE slug = 'staleness-comp'`;
            const componentId = Number(row.id);

            await repo.upsertEditorial(componentId, {
                summary: { purpose: 'x', when_to_use: '', when_not_to_use: '' },
            });

            const staleness = await repo.getComponentDocStaleness(componentId);
            assert.ok(
                staleness.editorialUpdatedAt === null || staleness.editorialUpdatedAt > 1_000_000_000_000,
                'editorialUpdatedAt must be in milliseconds',
            );
            assert.ok(
                staleness.capturedAt === null || staleness.capturedAt > 1_000_000_000_000,
                'capturedAt must be in milliseconds',
            );
        });

        it('lists staleness in batch scoped by design system', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('sys-batch', 'Batch System') ON CONFLICT DO NOTHING`;
            await repo.upsertFromRegistry('sys-batch', [
                { slug: 'batch-a', name: 'Batch A', status: 'draft', docType: 'component', figma: { componentSetNodeId: '68:5100' } },
            ]);

            const scopedRows = await repo.listComponentDocStaleness('sys-batch');
            assert.ok(scopedRows.some((item) => item.slug === 'batch-a'));
            assert.ok(scopedRows.every((item) => item.id > 0));
        });
    });

    describe('Layer Token Mapping (Migration 027)', () => {
        it('persists token bindings with new Layer Token Mapping fields', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('ltm-sys', 'Layer Token Mapping Test')`;
            await repo.upsertFromRegistry('ltm-sys', [
                {
                    slug: 'button',
                    name: 'Button',
                    figma: {
                        pageName: 'Components',
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [
                            {
                                nodeId: '10:2',
                                nodeName: 'Button/Default',
                                field: 'fills',
                                variableId: '123:456',
                                tokenPath: 'primitives.blue.500',
                                mode: 'Default',
                                variantNodeId: '10:1',
                                variantSignature: 'State=Default|Size=MD',
                                propertyPath: 'fills',
                                status: 'resolved',
                                modeId: 'mode:1',
                                modeName: 'Default',
                            },
                            {
                                nodeId: '10:3',
                                nodeName: 'Button/Hover',
                                field: 'fills',
                                variableId: '999:999',
                                tokenPath: undefined,
                                mode: 'Default',
                                variantNodeId: '10:4',
                                variantSignature: 'State=Hover|Size=MD',
                                propertyPath: 'fills',
                                status: 'unresolved',
                                modeId: 'mode:1',
                                modeName: 'Default',
                            },
                        ],
                    },
                },
            ]);

            const component = await repo.getBySlug('ltm-sys', 'button');
            assert.ok(component);
            assert.strictEqual(component.figma?.tokenBindings?.length, 2);

            const resolved = component.figma?.tokenBindings?.find((b) => b.status === 'resolved');
            assert.ok(resolved);
            assert.strictEqual(resolved.variantNodeId, '10:1');
            assert.strictEqual(resolved.variantSignature, 'State=Default|Size=MD');
            assert.strictEqual(resolved.propertyPath, 'fills');
            assert.strictEqual(resolved.tokenPath, 'primitives.blue.500');
            assert.strictEqual(resolved.modeId, 'mode:1');
            assert.strictEqual(resolved.modeName, 'Default');

            const unresolved = component.figma?.tokenBindings?.find((b) => b.status === 'unresolved');
            assert.ok(unresolved);
            assert.strictEqual(unresolved.variantNodeId, '10:4');
            assert.strictEqual(unresolved.variantSignature, 'State=Hover|Size=MD');
            assert.strictEqual(unresolved.tokenPath, undefined);
        });

        it('replaces all bindings on reimport (delete + insert)', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('ltm-replace-sys', 'LTM Replace Test')`;

            await repo.upsertFromRegistry('ltm-replace-sys', [
                {
                    slug: 'card',
                    name: 'Card',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [
                            {
                                nodeId: '20:1',
                                nodeName: 'Card',
                                field: 'fills',
                                variableId: '111:111',
                                tokenPath: 'primitives.gray.100',
                                variantNodeId: '20:0',
                                variantSignature: '',
                                propertyPath: 'fills',
                                status: 'resolved',
                            },
                        ],
                    },
                },
            ]);

            const comp1 = await repo.getBySlug('ltm-replace-sys', 'card');
            assert.strictEqual(comp1.figma?.tokenBindings?.length, 1);

            await repo.upsertFromRegistry('ltm-replace-sys', [
                {
                    slug: 'card',
                    name: 'Card',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [
                            {
                                nodeId: '20:2',
                                nodeName: 'Card/New',
                                field: 'strokes',
                                variableId: '222:222',
                                tokenPath: 'primitives.blue.300',
                                variantNodeId: '20:0',
                                variantSignature: 'Style=Outlined',
                                propertyPath: 'strokes',
                                status: 'resolved',
                            },
                        ],
                    },
                },
            ]);

            const comp2 = await repo.getBySlug('ltm-replace-sys', 'card');
            assert.strictEqual(comp2.figma?.tokenBindings?.length, 1);
            assert.strictEqual(comp2.figma?.tokenBindings?.[0]?.nodeId, '20:2');
            assert.strictEqual(comp2.figma?.tokenBindings?.[0]?.field, 'strokes');
        });

        it('clears previous bindings when reimport contains zero token bindings', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('ltm-clear-sys', 'LTM Clear Test')`;
            await repo.upsertFromRegistry('ltm-clear-sys', [
                {
                    slug: 'alert',
                    name: 'Alert',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [
                            {
                                nodeId: '40:1',
                                nodeName: 'Alert',
                                field: 'fills',
                                variableId: '111:111',
                                tokenPath: 'semantic.alert.bg',
                                variantNodeId: '40:0',
                                propertyPath: 'fills',
                                status: 'resolved',
                            },
                        ],
                    },
                },
            ]);
            const firstImport = await repo.getBySlug('ltm-clear-sys', 'alert');
            assert.strictEqual(firstImport.figma?.tokenBindings?.length, 1);

            await repo.upsertFromRegistry('ltm-clear-sys', [
                {
                    slug: 'alert',
                    name: 'Alert',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [],
                    },
                },
            ]);

            const secondImport = await repo.getBySlug('ltm-clear-sys', 'alert');
            assert.strictEqual(secondImport.figma?.tokenBindings?.length ?? 0, 0);
            const [remainingRows] = await sql`SELECT COUNT(*)::int as c FROM component_figma_token_bindings WHERE component_id = ${secondImport.id}`;
            assert.strictEqual(remainingRows.c, 0);
        });

        it('saveTokenBindingsForComponent supports new fields', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('ltm-standalone-sys', 'LTM Standalone Test')`;
            await repo.upsertFromRegistry('ltm-standalone-sys', [
                { slug: 'badge', name: 'Badge' },
            ]);
            const comp = await repo.getBySlug('ltm-standalone-sys', 'badge');
            assert.ok(comp);

            await repo.saveTokenBindingsForComponent(comp.id, [
                {
                    nodeId: '30:1',
                    nodeName: 'Badge',
                    field: 'fills',
                    variableId: '333:333',
                    tokenPath: 'primitives.green.500',
                    variantNodeId: '30:0',
                    variantSignature: 'Variant=Success',
                    propertyPath: 'fills',
                    status: 'resolved',
                    modeId: 'mode:1',
                    modeName: 'Default',
                },
            ]);

            const reloaded = await repo.getBySlug('ltm-standalone-sys', 'badge');
            assert.strictEqual(reloaded.figma?.tokenBindings?.length, 1);
            const binding = reloaded.figma?.tokenBindings?.[0];
            assert.strictEqual(binding?.variantNodeId, '30:0');
            assert.strictEqual(binding?.variantSignature, 'Variant=Success');
            assert.strictEqual(binding?.status, 'resolved');
        });

        it('keeps multiple variable bindings for same layer/property/mode', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('ltm-multi-var-sys', 'LTM Multi Variable Test')`;
            await repo.upsertFromRegistry('ltm-multi-var-sys', [
                {
                    slug: 'chip',
                    name: 'Chip',
                    figma: {
                        structuredCaptureStatus: 'ok',
                        tokenBindings: [
                            {
                                nodeId: '50:1',
                                nodeName: 'Chip/Label',
                                field: 'fills',
                                variableId: 'var:color-a',
                                tokenPath: 'semantic.chip.label.default',
                                variantNodeId: '50:0',
                                variantSignature: 'State=Default',
                                propertyPath: 'fills',
                                status: 'resolved',
                                modeId: 'mode:1',
                                modeName: 'Default',
                            },
                            {
                                nodeId: '50:1',
                                nodeName: 'Chip/Label',
                                field: 'fills',
                                variableId: 'var:color-b',
                                tokenPath: 'semantic.chip.label.hover',
                                variantNodeId: '50:0',
                                variantSignature: 'State=Default',
                                propertyPath: 'fills',
                                status: 'resolved',
                                modeId: 'mode:1',
                                modeName: 'Default',
                            },
                        ],
                    },
                },
            ]);

            const component = await repo.getBySlug('ltm-multi-var-sys', 'chip');
            assert.ok(component);
            assert.strictEqual(component.figma?.tokenBindings?.length, 2);
            const variableIds = new Set((component.figma?.tokenBindings || []).map((item) => item.variableId));
            assert.ok(variableIds.has('var:color-a'));
            assert.ok(variableIds.has('var:color-b'));
        });
    });

    describe('captured Figma props (Migration 034)', () => {
        it('upsert captured props replaces component snapshot without duplicates', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('props-idempotent-sys', 'Props Idempotent')`;
            await repo.upsertFromRegistry('props-idempotent-sys', [
                {
                    slug: 'idempotent-btn',
                    name: 'Idempotent Button',
                    figma: {
                        props: [
                            { name: 'size', type: 'enum', values: ['sm', 'md'], defaultValue: 'md', required: true, description: 'Size' },
                            { name: 'disabled', type: 'boolean', defaultValue: false, required: false, description: 'Disabled' },
                        ],
                        runId: 'run-001',
                        capturedAtEpoch: 1000,
                    },
                },
            ]);

            let component = await repo.getBySlug('props-idempotent-sys', 'idempotent-btn');
            assert.ok(component);
            assert.strictEqual(component.figma?.properties?.length, 2);

            await repo.upsertFromRegistry('props-idempotent-sys', [
                {
                    slug: 'idempotent-btn',
                    name: 'Idempotent Button Updated',
                    figma: {
                        props: [
                            { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], defaultValue: 'lg', required: true, description: 'Updated size' },
                            { name: 'icon', type: 'slot', required: false, description: 'Icon slot' },
                        ],
                        runId: 'run-001',
                        capturedAtEpoch: 2000,
                    },
                },
            ]);

            component = await repo.getBySlug('props-idempotent-sys', 'idempotent-btn');
            assert.ok(component);
            assert.strictEqual(component.figma?.properties?.length, 2);

            const sizeProp = component.figma?.properties?.find((p) => p.name === 'size');
            assert.ok(sizeProp);
            assert.deepEqual(sizeProp?.values, ['sm', 'md', 'lg']);
            assert.strictEqual(sizeProp?.defaultValue, 'lg');

            const iconProp = component.figma?.properties?.find((p) => p.name === 'icon');
            assert.ok(iconProp);
            assert.strictEqual(iconProp?.type, 'slot');

            const [propCount] = await sql`SELECT COUNT(*)::int as c FROM component_figma_props WHERE component_id = ${component.id}`;
            assert.strictEqual(propCount.c, 2);
        });

        it('clears captured props when a recapture provides an explicit empty props list', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('props-clear-sys', 'Props Clear')`;
            await repo.upsertFromRegistry('props-clear-sys', [
                {
                    slug: 'clearable-card',
                    name: 'Clearable Card',
                    figma: {
                        props: [
                            { name: 'size', type: 'enum', values: ['sm', 'md'], defaultValue: 'md', required: true, description: 'Size' },
                        ],
                        runId: 'run-001',
                        capturedAtEpoch: 1000,
                    },
                },
            ]);

            let component = await repo.getBySlug('props-clear-sys', 'clearable-card');
            assert.ok(component);
            assert.strictEqual(component.figma?.properties?.length, 1);

            await repo.upsertFromRegistry('props-clear-sys', [
                {
                    slug: 'clearable-card',
                    name: 'Clearable Card',
                    figma: {
                        props: [],
                        runId: 'run-002',
                        capturedAtEpoch: 2000,
                    },
                },
            ]);

            component = await repo.getBySlug('props-clear-sys', 'clearable-card');
            assert.ok(component);
            assert.strictEqual(component.figma?.properties, undefined);

            const [propCount] = await sql`SELECT COUNT(*)::int as c FROM component_figma_props WHERE component_id = ${component.id}`;
            assert.strictEqual(propCount.c, 0);
        });

        it('captures slot and instance_swap as distinct types', async () => {
            await sql`INSERT INTO design_systems (id, name) VALUES ('props-types-sys', 'Props Types')`;
            await repo.upsertFromRegistry('props-types-sys', [
                {
                    slug: 'type-test',
                    name: 'Type Test',
                    figma: {
                        props: [
                            { name: 'content', type: 'slot', required: false, description: 'Content slot' },
                            { name: 'tooltip', type: 'instance_swap', required: false, description: 'Tooltip component' },
                        ],
                        runId: 'run-types',
                    },
                },
            ]);

            const component = await repo.getBySlug('props-types-sys', 'type-test');
            assert.ok(component);
            assert.strictEqual(component.figma?.properties?.length, 2);

            const contentProp = component.figma?.properties?.find((p) => p.name === 'content');
            assert.strictEqual(contentProp?.type, 'slot');

            const tooltipProp = component.figma?.properties?.find((p) => p.name === 'tooltip');
            assert.strictEqual(tooltipProp?.type, 'instance_swap');
        });
    });
});

describe('Figma instance dependencies', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let repo: ComponentRepository;
    let originalConsoleWarn: typeof console.warn;

    before(async () => {
        originalConsoleWarn = console.warn;
        console.warn = () => { };
        ({ sql, cleanup } = await createTestDatabase({
            designSystems: [{ id: 'instance-deps-sys', name: 'Instance Deps' }],
        }));
        repo = new ComponentRepository(sql);
    });

    after(async () => {
        await cleanup();
        console.warn = originalConsoleWarn;
    });

    it('persists and loads Figma instance dependencies', async () => {
        await repo.upsertFromRegistry('instance-deps-sys', [
            {
                slug: 'calendar',
                name: 'Calendar',
                status: 'ready',
                figma: {
                    componentSetNodeId: '4333:9262',
                    instanceDependencies: [
                        {
                            instanceNodeId: '4333:9999',
                            instanceNodeName: 'Calendar Select Group',
                            usedComponentNodeId: '4333:9286',
                            usedComponentName: 'Calendar Button',
                            usedComponentKey: 'key-1',
                            status: 'resolved',
                        },
                    ],
                },
            },
            {
                slug: 'calendar-button',
                name: 'Calendar Button',
                status: 'ready',
                figma: {
                    componentSetNodeId: '4333:9286',
                },
            },
        ]);

        const components = await repo.getAll('instance-deps-sys');
        const calendar = components.find((component) => component.slug === 'calendar');
        assert.ok(calendar);
        assert.ok(Array.isArray(calendar?.figma?.instanceDependencies));
        assert.strictEqual(calendar?.figma?.instanceDependencies?.length, 1);
        assert.strictEqual(
            calendar?.figma?.instanceDependencies?.[0]?.usedComponentNodeId,
            '4333:9286',
        );
    });

    it('keeps unresolved instance dependencies when the Figma main component name is unavailable', async () => {
        await repo.upsertFromRegistry('instance-deps-sys', [
            {
                slug: 'calendar-7',
                name: 'Calendar',
                status: 'ready',
                figma: {
                    componentSetNodeId: '4333:9262',
                    instanceDependencies: [
                        {
                            instanceNodeId: '4333:9999',
                            instanceNodeName: 'Calendar Select Group',
                            usedComponentNodeId: '4333:9359',
                            usedComponentName: '',
                            usedComponentKey: '',
                            status: 'unresolved',
                        },
                    ],
                },
            },
            {
                slug: 'calendar-button',
                name: 'Calendar Button',
                status: 'ready',
                figma: {
                    componentSetNodeId: '4333:9359',
                },
            },
        ]);

        const components = await repo.getAll('instance-deps-sys');
        const calendar = components.find((component) => component.slug === 'calendar-7');
        assert.ok(calendar);
        assert.ok(Array.isArray(calendar?.figma?.instanceDependencies));
        assert.strictEqual(calendar?.figma?.instanceDependencies?.length, 1);
        assert.strictEqual(
            calendar?.figma?.instanceDependencies?.[0]?.usedComponentNodeId,
            '4333:9359',
        );
        assert.strictEqual(calendar?.figma?.instanceDependencies?.[0]?.usedComponentName, '4333:9359');
    });
});
