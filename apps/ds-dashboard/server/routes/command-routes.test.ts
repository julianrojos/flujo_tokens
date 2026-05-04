/**
 * Command Routes Tests
 *
 * Tests for command API route handlers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerCommandRoutes } from './command-routes.js';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from '../services/plugin-connection-manager.js';

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
        captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
      }),
    queueJobAcceptedPayload: (job: { id: string }) => ({ ok: true, jobId: job.id }),
    enqueueQueueJob: () => ({ id: 'queued_1' }),
    sha256Text: () => 'hash',
    runQueuedSpawnCommand: async () => ({ ok: true }),
    queueNpmScript: () => ({ id: 'npm_job' }),
    queueNodeJsonCommand: () => ({ id: 'node_job' }),
    componentRepo: {
      getAll: () => [],
      upsertFromRegistry: () => 0,
    },
    databaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
    hasPluginSocketForFile: () => true,
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

function makeSocket(onSend: (data: string) => void): PluginWebSocket {
  return {
    readyState: 1,
    protocol: '',
    send(data: string) {
      onSend(data);
    },
    close() { },
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
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

    it('rejects unsupported run scripts', async () => {
      const app = createTestApp();
      const res = await app.request('/api/run/openrouter:sync-model-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ds-system': 'core' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'validation.unsupported_script_name');
    });

  });

  describe('/api/admin/restart-api', () => {
    it('requests dashboard restart when allowed', async () => {
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
      assert.equal((payload as any).restartCommand, 'npm run dashboard:dev');
      assert.equal(spawnCalls.length, 1);
      assert.equal(spawnCalls[0][1][0], 'run');
      assert.equal(spawnCalls[0][1][1], 'dashboard:dev');
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

    it('attaches DB persistence hook to capture jobs', async () => {
      let queuedArgs: any = null;
      const upsertCalls: Array<{ dsId: string; entries: unknown[] }> = [];
      const componentRepo = {
        getBySlug: () => ({
          name: 'Button',
          figmaFileUrl: 'https://www.figma.com/design/OLD',
          figmaComponentSetNodeId: '1:1',
          specs: [{ docPath: 'design-systems/core/docs/components/button.md', docStatus: 'draft', coverage: 0 }],
        }),
        upsertFromRegistry: (dsId: string, entries: unknown[]) => {
          upsertCalls.push({ dsId, entries });
          return entries.length;
        },
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123?node-id=1-2',
        }),
        componentRepo,
        queueNodeJsonCommand: (args: any) => {
          queuedArgs = args;
          return { id: 'node_job_capture' };
        },
      });

      const res = await app.request('/api/capture-figma-screenshot', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(typeof queuedArgs?.onSuccess, 'function');

      await queuedArgs.onSuccess({
        payload: {
          source: { file_key: 'abc123' },
          captured: [
            {
              slug: 'button',
              node_id: '1:2',
              doc_path: 'design-systems/core/docs/components/button.md',
              local_image_path: '/repo/design-systems/core/docs/_generated/visual-proofs/images/button.png',
              screenshot_url: 'https://cdn.example.com/button.png',
              variants_count: 2,
            },
          ],
        },
        emitChunk: () => { },
      });

      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0]?.dsId, 'core');
    });
  });

  describe('/api/sync-design-system', () => {
    it('returns a queued job that records component and variable step results', async () => {
      let queuedArgs: any = null;
      const runCalls: any[] = [];
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async (args: any) => {
          runCalls.push(args);
          assert.equal(typeof args.emitChunk, 'function');
          return {
            ok: true,
            code: 0,
            summary: 'Success',
            payload: {
              ok: true,
              source: { file_key: 'abc123' },
              captured: [
                {
                  slug: 'button',
                  node_id: '1:2',
                  doc_path: 'design-systems/core/docs/components/button.md',
                  local_image_path: 'apps/ds-dashboard/tmp/button.png',
                },
              ],
              targets: [
                {
                  slug: 'button',
                  node_id: '1:2',
                  doc_path: 'design-systems/core/docs/components/button.md',
                },
              ],
            },
          };
        },
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 11,
          tokenModeValues: 4,
          aliases: 2,
          components: 0,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 1,
          usageReindexStatus: 'failed' as const,
          usageReindexReason: 'missing_repo_root' as const,
          usageReindexWarnings: ['Token usage reindex requested but repoRoot is missing.'],
          specYamlGenerated: 0,
          specYamlSkipped: 0,
          specYamlFailed: 0,
          specYamlWarnings: [],
          specsEnriched: 0,
          proofsEnriched: 0,
          dryRun: false,
          importMode: 'full' as const,
          selectedCount: 0,
          notSelectedCount: 0,
        }),
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_job' };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(typeof queuedArgs?.execute, 'function');
      assert.equal(runCalls.length, 0);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(runCalls.length, 1);
      assert.equal(runCalls[0]?.commandArgs?.includes('--component-kind'), true);
      assert.equal(runCalls[0]?.commandArgs?.includes('all'), true);
      assert.equal(runCalls[0]?.commandEnv?.DATABASE_URL, 'postgres://ds:local@localhost:5432/ds_dashboard');
      assert.equal(runCalls[0]?.commandEnv?.TEST_DATABASE_URL, 'postgres://ds:local@localhost:5432/ds_dashboard');
      assert.equal(runCalls[0]?.commandEnv?.DB_PROVIDER, 'local');
      assert.equal(runResult.code, 0);
      assert.equal(runResult.payload?.status, 'completed_with_warnings');
      assert.equal(runResult.payload?.steps?.components?.status, 'completed');
      assert.equal(runResult.payload?.steps?.variables?.status, 'completed_with_warnings');
      assert.ok(Array.isArray(runResult.payload?.warnings));
      assert.ok(runResult.payload?.warnings.includes('Token usage reindex requested but repoRoot is missing.'));
    });

    it('marks the overall sync as completed_with_warnings when components fail but variables complete', async () => {
      let queuedArgs: any = null;
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async () => ({
          ok: false,
          code: 1,
          summary: 'Component capture failed.',
          payload: {
            ok: false,
            failed: [
              {
                slug: 'button',
                reason: 'missing permission',
              },
            ],
            warnings: ['Component capture failed.'],
          },
        }),
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 2,
          tokenModeValues: 1,
          aliases: 0,
          components: 1,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 0,
          usageReindexStatus: 'not-requested' as const,
          usageReindexReason: 'none' as const,
          usageReindexWarnings: [],
          specYamlGenerated: 0,
          specYamlSkipped: 0,
          specYamlFailed: 0,
          specYamlWarnings: [],
          specsEnriched: 0,
          proofsEnriched: 0,
          dryRun: false,
          importMode: 'full' as const,
          selectedCount: 0,
          notSelectedCount: 0,
        }),
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_job_warning' };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(runResult.payload?.status, 'completed_with_warnings');
      assert.equal(runResult.payload?.steps?.components?.status, 'failed');
      assert.equal(runResult.payload?.steps?.variables?.status, 'completed');
    });

    it('treats an empty successful component capture run as completed_with_warnings', async () => {
      let queuedArgs: any = null;
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async () => ({
          ok: true,
          code: 0,
          summary: 'No components found.',
          payload: {
            ok: true,
            captured: [],
            failed: [],
            skipped: [],
            targets: [],
            warnings: ['No components were available to capture.'],
          },
        }),
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 2,
          tokenModeValues: 1,
          aliases: 0,
          components: 0,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 0,
          usageReindexStatus: 'not-requested' as const,
          usageReindexReason: 'none' as const,
          usageReindexWarnings: [],
          specYamlGenerated: 0,
          specYamlSkipped: 0,
          specYamlFailed: 0,
          specYamlWarnings: [],
          specsEnriched: 0,
          proofsEnriched: 0,
          dryRun: false,
          importMode: 'full' as const,
          selectedCount: 0,
          notSelectedCount: 0,
        }),
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_job_empty_components' };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(runResult.payload?.status, 'completed_with_warnings');
      assert.equal(runResult.payload?.steps?.components?.status, 'completed_with_warnings');
      assert.ok(Array.isArray(runResult.payload?.warnings));
      assert.ok(
        runResult.payload?.warnings.includes(
          'No capture targets were resolved from the Figma file.',
        ),
      );
    });

    it('treats skipped component candidates as warnings instead of no components', async () => {
      let queuedArgs: any = null;
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async () => ({
          ok: true,
          code: 0,
          summary: 'Skipped capture candidates.',
          payload: {
            ok: true,
            captured: [],
            failed: [],
            skipped: [
              {
                node_id: '1:2',
                reason: 'slug-resolution-failed',
              },
            ],
            targets: [],
            warnings: ['Component candidate skipped during capture.'],
          },
        }),
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 2,
          tokenModeValues: 1,
          aliases: 0,
          components: 0,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 0,
          usageReindexStatus: 'not-requested' as const,
          usageReindexReason: 'none' as const,
          usageReindexWarnings: [],
          specYamlGenerated: 0,
          specYamlSkipped: 0,
          specYamlFailed: 0,
          specYamlWarnings: [],
          specsEnriched: 0,
          proofsEnriched: 0,
          dryRun: false,
          importMode: 'full' as const,
          selectedCount: 0,
          notSelectedCount: 0,
        }),
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_job_skipped_components' };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(runResult.payload?.status, 'completed_with_warnings');
      assert.equal(runResult.payload?.steps?.components?.status, 'completed_with_warnings');
      assert.ok(Array.isArray(runResult.payload?.warnings));
      assert.ok(
        runResult.payload?.warnings.includes(
          '1 component candidate(s) were skipped during capture.',
        ),
      );
      assert.ok(
        !runResult.payload?.warnings.includes(
          'No capture targets were resolved from the Figma file.',
        ),
      );
    });

    it('marks the overall sync as failed when both steps fail', async () => {
      let queuedArgs: any = null;
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async () => ({
          ok: false,
          code: 1,
          summary: 'Component capture failed.',
          payload: {
            ok: false,
            failed: [
              {
                slug: 'button',
                reason: 'missing permission',
              },
            ],
            warnings: ['Component capture failed.'],
          },
        }),
        syncDesignSystemFromPluginFn: async () => {
          throw new Error('Variable sync failed.');
        },
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_job_failed' };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, false);
      assert.equal(runResult.payload?.status, 'failed');
      assert.equal(runResult.payload?.steps?.components?.status, 'failed');
      assert.equal(runResult.payload?.steps?.variables?.status, 'failed');
    });
  });

  describe('/api/sync-design-system/step/:step', () => {
    it('returns a queued job for rerunning a single failed component step', async () => {
      let queuedArgs: any = null;
      const runCalls: any[] = [];
      const componentRepo = {
        getAll: () => [],
        upsertFromRegistry: () => 1,
      } as any;

      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        db: {} as any,
        componentRepo,
        runQueuedSpawnCommand: async (args: any) => {
          runCalls.push(args);
          return {
            ok: true,
            code: 0,
            summary: 'Success',
            payload: {
              ok: true,
              source: { file_key: 'abc123' },
              captured: [
                {
                  slug: 'button',
                  node_id: '1:2',
                  doc_path: 'design-systems/core/docs/components/button.md',
                  local_image_path: 'apps/ds-dashboard/tmp/button.png',
                },
              ],
              targets: [
                {
                  slug: 'button',
                  node_id: '1:2',
                  doc_path: 'design-systems/core/docs/components/button.md',
                },
              ],
            },
          };
        },
        enqueueQueueJob: (args: any) => {
          queuedArgs = args;
          return { id: 'sync_design_system_step_job' };
        },
      });

      const res = await app.request('/api/sync-design-system/step/components', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(typeof queuedArgs?.execute, 'function');
      assert.equal(runCalls.length, 0);

      const runResult = await queuedArgs.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(runCalls.length, 1);
      assert.equal(runCalls[0]?.commandArgs?.includes('--component-kind'), true);
      assert.equal(runCalls[0]?.commandArgs?.includes('all'), true);
      assert.equal(runCalls[0]?.commandEnv?.DATABASE_URL, 'postgres://ds:local@localhost:5432/ds_dashboard');
      assert.equal(runCalls[0]?.commandEnv?.DB_PROVIDER, 'local');
      assert.equal(runResult.payload?.status, 'completed');
      assert.equal(runResult.payload?.summary, 'Components synced.');
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

    it('returns 409 when there is no plugin socket for the requested Figma file', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({ fileKey: 'figma_file_123' }),
        db: {} as any,
        componentRepo: {} as any,
        hasPluginSocketForFile: () => false,
      });
      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 409);
      const payload = await res.json();
      assert.equal((payload as any).code, 'sync.no_plugin_socket_for_file');
      assert.match(String((payload as any).message || ''), /figma_file_123/);
    });

    it('uses plugin manager fallback path when socket checker is not injected', async () => {
      resetPluginConnectionManager();
      const manager = getPluginConnectionManager();
      let socketId = '';
      const socket = makeSocket((data) => {
        const request = JSON.parse(data) as { id: string };
        manager.handleMessage(
          socketId,
          JSON.stringify({
            id: request.id,
            result: {
              success: true,
              timestamp: Date.now(),
              fileKey: null,
              variables: [],
              variableCollections: [],
            },
          }),
        );
      });
      socketId = manager.register(socket, {
        fileKey: null,
        docName: 'Draft file',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      });
      assert.equal(manager.getConnectionCount(), 1);
      assert.deepEqual(manager.getActiveFileKeys(), []);

      try {
        const app = createTestApp({
          readJsonBody: async () => ({ fileKey: 'figma_file_123' }),
          db: {} as any,
          componentRepo: {} as any,
          hasPluginSocketForFile: undefined,
          enqueueQueueJob: () => ({ id: 'sync_job_preflight_fallback' }),
        });
        const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
        assert.equal(res.status, 202);
      } finally {
        manager.unregister(socketId, 'test-cleanup');
        assert.equal(manager.getConnectionCount(), 0);
        resetPluginConnectionManager();
      }
    });

    it('rejects sync when only a different file socket is connected', async () => {
      resetPluginConnectionManager();
      const manager = getPluginConnectionManager();
      const socket = makeSocket(() => {
        // No request expected: precheck should reject before enqueue/execute.
      });
      const socketId = manager.register(socket, {
        fileKey: 'other_file_999',
        docName: 'Other file',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      });

      try {
        const app = createTestApp({
          readJsonBody: async () => ({ fileKey: 'figma_file_123' }),
          db: {} as any,
          componentRepo: {} as any,
          hasPluginSocketForFile: undefined,
        });
        const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
        assert.equal(res.status, 409);
        const payload = await res.json();
        assert.equal((payload as any).code, 'sync.no_plugin_socket_for_file');
      } finally {
        manager.unregister(socketId, 'test-cleanup');
        resetPluginConnectionManager();
      }
    });

    it('emits usageReindexReason warning chunk when sync reports failed reindex status', async () => {
      const enqueued: any[] = [];
      const app = createTestApp({
        readJsonBody: async () => ({ fileKey: 'figma_file_123' }),
        db: {} as any,
        componentRepo: {} as any,
        hasPluginSocketForFile: () => true,
        enqueueQueueJob: (args: any) => {
          enqueued.push(args);
          return { id: 'sync_job_1' };
        },
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 10,
          tokenModeValues: 12,
          aliases: 2,
          components: 3,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 0,
          usageReindexStatus: 'failed' as const,
          usageReindexReason: 'missing_repo_root' as const,
          usageReindexWarnings: ['Token usage reindex requested but repoRoot is missing.'],
          specYamlGenerated: 0,
          specYamlSkipped: 0,
          specYamlFailed: 0,
          specYamlWarnings: [],
          specsEnriched: 0,
          proofsEnriched: 0,
          dryRun: false,
          importMode: 'full' as const,
          selectedCount: 3,
          notSelectedCount: 0,
        }),
      });

      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(enqueued.length, 1);

      const chunks: Array<{ kind: string; text: string }> = [];
      const runResult = await enqueued[0].execute({
        emitChunk: (kind: string, text: string) => chunks.push({ kind, text }),
      });

      assert.equal(runResult.ok, true);
      assert.ok(
        chunks.some((chunk) =>
          chunk.kind === 'warning' && chunk.text.includes('missing_repo_root')
        )
      );
    });

    it('passes selectedComponentNodeIds to sync service for partial import', async () => {
      const enqueued: any[] = [];
      let receivedSelectedIds: string[] | undefined;
      const app = createTestApp({
        readJsonBody: async () => ({
          fileKey: 'figma_file_123',
          selectedComponentNodeIds: ['node-1', 'node-2', ''],
        }),
        db: {} as any,
        componentRepo: {} as any,
        hasPluginSocketForFile: () => true,
        enqueueQueueJob: (args: any) => {
          enqueued.push(args);
          return { id: 'sync_job_partial' };
        },
        syncDesignSystemFromPluginFn: async (opts: any) => {
          receivedSelectedIds = opts.selectedComponentNodeIds;
          return {
            tokens: 10,
            tokenModeValues: 12,
            aliases: 2,
            components: 2,
            componentsTruncated: false,
            usageRestored: 0,
            usageDropped: 0,
            usageReindexed: 0,
            usageReindexStatus: 'not-requested' as const,
            usageReindexReason: 'none' as const,
            usageReindexWarnings: [],
            specYamlGenerated: 0,
            specYamlSkipped: 0,
            specYamlFailed: 0,
            specYamlWarnings: [],
            specsEnriched: 0,
            proofsEnriched: 0,
            dryRun: false,
            importMode: 'partial' as const,
            selectedCount: 2,
            notSelectedCount: 0,
          };
        },
      });

      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(enqueued.length, 1);

      await enqueued[0].execute({
        emitChunk: () => { },
      });

      assert.deepEqual(receivedSelectedIds, ['node-1', 'node-2']);
    });

    it('forwards requireComponentProofs and requireVariantProofsWhenPresent flags', async () => {
      const enqueued: any[] = [];
      let receivedOptions: any = {};
      const app = createTestApp({
        readJsonBody: async () => ({
          fileKey: 'figma_file_123',
          requireComponentProofs: true,
          requireVariantProofsWhenPresent: true,
        }),
        db: {} as any,
        componentRepo: {} as any,
        hasPluginSocketForFile: () => true,
        enqueueQueueJob: (args: any) => {
          enqueued.push(args);
          return { id: 'sync_job_strict' };
        },
        syncDesignSystemFromPluginFn: async (opts: any) => {
          receivedOptions = opts;
          return {
            tokens: 10,
            tokenModeValues: 12,
            aliases: 2,
            components: 3,
            componentsTruncated: false,
            usageRestored: 0,
            usageDropped: 0,
            usageReindexed: 0,
            usageReindexStatus: 'not_requested' as const,
            usageReindexReason: 'none' as const,
            usageReindexWarnings: [],
            specYamlGenerated: 0,
            specYamlSkipped: 0,
            specYamlFailed: 0,
            specYamlWarnings: [],
            specsEnriched: 0,
            proofsEnriched: 0,
            dryRun: false,
            importMode: 'full' as const,
            selectedCount: 3,
            notSelectedCount: 0,
          };
        },
      });

      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 202);

      await enqueued[0].execute({
        emitChunk: () => { },
      });

      assert.equal(receivedOptions.requireComponentProofs, true);
      assert.equal(receivedOptions.requireVariantProofsWhenPresent, true);
    });

    it('defaults to strict proof requirements when flags are omitted', async () => {
      const enqueued: any[] = [];
      let receivedOptions: any = {};
      const app = createTestApp({
        readJsonBody: async () => ({
          fileKey: 'figma_file_123',
        }),
        db: {} as any,
        componentRepo: {} as any,
        hasPluginSocketForFile: () => true,
        enqueueQueueJob: (args: any) => {
          enqueued.push(args);
          return { id: 'sync_job_default_strict' };
        },
        syncDesignSystemFromPluginFn: async (opts: any) => {
          receivedOptions = opts;
          return {
            tokens: 10,
            tokenModeValues: 12,
            aliases: 2,
            components: 1,
            componentsTruncated: false,
            usageRestored: 0,
            usageDropped: 0,
            usageReindexed: 0,
            usageReindexStatus: 'not_requested' as const,
            usageReindexReason: 'none' as const,
            usageReindexWarnings: [],
            specYamlGenerated: 0,
            specYamlSkipped: 0,
            specYamlFailed: 0,
            specYamlWarnings: [],
            specsEnriched: 0,
            proofsEnriched: 1,
            dryRun: false,
            importMode: 'full' as const,
            selectedCount: 1,
            notSelectedCount: 0,
          };
        },
      });

      const res = await app.request('/api/sync-figma-tokens', { method: 'POST' });
      assert.equal(res.status, 202);
      await enqueued[0].execute({
        emitChunk: () => { },
      });

      assert.equal(receivedOptions.requireComponentProofs, true);
      assert.equal(receivedOptions.requireVariantProofsWhenPresent, true);
    });
  });
});
