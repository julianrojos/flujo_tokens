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
    const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'button') as { id: number };
    db.prepare(`
      INSERT OR REPLACE INTO component_figma_anatomy (component_id, anatomy_json, properties_json, run_id, captured_at, schema_version)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'), 1)
    `).run(
      component.id,
      JSON.stringify([{ id: 'root', name: 'Root', type: 'FRAME' }]),
      JSON.stringify([{ name: 'state', type: 'enum', default: 'default', required: false, description: '' }]),
      'run-test',
    );

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

  describe('editorial suggestions', () => {
    before(() => {
      repo.upsertFromRegistry('sys-01', [
        { slug: 'suggestion-test', name: 'Suggestion Test', status: 'draft', docType: 'component' },
      ]);
      const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'suggestion-test') as { id: number };
      db.prepare(`
        INSERT INTO component_editorial_suggestions (component_id, job_id, patch_json, created_at)
        VALUES (?, 'job-sug-test', ?, strftime('%s', 'now'))
      `).run(component.id, JSON.stringify({ schemaVersion: 1, summary: { purpose: 'AI suggested' } }));
    });

    it('GET /editorial-suggestion returns pending suggestion', async () => {
      const res = await app.request('/api/component-spec/suggestion-test/editorial-suggestion');
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.ok(payload.suggestion);
      assert.equal(payload.suggestion.jobId, 'job-sug-test');
      assert.equal(payload.suggestion.patch.summary.purpose, 'AI suggested');
    });

    it('GET /editorial-suggestion returns null when no suggestion', async () => {
      // Use a component that exists but has no suggestion
      repo.upsertFromRegistry('sys-01', [
        { slug: 'no-suggestion', name: 'No Suggestion', status: 'draft', docType: 'component' },
      ]);
      const res = await app.request('/api/component-spec/no-suggestion/editorial-suggestion');
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.suggestion, null);
    });

    it('POST /editorial-suggestion/discard marks suggestion as discarded', async () => {
      const res = await app.request('/api/component-spec/suggestion-test/editorial-suggestion/discard', {
        method: 'POST',
      });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.message, 'Suggestion discarded');

      // Verify it's no longer returned as pending
      const getRes = await app.request('/api/component-spec/suggestion-test/editorial-suggestion');
      const getPayload = await getRes.json();
      assert.equal(getPayload.suggestion, null);
    });

    it('POST /editorial-suggestion/mark-applied marks suggestion as applied', async () => {
      // Re-insert a suggestion
      const component = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'suggestion-test') as { id: number };
      db.prepare(`
        INSERT INTO component_editorial_suggestions (component_id, job_id, patch_json, created_at)
        VALUES (?, 'job-sug-apply', ?, strftime('%s', 'now'))
      `).run(component.id, JSON.stringify({ schemaVersion: 1 }));

      const res = await app.request('/api/component-spec/suggestion-test/editorial-suggestion/mark-applied', {
        method: 'POST',
      });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.message, 'Suggestion marked as applied');

      // Verify it's no longer returned as pending
      const getRes = await app.request('/api/component-spec/suggestion-test/editorial-suggestion');
      const getPayload = await getRes.json();
      assert.equal(getPayload.suggestion, null);
    });

    it('POST /editorial-suggestion/mark-applied rejects suggestionId from another component', async () => {
      repo.upsertFromRegistry('sys-01', [
        { slug: 'suggestion-test-2', name: 'Suggestion Test 2', status: 'draft', docType: 'component' },
      ]);
      const otherComponent = db.prepare('SELECT id FROM components WHERE ds_id = ? AND slug = ?').get('sys-01', 'suggestion-test-2') as { id: number };
      db.prepare(`
        INSERT INTO component_editorial_suggestions (component_id, job_id, patch_json, created_at)
        VALUES (?, 'job-sug-other', ?, strftime('%s', 'now'))
      `).run(otherComponent.id, JSON.stringify({ schemaVersion: 1, summary: { purpose: 'other' } }));

      const otherSuggestion = db.prepare(`
        SELECT id
        FROM component_editorial_suggestions
        WHERE component_id = ? AND job_id = 'job-sug-other'
        LIMIT 1
      `).get(otherComponent.id) as { id: number };

      const res = await app.request('/api/component-spec/suggestion-test/editorial-suggestion/mark-applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: otherSuggestion.id }),
      });
      assert.equal(res.status, 403);
    });
  });

  it('PATCH /editorial with variants and tokens — persists and re-reads correctly', async () => {
    repo.upsertFromRegistry('sys-01', [
      { slug: 'vt-test', name: 'VT Test', status: 'draft', docType: 'component' },
    ]);

    const variants = [
      { id: 'v1', name: 'Primary', description: 'Primary variant', properties: { variant: 'primary' } },
      { id: 'v2', name: 'Secondary', description: 'Secondary variant', properties: { variant: 'secondary' } },
    ];
    const tokens = [
      { name: 'fill-primary', value: '#6366F1', type: 'color', description: 'Primary fill color' },
      { name: 'spacing-sm', value: '8px', type: 'spacing', description: 'Small spacing' },
    ];

    // PATCH to create editorial with variants and tokens
    const patchRes = await app.request('/api/component-spec/vt-test/editorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: null,
        fields: {
          summary: { purpose: 'Test component' },
          variants,
          tokens,
        },
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchPayload = await patchRes.json();
    assert.equal(patchPayload.ok, true);
    assert.ok(patchPayload.savedKeys.includes('variants'));
    assert.ok(patchPayload.savedKeys.includes('tokens'));

    // GET to verify the data was persisted and re-read correctly
    const getRes = await app.request('/api/component-spec/vt-test');
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.ok, true);
    assert.equal(getPayload.exists, true);
    assert.deepEqual(getPayload.spec.variants, variants);
    assert.deepEqual(getPayload.spec.tokens, tokens);
  });
});
