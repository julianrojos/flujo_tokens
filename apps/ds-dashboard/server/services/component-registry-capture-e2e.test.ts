import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Hono } from 'hono';

import { createTestDatabase } from '../db/test-db-helpers.js';
import { ComponentRepository } from '../db/component-repository.js';
import { persistCapturePayloadToComponentRepo } from './capture-db-persistence-service.ts';
import { handleComponentRegistryRoute } from './registry-route-handler-service.mjs';

test('e2e: capture payload upserts DB and /api/component-registry exposes spec-centric payload', async (t) => {
  if (
    !String(
      process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || '',
    ).trim()
  ) {
    t.skip(
      'PostgreSQL not available. Set DATABASE_URL or TEST_DATABASE_URL to run this test.',
    );
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-dashboard-e2e-'));
  const systemId = 'sys-e2e';
  const docPathRel = `design-systems/${systemId}/docs/components/button.md`;
  const imagePathRel = `design-systems/${systemId}/docs/_generated/visual-proofs/images/button.png`;

  const docPathAbs = path.join(tmpRoot, docPathRel);
  const imagePathAbs = path.join(tmpRoot, imagePathRel);

  fs.mkdirSync(path.dirname(docPathAbs), { recursive: true });
  fs.mkdirSync(path.dirname(imagePathAbs), { recursive: true });

  fs.writeFileSync(docPathAbs, '# Button\n', 'utf8');
  fs.writeFileSync(imagePathAbs, 'png-bytes', 'utf8');

  const { sql, cleanup } = await createTestDatabase({
    designSystems: [{ id: systemId, name: 'E2E System' }],
  });

  try {
    const componentRepo = new ComponentRepository(sql);

    await componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'button',
        name: 'Button',
        status: 'ready',
        docType: 'component',
        figma: {
          fileUrl: 'https://figma.com/file/ABC123',
          componentSetNodeId: '1:2',
        },
      },
    ]);

    const [componentRow] = await sql`
      SELECT id FROM components WHERE ds_id = ${systemId} AND slug = 'button'
    `;
    await sql`
      INSERT INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (${componentRow.id}, ${{ purpose: 'A button component' }}, ${Date.now()})
    `;

    const persisted = persistCapturePayloadToComponentRepo({
      payload: {
        source: { file_key: 'ABC123' },
        targets: [
          { slug: 'button', node_id: '1:2', markdown_path: docPathAbs },
        ],
        captured: [
          {
            slug: 'button',
            node_id: '1:2',
            markdown_path: docPathAbs,
            local_image_path: imagePathAbs,
            screenshot_url: 'https://cdn.example.com/button.png',
            variants_count: 1,
            captured_at: '2026-03-31T10:00:00.000Z',
            variants: [
              {
                name: '',
                node_id: '1:3',
                screenshot_url: 'https://cdn.example.com/button-primary.png',
                image_path: `design-systems/${systemId}/docs/_generated/visual-proofs/images/variants/button__01__primary.png`,
                captured_at: '2026-03-31T10:00:00.000Z',
              },
            ],
          },
        ],
      },
      componentRepo,
      systemId,
      repoRoot: tmpRoot,
    });
    assert.deepEqual(persisted, { attempted: 1, upserted: 1, skipped: 0 });

    const app = new Hono();
    app.get('/api/component-registry', (c) =>
      handleComponentRegistryRoute(c, {
        failJson: (ctx: any, status: number, payload: unknown) =>
          ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.equal(payload.schema_version, 2);
    const button = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'button')
      : null;

    assert.ok(button);
    assert.equal(button.spec.exists, true, 'spec.exists should be true');
    assert.ok(button.figma.file_url, 'figma.file_url should be set');
    assert.equal(
      button.visual_proof.screenshot_url,
      'https://cdn.example.com/button.png',
    );
    assert.ok(
      String(button.visual_proof.image_path || '').endsWith(
        '/visual-proofs/images/button.png',
      ),
    );
    assert.equal(button.visual_proof.variants_count, 1);
    assert.ok(Array.isArray(button.visual_proof.variants));
    assert.equal(button.visual_proof.variants.length, 1);
    assert.equal(
      button.visual_proof.variants[0].screenshot_url,
      'https://cdn.example.com/button-primary.png',
    );
    assert.equal(payload.summary.total_components, 1);
    assert.equal(payload.summary.with_spec, 1);
  } finally {
    await cleanup();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('e2e: component-registry returns spec.exists=false when no editorial row', async (t) => {
  if (
    !String(
      process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || '',
    ).trim()
  ) {
    t.skip(
      'PostgreSQL not available. Set DATABASE_URL or TEST_DATABASE_URL to run this test.',
    );
    return;
  }

  const tmpRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ds-dashboard-e2e-no-spec-'),
  );
  const systemId = 'sys-e2e-no-spec';
  const docPathRel = `design-systems/${systemId}/docs/components/chip.md`;
  const docPathAbs = path.join(tmpRoot, docPathRel);

  fs.mkdirSync(path.dirname(docPathAbs), { recursive: true });
  fs.writeFileSync(docPathAbs, '# Chip\n', 'utf8');

  const { sql, cleanup } = await createTestDatabase({
    designSystems: [{ id: systemId, name: 'E2E No Spec System' }],
  });

  try {
    const componentRepo = new ComponentRepository(sql);

    await componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'chip',
        name: 'Chip',
        status: 'draft',
        docType: 'component',
        figma: {
          fileUrl: 'https://figma.com/file/MISSING1',
          componentSetNodeId: '7:7',
        },
      },
    ]);

    const persisted = persistCapturePayloadToComponentRepo({
      payload: {
        source: { file_key: 'MISSING1' },
        captured: [
          {
            slug: 'chip',
            node_id: '7:7',
            markdown_path: docPathAbs,
            local_image_path: path.join(
              tmpRoot,
              `design-systems/${systemId}/docs/_generated/visual-proofs/images/chip.png`,
            ),
            variants_count: 0,
            captured_at: '2026-03-31T11:00:00.000Z',
          },
        ],
      },
      componentRepo,
      systemId,
      repoRoot: tmpRoot,
    });
    assert.deepEqual(persisted, { attempted: 1, upserted: 1, skipped: 0 });

    const app = new Hono();
    app.get('/api/component-registry', (c) =>
      handleComponentRegistryRoute(c, {
        failJson: (ctx: any, status: number, payload: unknown) =>
          ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.equal(payload.schema_version, 2);
    const chip = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'chip')
      : null;
    assert.ok(chip);
    assert.equal(
      chip.spec.exists,
      false,
      'spec.exists should be false (no editorial row)',
    );
    assert.ok(
      String(chip.visual_proof.image_path || '').endsWith(
        '/visual-proofs/images/chip.png',
      ),
    );
    assert.equal(chip.visual_proof.variants_count, 0);
    assert.equal(payload.summary.with_spec, 0);
  } finally {
    await cleanup();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('e2e: /api/component-registry exposes structured Figma data (pageName, layout, variants, tokenBindings)', async (t) => {
  if (
    !String(
      process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || '',
    ).trim()
  ) {
    t.skip(
      'PostgreSQL not available. Set DATABASE_URL or TEST_DATABASE_URL to run this test.',
    );
    return;
  }

  const tmpRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ds-dashboard-e2e-structured-'),
  );
  const systemId = 'sys-e2e-structured';

  const { sql, cleanup } = await createTestDatabase({
    designSystems: [{ id: systemId, name: 'E2E Structured System' }],
  });

  try {
    const componentRepo = new ComponentRepository(sql);

    await componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'button',
        name: 'Button',
        status: 'ready',
        figma: {
          fileUrl: 'https://figma.com/file/ABC123',
          componentSetNodeId: '1:1',
          pageName: 'Components',
          variants: [
            {
              name: 'default',
              properties: { state: 'default' },
              nodeId: '1:2',
            },
            { name: 'hover', properties: { state: 'hover' }, nodeId: '1:3' },
          ],
          tokenBindings: [
            {
              nodeId: '1:2',
              nodeName: 'Button',
              field: 'fills',
              variableId: 'var-123',
              tokenPath: 'blue.500',
              mode: 'Default',
            },
          ],
          layout: [
            {
              nodeId: '1:2',
              nodeName: 'Button',
              depth: 0,
              direction: 'Horizontal',
              hSizing: 'fixed',
              vSizing: 'auto',
              alignmentH: 'center',
              alignmentV: 'center',
              itemSpacing: 8,
              padding: { top: 4, right: 12, bottom: 4, left: 12 },
            },
          ],
        },
      },
    ]);

    const app = new Hono();
    app.get('/api/component-registry', (c) =>
      handleComponentRegistryRoute(c, {
        failJson: (ctx: any, status: number, payload: unknown) =>
          ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.equal(payload.schema_version, 2);
    const button = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'button')
      : null;

    assert.ok(button, 'button component should exist in registry');
    assert.ok(button.figma, 'figma object should be present');
    assert.equal(
      button.figma.page_name,
      'Components',
      'page_name should be exposed',
    );
    assert.deepEqual(button.visual_proof, {
      screenshot_url: null,
      image_path: null,
      captured_at: null,
      node_id: null,
      image_sha256: null,
      image_bytes: null,
      image_content_type: null,
      image_width: null,
      image_height: null,
      variants_count: 0,
      variants: [],
    });

    assert.ok(
      Array.isArray(button.figma.variants),
      'variants should be an array',
    );
    assert.equal(button.figma.variants.length, 2, 'should have 2 variants');
    assert.equal(button.figma.variants[0].name, 'default');
    assert.deepEqual(button.figma.variants[0].properties, { state: 'default' });

    assert.ok(
      Array.isArray(button.figma.token_bindings),
      'token_bindings should be an array',
    );
    assert.equal(
      button.figma.token_bindings.length,
      1,
      'should have 1 token binding',
    );
    assert.equal(button.figma.token_bindings[0].variable_id, 'var-123');
    assert.equal(button.figma.token_bindings[0].token_path, 'blue.500');

    assert.ok(Array.isArray(button.figma.layout), 'layout should be an array');
    assert.equal(button.figma.layout.length, 1, 'should have 1 layout row');
    assert.equal(button.figma.layout[0].direction, 'Horizontal');
    assert.equal(button.figma.layout[0].item_spacing, 8);
    assert.deepEqual(button.figma.layout[0].padding, {
      top: 4,
      right: 12,
      bottom: 4,
      left: 12,
    });
  } finally {
    await cleanup();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
