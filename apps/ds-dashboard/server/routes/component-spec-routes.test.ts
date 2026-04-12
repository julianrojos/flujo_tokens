/**
 * Component Spec Routes Tests (DB-first)
 * 
 * Tests for GET /api/component-spec/:slug and PATCH /api/component-spec/:slug/editorial
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { ComponentRepository } from '../db/component-repository.js';
import { createInMemoryDbFromSchema } from '../db/test-db-helpers.ts';
import { registerComponentSpecRoutes } from './component-spec-routes.mjs';
import { Hono } from 'hono';

function createTestDb(): Database.Database {
  return createInMemoryDbFromSchema({
    designSystems: [{ id: 'sys-01', name: 'Test System' }],
  });
}

function createFailJson() {
  return (c: any, statusCode: number, payload: any) =>
    c.json({ ok: false, code: payload.code, userMessage: payload.userMessage }, statusCode);
}

function createTestApp(componentRepo: ComponentRepository) {
  const app = new Hono();
  registerComponentSpecRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ repoRoot: '/repo', systemId: 'sys-01' }),
    isDevRuntime: () => true,
    readJsonBody: async () => ({}),
    resolveRepoFilePath: () => null,
    sha256Text: () => 'hash',
    componentRepo,
  });
  return app;
}

describe('component-spec-routes (DB-first)', () => {
  let db: Database.Database;
  let repo: ComponentRepository;
  let app: Hono;

  before(() => {
    db = createTestDb();
    repo = new ComponentRepository(db);
    app = createTestApp(repo);
  });

  after(() => {
    if (db) db.close();
  });

  it('returns 404 for non-existent component', async () => {
    const res = await app.request('/api/component-spec/nonexistent');
    assert.equal(res.status, 404);
    const payload = await res.json();
    assert.equal(payload.userMessage, 'Component "nonexistent" not found');
  });

  it('does not expose legacy editorial-suggestion routes', async () => {
    const res = await app.request('/api/component-spec/button/editorial-suggestion');
    assert.equal(res.status, 404);
  });

  it('does not expose legacy editorial-suggestion discard route', async () => {
    const res = await app.request('/api/component-spec/button/editorial-suggestion/discard', {
      method: 'POST',
    });
    assert.equal(res.status, 404);
  });

  it('does not expose legacy editorial-suggestion mark-applied route', async () => {
    const res = await app.request('/api/component-spec/button/editorial-suggestion/mark-applied', {
      method: 'POST',
    });
    assert.equal(res.status, 404);
  });

  it('passes x-ds-system header to getSystemContext', async () => {
    let capturedHeader: string | undefined;
    const appWithSpy = new Hono();
    registerComponentSpecRoutes(appWithSpy, {
      failJson: createFailJson(),
      getSystemContext: (header?: string) => {
        capturedHeader = header;
        return { repoRoot: '/repo', systemId: 'sys-01' };
      },
      componentRepo: repo,
    });

    await appWithSpy.request('/api/component-spec/button', {
      headers: { 'x-ds-system': 'sys-01' },
    });
    assert.equal(capturedHeader, 'sys-01');
  });

  it('GET returns 200 with exists=false when no editorial row', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'button', name: 'Button', status: 'draft', docType: 'component' },
    ]);

    const res = await app.request('/api/component-spec/button');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.exists, false);
    // Anatomy is no longer returned in spec
    assert.equal(payload.spec?.anatomy, undefined);
  });

  it('GET exposes figma_token_bindings as an array payload', async () => {
    repo.upsertFromRegistry('sys-01', [
      {
        slug: 'badge',
        name: 'Badge',
        status: 'draft',
        docType: 'component',
        figma: {
          tokenBindings: [
            {
              nodeId: '10:2',
              nodeName: 'Badge',
              field: 'fills',
              variableId: 'var:123',
              tokenPath: 'color.badge.background',
              mode: 'Default',
            },
          ],
        },
      },
    ]);

    const res = await app.request('/api/component-spec/badge');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.spec?.figma_token_bindings));
    assert.equal(payload.spec.figma_token_bindings.length, 1);
    assert.equal(payload.spec.figma_token_bindings[0].node_id, '10:2');
    assert.equal(payload.spec.figma_token_bindings[0].variable_id, 'var:123');
  });

  it('GET builds figma_metadata from component record, not from token bindings', async () => {
    repo.upsertFromRegistry('sys-01', [
      {
        slug: 'chip',
        name: 'Chip',
        status: 'draft',
        docType: 'component',
        figma: {
          fileUrl: 'https://www.figma.com/file/ABC123/My-File',
          componentSetNodeId: '77:88',
          pageName: 'Components',
          tokenBindings: [
            {
              nodeId: '10:999',
              nodeName: 'Internal node',
              field: 'fills',
              variableId: 'var:chip',
            },
          ],
        },
      },
    ]);

    const res = await app.request('/api/component-spec/chip');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.spec.figma_metadata?.page_name, 'Components');
    assert.equal(payload.spec.figma_metadata?.component_set_node_id, '77:88');
    assert.equal(payload.spec.figma_metadata?.file_url, 'https://www.figma.com/file/ABC123/My-File');
  });

  it('GET keeps figma_metadata when pageName is missing but file/node are present', async () => {
    repo.upsertFromRegistry('sys-01', [
      {
        slug: 'tag',
        name: 'Tag',
        status: 'draft',
        docType: 'component',
        figma: {
          fileUrl: 'https://www.figma.com/file/TAG123/Tag-File',
          componentSetNodeId: '11:22',
        },
      },
    ]);

    const res = await app.request('/api/component-spec/tag');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.spec.figma_metadata?.page_name, null);
    assert.equal(payload.spec.figma_metadata?.component_set_node_id, '11:22');
    assert.equal(payload.spec.figma_metadata?.file_url, 'https://www.figma.com/file/TAG123/Tag-File');
  });

  it('GET returns 200 with exists=true when editorial row exists', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'card', name: 'Card', status: 'draft', docType: 'component' },
    ]);

    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'card') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
    `).run(component.id, JSON.stringify({ purpose: 'A card component' }));

    const res = await app.request('/api/component-spec/card');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.exists, true);
  });

  it('PATCH /editorial returns 200 when creating editorial row', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'input', name: 'Input', status: 'draft', docType: 'component' },
    ]);

    const res = await app.request('/api/component-spec/input/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: { summary: { purpose: 'An input component' } },
      }),
    });

    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.savedKeys, ['summary']);
  });

  it('PATCH /editorial returns 400 for unknown fields', async () => {
    const res = await app.request('/api/component-spec/button/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: { unknown_field: 'value' },
      }),
    });

    assert.equal(res.status, 400);
  });

  it('PATCH /editorial returns 400 for non-integer expectedUpdatedAt', async () => {
    const res = await app.request('/api/component-spec/button/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: 'not-a-number',
        fields: { summary: { purpose: 'x' } },
      }),
    });

    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, 'invalid.expected_updated_at');
  });

  it('PATCH /editorial returns 409 for optimistic locking conflict', async () => {
    // First create editorial row with known updatedAt
    repo.upsertFromRegistry('sys-01', [
      { slug: 'checkbox', name: 'Checkbox', status: 'draft', docType: 'component' },
    ]);
    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'checkbox') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, ?, 1000)
    `).run(component.id, JSON.stringify({ purpose: 'Old' }));

    // Try to update with wrong expectedUpdatedAt
    const res = await app.request('/api/component-spec/checkbox/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: 999999, // Wrong timestamp
        fields: { summary: { purpose: 'New' } },
      }),
    });

    assert.equal(res.status, 409);
    const payload = await res.json();
    assert.equal(payload.code, 'optimistic_lock_failed');
  });

  it('PATCH /editorial returns 400 when updating existing row without expectedUpdatedAt', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'radio', name: 'Radio', status: 'draft', docType: 'component' },
    ]);
    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'radio') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, ?, 2000)
    `).run(component.id, JSON.stringify({ purpose: 'Old radio' }));

    const res = await app.request('/api/component-spec/radio/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: { summary: { purpose: 'New radio' } },
      }),
    });

    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, 'invalid.expected_updated_at');
  });

  it('PATCH /editorial stores accessibility.notes only in accessibility_notes_json', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'a11y-notes', name: 'A11y Notes', status: 'draft', docType: 'component' },
    ]);

    const res = await app.request('/api/component-spec/a11y-notes/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          accessibility: {
            role: 'button',
            labeling: { rules: ['Rule 1'] },
            notes: ['Screen reader validated'],
          },
        },
      }),
    });

    assert.equal(res.status, 200);
    const row = db.prepare(`
      SELECT accessibility_json, accessibility_notes_json
      FROM component_editorial e
      JOIN components c ON c.id = e.component_id
      WHERE c.ds_id = ? AND c.slug = ?
    `).get('sys-01', 'a11y-notes') as {
      accessibility_json: string | null;
      accessibility_notes_json: string | null;
    };

    assert.ok(row.accessibility_json);
    const accessibilityJson = JSON.parse(row.accessibility_json as string) as Record<string, unknown>;
    assert.equal('notes' in accessibilityJson, false);
    assert.deepEqual(JSON.parse(row.accessibility_notes_json as string), ['Screen reader validated']);
  });

  it('PATCH /editorial with notes-only preserves existing accessibility_json', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'a11y-preserve', name: 'A11y Preserve', status: 'draft', docType: 'component' },
    ]);
    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'a11y-preserve') as { id: number };
    const originalAccessibility = {
      role: 'button',
      focus: { tokens: { inner: '{color.focus.inner}' } },
      labeling: { rules: ['Rule A'] },
    };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, accessibility_json, updated_at)
      VALUES (?, ?, 1111)
    `).run(component.id, JSON.stringify(originalAccessibility));

    const res = await app.request('/api/component-spec/a11y-preserve/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: 1111,
        fields: {
          accessibility: {
            notes: ['Keep original accessibility object'],
          },
        },
      }),
    });

    assert.equal(res.status, 200);
    const row = db.prepare(`
      SELECT accessibility_json, accessibility_notes_json
      FROM component_editorial e
      JOIN components c ON c.id = e.component_id
      WHERE c.ds_id = ? AND c.slug = ?
    `).get('sys-01', 'a11y-preserve') as {
      accessibility_json: string | null;
      accessibility_notes_json: string | null;
    };

    assert.deepEqual(JSON.parse(row.accessibility_json as string), originalAccessibility);
    assert.deepEqual(JSON.parse(row.accessibility_notes_json as string), ['Keep original accessibility object']);
  });

  it('PATCH /editorial persists variants and omits tokens from GET response', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'vt-test', name: 'VT Test', status: 'draft', docType: 'component' },
    ]);

    const variants = [
      { id: 'v1', name: 'Primary', description: 'Primary variant', properties: { variant: 'primary' } },
      { id: 'v2', name: 'Secondary', description: 'Secondary variant', properties: { variant: 'secondary' } },
    ];

    const patchRes = await app.request('/api/component-spec/vt-test/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          summary: { purpose: 'Test component' },
          variants,
        },
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchPayload = await patchRes.json();
    assert.equal(patchPayload.ok, true);
    assert.ok(patchPayload.savedKeys.includes('variants'));

    const getRes = await app.request('/api/component-spec/vt-test');
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.ok, true);
    assert.equal(getPayload.exists, true);
    assert.deepEqual(getPayload.spec.variants, variants);
    assert.equal('tokens' in getPayload.spec, false);
  });

  it('PATCH /editorial persists properties, best_practices, content_guidelines, and accessibility labeling', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'menu-button', name: 'Menu Button', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/menu-button/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          summary: {
            purpose: 'Opens a menu',
            when_to_use: 'Use when actions are contextual',
            when_not_to_use: 'Avoid for single primary actions',
          },
          properties: [
            {
              name: 'size',
              type: 'enum',
              values: ['sm', 'md'],
              default: 'md',
              required: false,
              description: 'Controls the button size',
            },
          ],
          best_practices: {
            do: ['Keep the trigger label concise'],
            dont: ['Use as a generic submit button'],
          },
          content_guidelines: {
            rules: ['Use a verb that reflects the menu content'],
          },
          accessibility: {
            role: 'button',
            labeling: { rules: ['If icon-only, provide an accessible name'] },
            notes: ['Supports keyboard activation'],
          },
        },
      }),
    });

    assert.equal(patchRes.status, 200);
    const patchPayload = await patchRes.json();
    assert.ok(patchPayload.savedKeys.includes('properties'));
    assert.ok(patchPayload.savedKeys.includes('best_practices'));
    assert.ok(patchPayload.savedKeys.includes('content_guidelines'));
    assert.ok(patchPayload.savedKeys.includes('accessibility'));

    const getRes = await app.request('/api/component-spec/menu-button');
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.deepEqual(getPayload.spec.summary, {
      purpose: 'Opens a menu',
      when_to_use: 'Use when actions are contextual',
      when_not_to_use: 'Avoid for single primary actions',
    });
    assert.deepEqual(getPayload.spec.properties, [
      {
        name: 'size',
        type: 'enum',
        values: ['sm', 'md'],
        default: 'md',
        required: false,
        description: 'Controls the button size',
      },
    ]);
    assert.deepEqual(getPayload.spec.best_practices, {
      do: ['Keep the trigger label concise'],
      dont: ['Use as a generic submit button'],
    });
    assert.deepEqual(getPayload.spec.content_guidelines, {
      rules: ['Use a verb that reflects the menu content'],
    });
    assert.equal(getPayload.spec.accessibility.role, 'button');
    assert.deepEqual(getPayload.spec.accessibility.labeling, {
      rules: ['If icon-only, provide an accessible name'],
    });
    assert.deepEqual(getPayload.spec.accessibility.notes, ['Supports keyboard activation']);
  });

  it('PATCH /editorial rejects tokens as an unknown field', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'vt-legacy', name: 'VT Legacy', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/vt-legacy/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          tokens: [{ name: 'fill-primary', value: '#6366F1', type: 'color' }],
        },
      }),
    });

    assert.equal(patchRes.status, 400);
    const payload = await patchRes.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'invalid.field');
    assert.match(String(payload.userMessage), /Unknown field: tokens/);
  });

  it('PATCH /editorial rejects token_mapping as an unknown field', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'legacy-token-mapping', name: 'Legacy Token Mapping', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/legacy-token-mapping/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          token_mapping: {
            surface: { default: 'color.surface.default' },
          },
        },
      }),
    });

    assert.equal(patchRes.status, 400);
    const payload = await patchRes.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'invalid.field');
    assert.match(String(payload.userMessage), /Unknown field: token_mapping/);
  });

  it('PATCH /editorial rejects malformed properties payload', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'bad-properties', name: 'Bad Properties', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/bad-properties/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          properties: [
            { type: 'enum', values: ['a', 'b'] },
          ],
        },
      }),
    });

    assert.equal(patchRes.status, 400);
    const payload = await patchRes.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'invalid.field');
    assert.match(String(payload.userMessage), /Invalid field: properties/);
  });

  it('PATCH /editorial rejects malformed best_practices payload', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'bad-best-practices', name: 'Bad Best Practices', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/bad-best-practices/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          best_practices: 'invalid',
        },
      }),
    });

    assert.equal(patchRes.status, 400);
    const payload = await patchRes.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'invalid.field');
    assert.match(String(payload.userMessage), /Invalid field: best_practices/);
  });

  it('PATCH /editorial rejects malformed best_practices.do shape', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'bad-best-practices-shape', name: 'Bad Best Practices Shape', status: 'draft', docType: 'component' },
    ]);

    const patchRes = await app.request('/api/component-spec/bad-best-practices-shape/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          best_practices: { do: 'invalid' },
        },
      }),
    });

    assert.equal(patchRes.status, 400);
    const payload = await patchRes.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'invalid.field');
    assert.match(String(payload.userMessage), /Invalid field: best_practices/);
  });

  it('PATCH /editorial with summary: null clears summary_json and returns summary = null', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'clear-summary', name: 'Clear Summary', status: 'draft', docType: 'component' },
    ]);

    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'clear-summary') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, ?, 5000)
    `).run(component.id, JSON.stringify({ purpose: 'Will be cleared' }));

    const patchRes = await app.request('/api/component-spec/clear-summary/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: 5000,
        fields: { summary: null },
      }),
    });

    assert.equal(patchRes.status, 200);

    const row = db.prepare(`
      SELECT summary_json
      FROM component_editorial e
      JOIN components c ON c.id = e.component_id
      WHERE c.ds_id = ? AND c.slug = ?
    `).get('sys-01', 'clear-summary') as { summary_json: string | null };
    assert.equal(row.summary_json, null);

    const getRes = await app.request('/api/component-spec/clear-summary');
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.spec.summary, null);
  });

  it('PATCH /editorial with accessibility: null clears both accessibility columns', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'clear-a11y', name: 'Clear A11y', status: 'draft', docType: 'component' },
    ]);

    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'clear-a11y') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, accessibility_json, accessibility_notes_json, updated_at)
      VALUES (?, ?, ?, 5100)
    `).run(
      component.id,
      JSON.stringify({ role: 'button', labeling: { rules: ['Rule 1'] } }),
      JSON.stringify(['legacy note']),
    );

    const patchRes = await app.request('/api/component-spec/clear-a11y/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: 5100,
        fields: { accessibility: null },
      }),
    });

    assert.equal(patchRes.status, 200);

    const row = db.prepare(`
      SELECT accessibility_json, accessibility_notes_json
      FROM component_editorial e
      JOIN components c ON c.id = e.component_id
      WHERE c.ds_id = ? AND c.slug = ?
    `).get('sys-01', 'clear-a11y') as {
      accessibility_json: string | null;
      accessibility_notes_json: string | null;
    };
    assert.equal(row.accessibility_json, null);
    assert.equal(row.accessibility_notes_json, null);

    const getRes = await app.request('/api/component-spec/clear-a11y');
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.spec.accessibility, null);
  });

  it('exposes layer_token_mapping in GET /api/component-spec/:slug', async () => {
    // Use the existing sys-01 design system (configured in test app)
    db.prepare(`
      INSERT INTO components (ds_id, slug, name, status, doc_type)
      VALUES ('sys-01', 'ltm-button', 'LTM Button', 'draft', 'component')
    `).run();

    const comp = db.prepare("SELECT id FROM components WHERE slug = 'ltm-button' AND ds_id = 'sys-01'").get() as { id: number };
    db.prepare(`
      INSERT INTO component_figma_token_bindings (
        component_id, node_id, node_name, field, variable_id, token_path, mode,
        variant_node_id, variant_signature, property_path, status, mode_id, mode_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comp.id, '10:1', 'Button/Default', 'fills', '123:456', 'primitives.blue.500', 'Default',
      '10:0', 'State=Default', 'fills', 'resolved', 'mode:1', 'Default',
    );
    db.prepare(`
      INSERT INTO component_figma_token_bindings (
        component_id, node_id, node_name, field, variable_id, token_path, mode,
        variant_node_id, variant_signature, property_path, status, mode_id, mode_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comp.id, '10:2', 'Button/Hover', 'fills', '999:999', null, 'Default',
      '10:3', 'State=Hover', 'fills', 'unresolved', 'mode:1', 'Default',
    );

    // Create an editorial row so exists=true
    db.prepare(`
      INSERT INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, '{"purpose":"test"}', strftime('%s', 'now'))
    `).run(comp.id);

    const res = await app.request('/api/component-spec/ltm-button');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.exists, true);
    assert.ok(Array.isArray(payload.spec.layer_token_mapping));
    assert.equal(payload.spec.layer_token_mapping.length, 2);

    const resolved = payload.spec.layer_token_mapping.find((e: any) => e.status === 'resolved');
    assert.ok(resolved);
    assert.equal(resolved.variant_node_id, '10:0');
    assert.equal(resolved.variant_signature, 'State=Default');
    assert.equal(resolved.layer_node_id, '10:1');
    assert.equal(resolved.token_path, 'primitives.blue.500');

    const unresolved = payload.spec.layer_token_mapping.find((e: any) => e.status === 'unresolved');
    assert.ok(unresolved);
    assert.equal(unresolved.variant_node_id, '10:3');
    assert.equal(unresolved.variant_signature, 'State=Hover');
    assert.equal(unresolved.token_path, null);
  });

  it('GET /api/component-spec/:slug does not expose token_mapping', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'token-mapping-cutover', name: 'Token Mapping Cutover', status: 'draft', docType: 'component' },
    ]);

    const component = db.prepare(
      'SELECT id FROM components WHERE ds_id = ? AND slug = ?',
    ).get('sys-01', 'token-mapping-cutover') as { id: number };

    db.prepare(`
      INSERT OR REPLACE INTO component_editorial (component_id, summary_json, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
    `).run(
      component.id,
      JSON.stringify({ purpose: 'Legacy editorial row with token mapping' }),
    );

    const res = await app.request('/api/component-spec/token-mapping-cutover');
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.exists, true);
    assert.equal('token_mapping' in payload.spec, false);
  });
});
