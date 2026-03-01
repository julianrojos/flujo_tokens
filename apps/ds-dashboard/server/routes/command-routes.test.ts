/**
 * Command Routes Tests
 *
 * Tests for command API route handlers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerCommandRoutes } from './command-routes.js';

function createFailJson() {
  return (c: any, statusCode: number, args: Record<string, unknown>) =>
    c.json(
      {
        ok: false,
        code: (args as any).code,
        message: (args as any).userMessage,
      },
      statusCode
    );
}

function createBaseDeps(overrides: Record<string, unknown> = {}) {
  return {
    failJson: createFailJson(),
    createApiRequestId: () => 'req_test',
    readJsonBody: async () => ({}),
    getSystemContext: () => ({
      repoRoot: '/repo',
      systemId: 'core',
      healthSnapshotScriptPath: 'tooling/scripts/ds-health-snapshot.mjs',
      tokensFromFigmaScriptPath: 'tooling/scripts/ds-tokens-from-figma.mjs',
      captureFromFigmaUrlScriptPath: 'tooling/scripts/ds-capture-from-figma-url.mjs',
    }),
    queueJobAcceptedPayload: (job: { id: string }) => ({ ok: true, jobId: job.id }),
    enqueueQueueJob: () => ({ id: 'queued_1' }),
    sha256Text: () => 'hash',
    runQueuedSpawnCommand: async () => ({ ok: true }),
    queueNpmScript: () => ({ id: 'npm_job' }),
    enqueueRefreshNamingDebtJob: () => ({ id: 'naming_job' }),
    queueNodeJsonCommand: () => ({ id: 'node_job' }),
    toBooleanString: (value: unknown, fallback: boolean) => {
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return fallback ? 'true' : 'false';
    },
    toNumberString: (value: unknown, fallback: number) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return String(fallback);
      return String(Math.floor(n));
    },
    validateGitRef: (value: string) => String(value || ''),
    ...overrides,
  };
}

function createTestApp(depsOverrides: Record<string, unknown> = {}) {
  const app = new Hono();
  registerCommandRoutes(app, createBaseDeps(depsOverrides));
  return app;
}

describe('command-routes', () => {
  describe('/api/run', () => {
    it('rejects missing script name', async () => {
      const app = createTestApp();
      const res = await app.request('/api/run/%20', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'validation.missing_script_name');
    });
  });

  describe('/api/refresh-registry', () => {
    it('enqueues expected script', async () => {
      const captured: any[] = [];
      const app = createTestApp({
        queueNpmScript: (args: any) => {
          captured.push(args);
          return { id: 'registry_job' };
        },
      });

      const res = await app.request('/api/refresh-registry', {
        method: 'POST',
        headers: { 'x-ds-system': 'core' },
      });
      assert.equal(res.status, 202);
      const payload = await res.json();
      assert.deepEqual(payload, { ok: true, jobId: 'registry_job' });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].script, 'ds:registry:refresh');
      assert.equal(captured[0].systemId, 'core');
    });
  });

  describe('/api/capture-health-snapshot', () => {
    it('validates git ref', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({ beforeRef: 'bad-ref' }),
        validateGitRef: () => null,
      });
      const res = await app.request('/api/capture-health-snapshot', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).code, 'validation.invalid_git_ref');
    });
  });

  describe('/api/capture-figma-screenshot', () => {
    it('requires figmaUrl', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({}),
      });
      const res = await app.request('/api/capture-figma-screenshot', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).code, 'validation.figma_url_required');
    });
  });
});
