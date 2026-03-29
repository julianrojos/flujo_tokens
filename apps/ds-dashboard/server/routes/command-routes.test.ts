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
  return (c: any, statusCode: number, args: Record<string, unknown>) => {
    const code = String((args as any).code || 'internal.unknown_error');
    const userMessage = String((args as any).userMessage || 'Request failed.');
    return c.json(
      {
        ok: false,
        message: userMessage,
        code,
        error: {
          code,
          userMessage,
          recoverable: (args as any).recoverable === true,
        },
      },
      statusCode
    );
  };
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
    processEnv: {},
    processCwd: '/repo/apps/ds-dashboard',
    spawnProcessFn: () => ({ unref() { } }),
    setTimeoutFn: (callback: (...args: unknown[]) => void) => {
      callback();
      return 0;
    },
    exitProcessFn: () => { },
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

    it('accepts component args from query when body is empty', async () => {
      const captured: any[] = [];
      const app = createTestApp({
        readJsonBody: async () => ({}),
        enqueueQueueJob: (args: any) => {
          captured.push(args);
          return { id: 'queued_component_doc' };
        },
      });

      const res = await app.request(
        '/api/run/ds:component-doc?component=button&specFile=docs/test-system/_spec/components/button.yml',
        { method: 'POST' },
      );
      assert.equal(res.status, 202);
      assert.equal(captured.length, 1);
      assert.match(String(captured[0]?.label || ''), /--spec-file docs\/test-system\/_spec\/components\/button\.yml/);
    });

    it('accepts legacy query aliases when body is empty', async () => {
      const captured: any[] = [];
      const app = createTestApp({
        readJsonBody: async () => ({}),
        enqueueQueueJob: (args: any) => {
          captured.push(args);
          return { id: 'queued_component_doc_legacy' };
        },
      });

      const res = await app.request(
        '/api/run/ds:component-doc?componentName=button&spec_file=docs/test-system/_spec/components/button.yml',
        { method: 'POST' },
      );
      assert.equal(res.status, 202);
      assert.equal(captured.length, 1);
      assert.match(String(captured[0]?.label || ''), /--spec-file docs\/test-system\/_spec\/components\/button\.yml/);
    });

    it('returns typed error when ds:component-doc args are missing', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({}),
      });

      const res = await app.request('/api/run/ds:component-doc', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'validation.component_doc_args_required');
      assert.match(String((payload as any).message || ''), /componentName|specFile/i);
    });
  });

  describe('/api/admin/restart-api', () => {
    it('requests standalone restart when allowed', async () => {
      const spawnCalls: any[] = [];
      let exitCalled = false;
      const app = createTestApp({
        processEnv: { NODE_ENV: 'development' },
        spawnProcessFn: (...args: unknown[]) => {
          spawnCalls.push(args);
          return { unref() { } };
        },
        setTimeoutFn: (callback: (...args: unknown[]) => void) => {
          callback();
          return 0;
        },
        exitProcessFn: () => {
          exitCalled = true;
        },
      });

      const res = await app.request('/api/admin/restart-api', { method: 'POST' });
      assert.equal(res.status, 202);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal(spawnCalls.length, 1);
      assert.equal(exitCalled, true);
    });

    it('blocks restart when API runs under supervisor', async () => {
      const app = createTestApp({
        processEnv: { NODE_ENV: 'development', DS_DASHBOARD_SUPERVISED: '1' },
      });

      const res = await app.request('/api/admin/restart-api', { method: 'POST' });
      assert.equal(res.status, 409);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'server.restart_requires_supervisor');
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

    it('returns 400 for invalid tokensSource', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/file/abc',
          tokensSource: 'ftp',
        }),
      });
      const res = await app.request('/api/capture-figma-screenshot', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).code, 'validation.invalid_tokens_source');
    });

    it('returns 500 for unexpected builder failure', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/file/abc',
        }),
        toBooleanString: () => {
          throw new Error('unexpected builder failure');
        },
      });
      const res = await app.request('/api/capture-figma-screenshot', { method: 'POST' });
      assert.equal(res.status, 500);
      const payload = await res.json();
      assert.equal((payload as any).code, 'internal.command_build_failed');
    });
  });

  describe('/api/sync-figma-tokens', () => {
    it('returns 400 for invalid tokensSource', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({
          tokensSource: 'invalid',
        }),
      });
      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).code, 'validation.invalid_tokens_source');
    });

    it('returns 500 when sync repositories are missing', async () => {
      const app = createTestApp({
        db: undefined,
        componentRepo: undefined,
      });
      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 500);
      const payload = await res.json();
      assert.equal((payload as any).code, 'internal.sync_dependencies_missing');
    });
  });
});
