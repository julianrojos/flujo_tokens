import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Hono } from 'hono';

import { bootstrapDatabase } from '../db/db-service.js';
import { ComponentRepository } from '../db/component-repository.js';
import { persistCapturePayloadToComponentRepo } from './capture-db-persistence-service.ts';
import { handleComponentRegistryRoute } from './registry-route-handler-service.mjs';

test('e2e: capture payload upserts DB and /api/component-registry exposes visual proof pipeline', async () => {
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

  const dbPath = path.join(
    tmpRoot,
    'apps',
    'ds-dashboard',
    'server',
    'db',
    'ds-dashboard.db',
  );
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = bootstrapDatabase({ dbPath });

  try {
    db.prepare(
      `INSERT INTO design_systems (id, name, collections) VALUES (?, ?, ?)`,
    ).run(systemId, 'E2E System', '[]');

    const componentRepo = new ComponentRepository(db);

    // Insert component via upsertFromRegistry
    componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'button',
        name: 'Button',
        status: 'ready',
        docType: 'component',
        figma: { fileUrl: 'https://figma.com/file/ABC123', componentSetNodeId: '1:2' },
      },
    ]);

    // Insert editorial row to make spec.exists = true (DB-first, no YAML)
    db.prepare(`
      INSERT INTO component_editorial (component_id, summary_json, updated_at)
      SELECT id, '{"purpose": "A button component"}', strftime('%s', 'now')
      FROM components WHERE ds_id = ? AND slug = ?
    `).run(systemId, 'button');

    const persisted = persistCapturePayloadToComponentRepo({
      payload: {
        source: {
          file_key: 'ABC123',
        },
        targets: [
          {
            slug: 'button',
            node_id: '1:2',
            markdown_path: docPathAbs,
          },
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
        failJson: (ctx: any, status: number, payload: unknown) => ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    const button = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'button')
      : null;

    assert.ok(button);
    assert.equal(button.visual_proof.exists, true);
    assert.equal(
      button.visual_proof.screenshot_url,
      'https://cdn.example.com/button.png',
    );
    assert.equal(button.visual_proof.variants_count, 1);
    assert.ok(Array.isArray(button.visual_proof.variants));
    assert.equal(button.visual_proof.variants.length, 1);
    assert.equal(button.pipeline_stage, 'visual-proof');
    assert.equal(payload.summary?.with_visual_proof, 1);
    assert.equal(button.spec.exists, true, 'spec.exists should be true (editorial row exists)');
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors in test cleanup
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('e2e: component-registry marks visual_proof.exists=false when local image path is missing on filesystem', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-dashboard-e2e-missing-proof-'));
  const systemId = 'sys-e2e-missing-proof';
  const docPathRel = `design-systems/${systemId}/docs/components/chip.md`;
  const imagePathRel = `design-systems/${systemId}/docs/_generated/visual-proofs/images/chip.png`;

  const docPathAbs = path.join(tmpRoot, docPathRel);

  fs.mkdirSync(path.dirname(docPathAbs), { recursive: true });
  fs.writeFileSync(docPathAbs, '# Chip\n', 'utf8');

  const dbPath = path.join(
    tmpRoot,
    'apps',
    'ds-dashboard',
    'server',
    'db',
    'ds-dashboard.db',
  );
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = bootstrapDatabase({ dbPath });

  try {
    db.prepare(
      `INSERT INTO design_systems (id, name, collections) VALUES (?, ?, ?)`,
    ).run(systemId, 'E2E Missing Proof System', '[]');

    const componentRepo = new ComponentRepository(db);

    // Insert component via upsertFromRegistry
    componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'chip',
        name: 'Chip',
        status: 'draft',
        docType: 'component',
        figma: { fileUrl: 'https://figma.com/file/MISSING1', componentSetNodeId: '7:7' },
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
            local_image_path: path.join(tmpRoot, imagePathRel),
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
        failJson: (ctx: any, status: number, payload: unknown) => ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    const chip = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'chip')
      : null;
    assert.ok(chip);
    assert.equal(chip.visual_proof.exists, false);
    assert.equal(chip.visual_proof.image_path, imagePathRel);
    assert.ok(Array.isArray(chip.visual_proof.variants));
    assert.equal(chip.visual_proof.variants_count, 0);
    assert.equal(chip.spec.exists, false, 'spec.exists should be false (no editorial row)');
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors in test cleanup
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('e2e: component-registry keeps visual_proof.exists=false when screenshot_url exists but local image is missing', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-dashboard-e2e-missing-proof-url-'));
  const systemId = 'sys-e2e-missing-proof-url';
  const docPathRel = `design-systems/${systemId}/docs/components/tag.md`;
  const imagePathRel = `design-systems/${systemId}/docs/_generated/visual-proofs/images/tag.png`;

  const docPathAbs = path.join(tmpRoot, docPathRel);

  fs.mkdirSync(path.dirname(docPathAbs), { recursive: true });
  fs.writeFileSync(docPathAbs, '# Tag\n', 'utf8');

  const dbPath = path.join(
    tmpRoot,
    'apps',
    'ds-dashboard',
    'server',
    'db',
    'ds-dashboard.db',
  );
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = bootstrapDatabase({ dbPath });

  try {
    db.prepare(
      `INSERT INTO design_systems (id, name, collections) VALUES (?, ?, ?)`,
    ).run(systemId, 'E2E Missing Proof URL System', '[]');

    const componentRepo = new ComponentRepository(db);

    // Insert component via upsertFromRegistry
    componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'tag',
        name: 'Tag',
        status: 'draft',
        docType: 'component',
        figma: { fileUrl: 'https://figma.com/file/MISSING2', componentSetNodeId: '8:8' },
      },
    ]);

    const persisted = persistCapturePayloadToComponentRepo({
      payload: {
        source: { file_key: 'MISSING2' },
        captured: [
          {
            slug: 'tag',
            node_id: '8:8',
            markdown_path: docPathAbs,
            local_image_path: path.join(tmpRoot, imagePathRel),
            screenshot_url: 'https://cdn.example.com/tag.png',
            variants_count: 0,
            captured_at: '2026-03-31T12:00:00.000Z',
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
        failJson: (ctx: any, status: number, payload: unknown) => ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    const tag = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'tag')
      : null;
    assert.ok(tag);
    assert.equal(tag.visual_proof.exists, false);
    assert.equal(tag.visual_proof.image_path, imagePathRel);
    assert.equal(tag.visual_proof.screenshot_url, 'https://cdn.example.com/tag.png');
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors in test cleanup
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('e2e: /api/component-registry exposes structured Figma data (pageName, layout, variants, tokenBindings)', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-dashboard-e2e-structured-'));
  const systemId = 'sys-e2e-structured';

  const dbPath = path.join(
    tmpRoot,
    'apps',
    'ds-dashboard',
    'server',
    'db',
    'ds-dashboard.db',
  );
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = bootstrapDatabase({ dbPath });

  try {
    db.prepare(
      `INSERT INTO design_systems (id, name, collections) VALUES (?, ?, ?)`,
    ).run(systemId, 'E2E Structured System', '[]');

    const componentRepo = new ComponentRepository(db);

    // Upsert component with structured Figma data
    componentRepo.upsertFromRegistry(systemId, [
      {
        slug: 'button',
        name: 'Button',
        status: 'ready',
        figma: {
          fileUrl: 'https://figma.com/file/ABC123',
          componentSetNodeId: '1:1',
          pageName: 'Components',
          variants: [
            { name: 'default', properties: { state: 'default' }, nodeId: '1:2' },
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
        failJson: (ctx: any, status: number, payload: unknown) => ctx.json(payload, status),
        getSystemContext: () => ({ systemId, repoRoot: tmpRoot }),
        componentRepo,
      } as any),
    );

    const res = await app.request('http://localhost/api/component-registry');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    const button = Array.isArray(payload.components)
      ? payload.components.find((entry: any) => entry.slug === 'button')
      : null;

    assert.ok(button, 'button component should exist in registry');

    // Verify structured Figma data exposed
    assert.ok(button.figma, 'figma object should be present');
    assert.equal(button.figma.page_name, 'Components', 'page_name should be exposed');

    // Verify variants
    assert.ok(Array.isArray(button.figma.variants), 'variants should be an array');
    assert.equal(button.figma.variants.length, 2, 'should have 2 variants');
    assert.equal(button.figma.variants[0].name, 'default');
    assert.deepEqual(button.figma.variants[0].properties, { state: 'default' });

    // Verify tokenBindings
    assert.ok(Array.isArray(button.figma.token_bindings), 'token_bindings should be an array');
    assert.equal(button.figma.token_bindings.length, 1, 'should have 1 token binding');
    assert.equal(button.figma.token_bindings[0].variable_id, 'var-123');
    assert.equal(button.figma.token_bindings[0].token_path, 'blue.500');

    // Verify layout
    assert.ok(Array.isArray(button.figma.layout), 'layout should be an array');
    assert.equal(button.figma.layout.length, 1, 'should have 1 layout row');
    assert.equal(button.figma.layout[0].direction, 'Horizontal');
    assert.equal(button.figma.layout[0].item_spacing, 8);
    assert.deepEqual(button.figma.layout[0].padding, { top: 4, right: 12, bottom: 4, left: 12 });
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors in test cleanup
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
