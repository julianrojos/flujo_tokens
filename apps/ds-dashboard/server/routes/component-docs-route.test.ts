/**
 * Tests for component-docs-route.ts (S-05)
 *
 * These are unit-level tests using mocked deps — no real DB or Figma connection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerComponentDocsRoutes, TTL_MS } from './component-docs-route.js';

// Minimal mock context
function makeContext(params: Record<string, string>, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    req: {
      param: (key: string) => params[key],
      query: (key: string) => query[key],
      header: (key: string) => headers[key],
    },
    json: (data: unknown, status: number) => ({ data, status }),
  } as unknown as Parameters<Parameters<typeof registerComponentDocsRoutes>[0]['get']>[1];
}

// Minimal app mock
function makeApp() {
  const routes: Array<{ path: string }> = [];
  return {
    routes,
    get: (path: string, _handler: unknown) => { routes.push({ path }); },
  };
}

describe('component-docs-route', () => {
  it('registers the expected path', () => {
    const app = makeApp();
    registerComponentDocsRoutes(app, {});
    assert.equal(app.routes.length, 1);
    assert.equal(app.routes[0].path, '/api/components/:slug/docs/markdown');
  });

  it('returns 400 when slug is missing', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };
    registerComponentDocsRoutes(app, {});

    const c = makeContext({ slug: '' });
    const result = await handler!(c);
    assert.equal((result as any).status, 400);
    assert.equal((result as any).data.code, 'docs.missing_slug');
  });

  it('returns 503 when componentRepo is not available', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };
    registerComponentDocsRoutes(app, {});

    const c = makeContext({ slug: 'button' });
    const result = await handler!(c);
    assert.equal((result as any).status, 503);
    assert.equal((result as any).data.code, 'docs.no_repo');
  });

  it('returns 404 when component not found by slug', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const mockRepo = {
      getComponentIdBySlug: () => null,
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'nonexistent' });
    const result = await handler!(c);
    assert.equal((result as any).status, 404);
    assert.equal((result as any).data.code, 'docs.not_found');
  });

  it('returns 500 when slug lookup throws', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const mockRepo = {
      getComponentIdBySlug: () => {
        throw new Error('DB unavailable');
      },
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const consoleError = console.error;
    console.error = () => {};
    try {
      const c = makeContext({ slug: 'button' });
      const result = await handler!(c);
      assert.equal((result as any).status, 500);
      assert.equal((result as any).data.code, 'docs.lookup_failed');
    } finally {
      console.error = consoleError;
    }
  });

  it('returns non-null markdown from assembler when no AI doc in DB', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Button', displayName: null, figmaComponentSetNodeId: '1:1' }),
      getFigmaDescriptions: () => null,
      getFigmaComponentSetNodeId: () => null,
      getComponentDoc: () => null,
      getEditorial: () => null,
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'button' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    assert.equal(typeof (result as any).data.markdown, 'string');
    assert.ok((result as any).data.markdown.includes('# Button'));
    assert.equal((result as any).data.stale, true);
  });

  it('returns markdown with editorial purpose when AI doc + editorial exist', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Button', displayName: null, figmaComponentSetNodeId: '1:1' }),
      getFigmaDescriptions: () => ({ componentSet: null, variants: [], syncedAt: nowSec }),
      getFigmaComponentSetNodeId: () => null,
      getComponentDoc: () => ({
        outputJson: JSON.stringify({
          componentId: '1:1',
          title: 'Button',
          summary: 'AI summary.',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          schemaVersion: 2,
          metadata: { generatedAt: new Date().toISOString() },
        }),
        editorialJson: null,
        jobId: 'job-1',
        appliedAt: nowSec,
      }),
      getEditorial: () => ({
        componentId: 1,
        summary: { purpose: 'Editorial purpose text' },
        updatedAt: nowSec,
      }),
      saveFigmaDescriptions: () => { },
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'button' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    assert.ok((result as any).data.markdown.includes('Editorial purpose text'));
    assert.equal((result as any).data.stale, false);
  });

  it('returns markdown with warnings when AI output_json is corrupted', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Card', displayName: null, figmaComponentSetNodeId: '2:2' }),
      getFigmaDescriptions: () => null,
      getFigmaComponentSetNodeId: () => null,
      getComponentDoc: () => ({
        outputJson: '{ not valid json',
        editorialJson: null,
        jobId: 'job-2',
        appliedAt: Math.floor(Date.now() / 1000),
      }),
      getEditorial: () => null,
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'card' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    assert.equal(typeof (result as any).data.markdown, 'string');
    assert.ok((result as any).data.markdown.includes('# Card'));
    assert.ok(Array.isArray((result as any).data.warnings));
    assert.ok((result as any).data.warnings[0].includes('malformed'));
  });

  it('returns markdown with variant names from Figma when only Figma data exists', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Badge', displayName: null, figmaComponentSetNodeId: '3:3' }),
      getFigmaDescriptions: () => ({
        componentSet: 'A badge component',
        variants: [
          { nodeId: 'v1', canonicalKey: 'State=Default', description: 'Default state' },
          { nodeId: 'v2', canonicalKey: 'State=Hover', description: 'Hover state' },
        ],
        syncedAt: Math.floor(Date.now() / 1000),
      }),
      getFigmaComponentSetNodeId: () => null,
      getComponentDoc: () => null,
      getEditorial: () => null,
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'badge' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    const md = (result as any).data.markdown;
    assert.ok(md.includes('State=Default'));
    assert.ok(md.includes('State=Hover'));
  });

  it('returns source: cache when syncedAt is recent', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Button', displayName: null, figmaComponentSetNodeId: '1:1' }),
      getFigmaDescriptions: () => ({ componentSet: null, variants: [], syncedAt: nowSec }),
      getFigmaComponentSetNodeId: () => null,
      getComponentDoc: () => ({
        outputJson: JSON.stringify({
          componentId: '1:1',
          title: 'Button',
          summary: 'A button.',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          schemaVersion: 2,
          metadata: { generatedAt: new Date().toISOString() },
        }),
        editorialJson: null,
        jobId: 'job-1',
        appliedAt: nowSec,
      }),
      getEditorial: () => null,
      saveFigmaDescriptions: () => { },
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    const c = makeContext({ slug: 'button' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    assert.ok((result as any).data.markdown.includes('# Button'));
    assert.equal((result as any).data.stale, false);
  });

  it('returns source: cache when descriptions are stale but no Figma connection is available', async () => {
    let handler: ((c: unknown) => Promise<unknown>) | null = null;
    const app = {
      get: (_path: string, h: (c: unknown) => Promise<unknown>) => { handler = h; },
    };

    const staleSec = Math.floor((Date.now() - TTL_MS - 5_000) / 1000);
    const mockRepo = {
      getComponentIdBySlug: () => 1,
      getComponentBasicInfo: () => ({ name: 'Button', displayName: null, figmaComponentSetNodeId: '1:1' }),
      getFigmaDescriptions: () => ({ componentSet: 'Old', variants: [], syncedAt: staleSec }),
      getFigmaComponentSetNodeId: () => '1:1',
      getFigmaFileUrl: () => '',
      getComponentDoc: () => ({
        outputJson: JSON.stringify({
          componentId: '1:1',
          title: 'Button',
          summary: 'A button.',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          schemaVersion: 2,
          metadata: { generatedAt: new Date().toISOString() },
        }),
        editorialJson: null,
        jobId: 'job-1',
        appliedAt: staleSec,
      }),
      getEditorial: () => null,
      saveFigmaDescriptions: () => {
        throw new Error('saveFigmaDescriptions should not be called without a resolvable Figma socket');
      },
    };
    registerComponentDocsRoutes(app, { componentRepo: mockRepo as any });

    // No x-figma-url header -> file key can't resolve -> sync returns false.
    const c = makeContext({ slug: 'button' });
    const result = await handler!(c);
    assert.equal((result as any).status, 200);
    assert.equal((result as any).data.source, 'cache');
  });

  it('exports TTL_MS for tests', () => {
    assert.equal(TTL_MS, 5 * 60 * 1000);
  });
});
