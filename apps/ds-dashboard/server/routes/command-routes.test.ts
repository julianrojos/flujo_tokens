/**
 * Command Routes Tests
 *
 * Tests for command API route handlers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerCommandRoutes } from './command-routes.js';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from '../services/plugin-connection-manager.js';
import {
  clearComponentSnapshotCache,
  setCachedComponentSnapshot,
} from '../services/component-snapshot-cache.js';
import { clearFigmaFileVersionCache, setFigmaFileVersionCache } from '../services/figma-file-version-cache.js';
import {
  clearPrewarmComponentSnapshotCache,
  setCachedPrewarmComponentSnapshot,
} from '../services/figma-prewarm-snapshot-cache.js';

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
  const componentRepoOverrides = (overrides as Record<string, unknown> & {
    componentRepo?: Record<string, unknown>;
  }).componentRepo;
  const baseComponentRepo = {
    getAll: () => [],
    getComponentsForDiff: () => [],
    getExistingSlugs: async () => [],
    upsertFromRegistry: () => 0,
    markMissingComponents: () => 0,
  };

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
    searchComponentsDirectFn: async () => ({
      success: true,
      components: [],
      count: 0,
      truncated: false,
      total: 0,
      totalIsEstimated: false,
      limit: 1000,
      hasMore: false,
      nextOffset: null,
    }),
    resolveFigmaFileVersionFn: async () => ({
      fileVersion: 'v_test',
      durationMs: 1,
    }),
    disableLeanRestPath: true,
    componentRepo: {
      ...baseComponentRepo,
      ...(componentRepoOverrides || {}),
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
    ...(() => {
      const { componentRepo: _componentRepo, ...restOverrides } = overrides as Record<string, unknown> & {
        componentRepo?: Record<string, unknown>;
      };
      return restOverrides;
    })(),
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
  beforeEach(() => {
    resetPluginConnectionManager();
    clearComponentSnapshotCache();
  });

  afterEach(() => {
    resetPluginConnectionManager();
    clearComponentSnapshotCache();
    clearFigmaFileVersionCache();
    clearPrewarmComponentSnapshotCache();
  });

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

  describe('/api/:systemId/sync/dry-run', () => {
    it('returns a diff without mutating the component repository', async () => {
      const getComponentsForDiffCalls: string[] = [];
      const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async (dsId: string) => {
            getComponentsForDiffCalls.push(dsId);
            return [
              {
                id: 1,
                nodeId: '1:1',
                slug: 'button',
                name: 'Button',
                status: 'ready',
                contentFingerprint: 'Button||component||Home||0',
              },
              {
                id: 2,
                nodeId: '2:2',
                slug: 'badge',
                name: 'Badge',
                status: 'ready',
                contentFingerprint: 'Badge||component||Home||0',
              },
            ];
          },
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => ({
          success: true as const,
          components: [
            {
              key: 'k-1',
              nodeId: '1:1',
              name: 'Button',
              type: 'COMPONENT' as const,
              pageName: 'Home',
              variantCount: 0,
            },
            {
              key: 'k-2',
              nodeId: '2:2',
              name: 'Badge',
              type: 'COMPONENT' as const,
              pageName: 'Home',
              variantCount: 0,
            },
            {
              key: 'k-3',
              nodeId: '3:3',
              name: 'Card',
              type: 'COMPONENT' as const,
              pageName: 'Home',
              variantCount: 0,
            },
          ],
          count: 3,
          truncated: false,
          total: 3,
          totalIsEstimated: false,
          limit: 1000,
          hasMore: false,
          nextOffset: null,
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.deepEqual(getComponentsForDiffCalls, ['core']);
      assert.equal((payload as any).diff.new_in_figma.length, 1);
      assert.equal((payload as any).diff.updated_in_figma.length, 0);
      assert.equal((payload as any).diff.unchanged.length, 2);
      assert.equal((payload as any).diff.missing_in_figma.length, 0);
      assert.equal((payload as any).diff.new_in_figma[0].nodeId, '3:3');
    });

    it('accepts Figma URLs with node-id and still scans by file key', async () => {
      const receivedFileKeys: string[] = [];
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File?node-id=1-2&foo=bar',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async (fileKey) => {
          receivedFileKeys.push(String(fileKey || ''));
          return {
            success: true as const,
            components: [],
            count: 0,
            truncated: false,
            total: 0,
            totalIsEstimated: false,
            limit: 1000,
            hasMore: false,
            nextOffset: null,
          };
        },
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_node_id_url',
          durationMs: 1,
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      assert.deepEqual(receivedFileKeys, ['abc123']);
    });

    it('returns a figma_fetch_failed response when the scan fails', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => {
          throw new Error('Figma API 503');
        },
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_scan_error',
          durationMs: 1,
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 422);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).error, 'figma_fetch_failed');
      assert.match(String((payload as any).details || ''), /Figma API 503/);
    });

    it('returns figma_fetch_failed when plugin scan is empty but DB already has components', async () => {
      const app = createTestApp({
        hasPluginSocketForFile: () => true,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '1:23',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              contentFingerprint: 'Button||component_set||Page 1||2',
            },
          ],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => ({
          success: true as const,
          components: [],
          count: 0,
          truncated: false,
          total: 0,
          totalIsEstimated: false,
          limit: 1000,
          hasMore: false,
          nextOffset: null,
        }),
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_empty_plugin_scan',
          durationMs: 1,
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 422);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).error, 'figma_fetch_failed');
      assert.match(
        String((payload as any).details || ''),
        /Plugin component scan returned zero components/,
      );
    });

    it('uses plugin fast path when matching file socket is active', async () => {
      resetPluginConnectionManager();
      const manager = getPluginConnectionManager();
      const socket = makeSocket(() => {
        // searchComponentsDirect is injected in this test, so websocket is only
        // used to mark the file key as active for fast-path eligibility.
      });
      const socketId = manager.register(socket, {
        fileKey: 'abc123',
        docName: 'Test file',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      });

      try {
        let captureCalls = 0;
        const offsets: number[] = [];
        const app = createTestApp({
          readJsonBody: async () => ({
            figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
            figmaToken: 'token_123',
          }),
          componentRepo: {
            getAll: () => [],
            getExistingSlugs: async () => [],
            getComponentsForDiff: async () => [
              {
                id: 1,
                nodeId: '1:1',
                slug: 'button',
                name: 'Button',
                status: 'ready',
                contentFingerprint: 'Button||component_set||Page 1||2',
              },
            ],
            upsertFromRegistry: () => 0,
          },
          searchComponentsDirectFn: async (
            _fileKey: string | null,
            params: { offset?: number },
          ) => {
            const offset = Number(params.offset || 0);
            offsets.push(offset);
            if (offset === 0) {
              return {
                success: true as const,
                components: [
                  {
                    key: 'k-1',
                    nodeId: '1:1',
                    name: 'Button',
                    type: 'COMPONENT_SET' as const,
                    pageName: 'Page 1',
                    variantCount: 2,
                  },
                ],
                count: 1,
                truncated: false,
                total: 2,
                totalIsEstimated: false,
                limit: 1000,
                hasMore: true,
                nextOffset: 1,
              };
            }
            return {
              success: true as const,
              components: [
                {
                  key: 'k-2',
                  nodeId: '2:2',
                  name: 'Card',
                  type: 'COMPONENT' as const,
                  pageName: 'Page 1',
                  variantCount: 0,
                },
              ],
              count: 1,
              truncated: false,
              total: 2,
              totalIsEstimated: false,
              limit: 1000,
              hasMore: false,
              nextOffset: null,
            };
          },
          runCaptureFromFigmaUrlFn: async () => {
            captureCalls += 1;
            return { ok: false, error: 'should_not_run' };
          },
          resolveFigmaFileVersionFn: async () => ({
            fileVersion: 'v_fast_path',
            durationMs: 1,
          }),
        });

        const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
        assert.equal(res.status, 200);
        const payload = await res.json();
        assert.equal((payload as any).ok, true);
        assert.deepEqual(offsets, [0, 1]);
        assert.equal(captureCalls, 0);
        assert.equal((payload as any).diff.new_in_figma.length, 1);
        assert.equal((payload as any).diff.unchanged.length, 1);
      } finally {
        manager.unregister(socketId, 'test-cleanup');
        resetPluginConnectionManager();
      }
    });

    it('reuses a cached component snapshot for the same file version', async () => {
      setCachedComponentSnapshot({
        fileKey: 'abc123',
        fileVersion: 'v_cached_snapshot',
        includeVariants: false,
        compact: true,
        components: [
          {
            node_id: '1:1',
            name: 'Button',
            type: 'COMPONENT_SET',
            page_name: 'Page 1',
            variant_count: 2,
          },
          {
            node_id: '2:2',
            name: 'Card',
            type: 'COMPONENT',
            page_name: 'Page 1',
            variant_count: 0,
          },
        ],
      });

      let pluginCalls = 0;
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '1:1',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              contentFingerprint: 'Button||component_set||Page 1||2',
            },
          ],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => {
          pluginCalls += 1;
          throw new Error('search should not run when snapshot cache is warm');
        },
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_cached_snapshot',
          durationMs: 1,
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any)._debug?.pathUsed, 'cache');
      assert.equal(pluginCalls, 0);
      assert.equal((payload as any).diff.new_in_figma.length, 1);
      assert.equal((payload as any).diff.unchanged.length, 1);
    });

    it('skips version lookup when fileVersionHint matches the recent cached version', async () => {
      setFigmaFileVersionCache({
        fileKey: 'abc123_hint',
        fileVersion: 'v_hint_snapshot',
      });
      setCachedComponentSnapshot({
        fileKey: 'abc123_hint',
        fileVersion: 'v_hint_snapshot',
        includeVariants: false,
        compact: true,
        components: [
          {
            node_id: '9:9',
            name: 'Badge',
            type: 'COMPONENT',
            page_name: 'Page 1',
            variant_count: 0,
          },
        ],
      });

      let versionLookups = 0;
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123_hint/Test-File',
          figmaToken: 'token_123',
          fileVersionHint: 'v_hint_snapshot',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '9:9',
              slug: 'badge',
              name: 'Badge',
              status: 'ready',
              contentFingerprint: 'Badge||component||Page 1||0',
            },
          ],
          upsertFromRegistry: () => 0,
        },
        resolveFigmaFileVersionFn: async () => {
          versionLookups += 1;
          throw new Error('version lookup should be skipped when hint matches cache');
        },
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any)._debug?.pathUsed, 'cache');
      assert.equal((payload as any)._debug?.versionLookupDurationMs, 0);
      assert.equal(versionLookups, 0);
    });

    it('uses prewarmed component snapshots before scanning the plugin again', async () => {
      setCachedPrewarmComponentSnapshot({
        fileKey: 'abc123_prewarm',
        components: [
          {
            node_id: '9:9',
            name: 'Badge',
            type: 'COMPONENT',
            page_name: 'Page 1',
            variant_count: 0,
          },
        ],
      });

      let versionLookups = 0;
      let pluginCalls = 0;
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123_prewarm/Test-File',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '9:9',
              slug: 'badge',
              name: 'Badge',
              status: 'ready',
              contentFingerprint: 'Badge||component||Page 1||0',
            },
          ],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => {
          pluginCalls += 1;
          throw new Error('search should not run when prewarm cache is present');
        },
        resolveFigmaFileVersionFn: async () => {
          versionLookups += 1;
          return {
            fileVersion: 'v_prewarm_snapshot',
            durationMs: 1,
          };
        },
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any)._debug?.pathUsed, 'cache');
      assert.equal(versionLookups, 1);
      assert.equal(pluginCalls, 0);
      assert.equal((payload as any).diff.new_in_figma.length, 0);
      assert.equal((payload as any).diff.unchanged.length, 1);
    });

    it('accepts a single unkeyed plugin socket while SESSION_INFO is still resolving the fileKey', async () => {
      resetPluginConnectionManager();
      const manager = getPluginConnectionManager();
      let socketId = '';
      let searchCalls = 0;
      const socket = makeSocket(() => { });

      socketId = manager.register(socket, {
        fileKey: null,
        docName: 'Draft file',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      });

      try {
        const app = createTestApp({
          readJsonBody: async () => ({
            figmaUrl: 'https://www.figma.com/design/abc123_unkeyed/Test-File',
            figmaToken: 'token_123',
          }),
          componentRepo: {
            getAll: () => [],
            getExistingSlugs: async () => [],
            getComponentsForDiff: async () => [],
            upsertFromRegistry: () => 0,
          },
          hasPluginSocketForFile: undefined,
          searchComponentsDirectFn: async () => {
            searchCalls += 1;
            return {
              success: true,
              components: [
                {
                  nodeId: '10:10',
                  name: 'Badge',
                  type: 'COMPONENT',
                  pageName: 'Page 1',
                  variantCount: 0,
                },
              ],
              count: 1,
              truncated: false,
              total: 1,
              totalIsEstimated: false,
              limit: 1000,
              hasMore: false,
              nextOffset: null,
            };
          },
          resolveFigmaFileVersionFn: async () => ({
            fileVersion: 'v_unkeyed_socket',
            durationMs: 1,
          }),
        });

        const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
        assert.equal(res.status, 200);
        const payload = await res.json();
        assert.equal((payload as any).ok, true);
        assert.equal((payload as any)._debug?.pathUsed, 'plugin');
        assert.equal(searchCalls, 1);
      } finally {
        manager.unregister(socketId, 'test-cleanup');
        resetPluginConnectionManager();
      }
    });

    it('returns 400 when file key cannot be resolved from URL/system context', async () => {
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'not-a-valid-figma-url',
          figmaToken: 'token_123',
        }),
        getSystemContext: async () => ({
          repoRoot: '/repo',
          systemId: 'core',
          figmaFileId: undefined,
          captureFromFigmaUrlScriptPath:
            'tooling/src/runners/capture-from-figma-url-runner.ts',
        }),
      });

      const res = await app.request('/api/core/sync/dry-run', { method: 'POST' });
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'validation.figma_file_key_missing');
    });

    it('deduplicates concurrent dry-run requests with the same payload', async () => {
      let pluginCalls = 0;
      const app = createTestApp({
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File-Dedupe',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        searchComponentsDirectFn: async () => {
          pluginCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            success: true as const,
            components: [],
            count: 0,
            truncated: false,
            total: 0,
            totalIsEstimated: false,
            limit: 1000,
            hasMore: false,
            nextOffset: null,
          };
        },
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_dedupe_components',
          durationMs: 1,
        }),
      });

      const [resA, resB] = await Promise.all([
        app.request('/api/core/sync/dry-run', { method: 'POST' }),
        app.request('/api/core/sync/dry-run', { method: 'POST' }),
      ]);

      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);
      const bodyA = await resA.json();
      const bodyB = await resB.json();
      assert.deepStrictEqual(bodyB, bodyA);
      assert.equal(pluginCalls, 1);
    });
  });

  describe('/api/:systemId/sync/variables/dry-run', () => {
    it('returns 409 when there is no plugin socket for the requested Figma file', async () => {
      const db = (async () => []) as unknown as any;
      const app = createTestApp({
        db,
        hasPluginSocketForFile: () => false,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
      });

      const res = await app.request('/api/core/sync/variables/dry-run', { method: 'POST' });
      assert.equal(res.status, 409);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'sync.no_plugin_socket_for_file');
    });

    it('returns a direct variables preview without queue polling', async () => {
      const db = (async () => []) as unknown as any;
      let capturedOptions: Record<string, unknown> | null = null;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        syncDesignSystemFromPluginFn: async (options: Record<string, unknown>) => {
          capturedOptions = options;
          return {
            tokens: 12,
            tokenModeValues: 24,
            aliases: 3,
            components: 0,
            componentsTruncated: false,
            usageRestored: 0,
            usageDropped: 0,
            usageReindexed: 0,
            usageReindexStatus: 'skipped',
            usageReindexReason: 'none',
            usageReindexWarnings: [],
            dryRun: true,
            new_in_figma: [],
            updated_in_figma: [],
            unchanged: [],
            missing_in_figma: [],
          };
        },
      });

      const res = await app.request('/api/core/sync/variables/dry-run', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).status, 'completed');
      assert.equal((payload as any).counts.tokens, 12);
      assert.equal((payload as any).counts.tokenModeValues, 24);
      assert.equal((payload as any).counts.aliases, 3);
      assert.equal(capturedOptions?.dryRun, true);
      assert.equal(capturedOptions?.includeComponents, false);
      assert.equal(capturedOptions?.captureComponentProofs, false);
    });

    it('skips version lookup when fileVersion hint matches recent known server version', async () => {
      const db = (async () => []) as unknown as any;
      let resolveVersionCalls = 0;
      let readJsonCalls = 0;
      const app = createTestApp({
        db,
        readJsonBody: async () => {
          readJsonCalls += 1;
          if (readJsonCalls === 1) {
            return {
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              figmaToken: 'token_123',
            };
          }
          return {
            figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
            figmaToken: 'token_123',
            fileVersion: 'v_from_components_preview',
          };
        },
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        resolveFigmaFileVersionFn: async () => {
          resolveVersionCalls += 1;
          return {
            fileVersion: 'v_from_components_preview',
            durationMs: 1,
          };
        },
        syncDesignSystemFromPluginFn: async () => ({
          tokens: 2,
          tokenModeValues: 4,
          aliases: 0,
          components: 0,
          componentsTruncated: false,
          usageRestored: 0,
          usageDropped: 0,
          usageReindexed: 0,
          usageReindexStatus: 'skipped',
          usageReindexReason: 'none',
          usageReindexWarnings: [],
          dryRun: true,
          new_in_figma: [],
          updated_in_figma: [],
          unchanged: [],
          missing_in_figma: [],
        }),
      });

      const resA = await app.request('/api/core/sync/variables/dry-run', {
        method: 'POST',
      });
      assert.equal(resA.status, 200);
      assert.equal(resolveVersionCalls, 1);

      const resB = await app.request('/api/core/sync/variables/dry-run', {
        method: 'POST',
      });
      assert.equal(resB.status, 200);
      const payloadB = await resB.json();
      assert.equal((payloadB as any)._debug?.fileVersion, 'v_from_components_preview');
      assert.equal(resolveVersionCalls, 1);
    });

    it('deduplicates concurrent variables dry-run requests with the same payload', async () => {
      const db = (async () => []) as unknown as any;
      let syncCalls = 0;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File-Variables-Dedupe',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: () => [],
          getExistingSlugs: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: () => 0,
        },
        syncDesignSystemFromPluginFn: async () => {
          syncCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            tokens: 5,
            tokenModeValues: 8,
            aliases: 1,
            components: 0,
            componentsTruncated: false,
            usageRestored: 0,
            usageDropped: 0,
            usageReindexed: 0,
            usageReindexStatus: 'skipped',
            usageReindexReason: 'none',
            usageReindexWarnings: [],
            dryRun: true,
            new_in_figma: [],
            updated_in_figma: [],
            unchanged: [],
            missing_in_figma: [],
          };
        },
        resolveFigmaFileVersionFn: async () => ({
          fileVersion: 'v_dedupe_variables',
          durationMs: 1,
        }),
      });

      const [resA, resB] = await Promise.all([
        app.request('/api/core/sync/variables/dry-run', { method: 'POST' }),
        app.request('/api/core/sync/variables/dry-run', { method: 'POST' }),
      ]);

      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);
      const bodyA = await resA.json();
      const bodyB = await resB.json();
      assert.deepStrictEqual(bodyB, bodyA);
      assert.equal(syncCalls, 1);
    });
  });

  describe('/api/:systemId/sync/apply', () => {
    it('applies the diff and persists a sync job summary', async () => {
      const upsertCalls: Array<{ dsId: string; entries: unknown[] }> = [];
      const markMissingCalls: Array<{ dsId: string; nodeIds: string[] }> = [];
      const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
            {
              id: 2,
              dsId: 'core',
              slug: 'badge',
              name: 'Badge',
              status: 'draft',
              docType: 'component',
              editorialExists: false,
            },
            {
              id: 3,
              dsId: 'core',
              slug: 'legacy-note',
              name: 'Legacy Note',
              status: 'draft',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['button', 'badge', 'legacy-note'],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '1:1',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              contentFingerprint: 'Button||component||Home||0',
            },
            {
              id: 2,
              nodeId: '2:2',
              slug: 'badge',
              name: 'Badge',
              status: 'draft',
              contentFingerprint: 'Badge||component||Home||0',
            },
            {
              id: 3,
              nodeId: '3:3',
              slug: 'legacy-note',
              name: 'Legacy Note',
              status: 'missing',
              contentFingerprint: 'Legacy Note||component||Home||0',
            },
          ],
          upsertFromRegistry: async (dsId: string, entries: unknown[]) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async (dsId: string, nodeIds: string[]) => {
            markMissingCalls.push({ dsId, nodeIds });
            return 1;
          },
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:1',
                name: 'Button',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Button||component||Home||0',
              },
              {
                node_id: '2:2',
                name: 'Badge Updated',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Badge Updated||component||Home||1',
              },
              {
                node_id: '4:4',
                name: 'Card',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Card||component||Home||0',
              },
              {
                node_id: '3:3',
                name: 'Legacy Note',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Legacy Note||component||Home||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any).summary.created, 1);
      assert.equal((payload as any).summary.updated, 2);
      assert.equal((payload as any).summary.unchanged, 2);
      assert.equal((payload as any).summary.missing, 0);
      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0]?.dsId, 'core');
      assert.equal(upsertCalls[0]?.entries.length, 3);
      assert.equal(markMissingCalls.length, 1);
      assert.equal(markMissingCalls[0]?.dsId, 'core');
      assert.deepEqual(markMissingCalls[0]?.nodeIds.sort(), ['1:1', '2:2', '3:3', '4:4']);
    });

    it('deduplicates slugs when an updated component falls back to a colliding slug', async () => {
      const upsertCalls: Array<{ dsId: string; entries: Array<{ slug: string }> }> = [];
      const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
            {
              id: 2,
              dsId: 'core',
              slug: 'badge',
              name: 'Badge',
              status: 'draft',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['button', 'badge'],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '1:1',
              slug: 'button',
              name: 'Button',
              status: 'ready',
              contentFingerprint: 'Button||component||Home||0',
            },
            {
              id: 2,
              nodeId: '2:2',
              slug: '',
              name: 'Badge',
              status: 'draft',
              contentFingerprint: 'Badge||component||Home||0',
            },
          ],
          upsertFromRegistry: async (dsId: string, entries: Array<{ slug: string }>) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:1',
                name: 'Button',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Button||component||Home||0',
              },
              {
                node_id: '2:2',
                name: 'Button',
                type: 'component',
                page_name: 'Home',
                contentFingerprint: 'Button||component||Home||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      assert.equal(upsertCalls.length, 1);
      assert.deepEqual(
        upsertCalls[0]?.entries.map((entry) => entry.slug),
        ['button-2'],
      );
    });

    it('relinks unchanged legacy components that match by slug but have no node id', async () => {
      const upsertCalls: Array<{ dsId: string; entries: Array<{ figmaNodeId?: string; status?: string }> }> = [];
      const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['boton'],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              contentFingerprint: null,
            },
          ],
          upsertFromRegistry: async (dsId: string, entries: Array<{ figmaNodeId?: string }>) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:23',
                name: 'Botón',
                type: 'component',
                page_name: 'Page 1',
                contentFingerprint: 'Botón||component||Page 1||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any).summary.updated, 1);
      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0]?.entries[0]?.figmaNodeId, '1:23');
      assert.equal(upsertCalls[0]?.entries[0]?.status, 'ready');
    });

    it('does not enqueue post-apply enrichment during apply anymore', async () => {
      const upsertCalls: Array<{ dsId: string; entries: Array<{ figmaNodeId?: string; status?: string }> }> = [];
      const enqueueCalls: Array<Record<string, unknown>> = [];
      const db = (async (strings: TemplateStringsArray) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        enqueueQueueJob: (args: Record<string, unknown>) => {
          enqueueCalls.push(args);
          return { id: 'queued_apply_enrichment' };
        },
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['boton'],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              contentFingerprint: null,
            },
          ],
          upsertFromRegistry: async (
            dsId: string,
            entries: Array<{ figmaNodeId?: string; status?: string }>,
          ) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:23',
                name: 'Botón',
                type: 'component',
                page_name: 'Page 1',
                contentFingerprint: 'Botón||component||Page 1||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal((payload as any).summary.updated, 1);
      assert.equal(upsertCalls.length, 1);
      assert.equal(enqueueCalls.length, 0);
    });

    it('deduplicates apply updates when multiple figma candidates match the same DB slug row', async () => {
      const upsertCalls: Array<{ dsId: string; entries: Array<{ slug?: string; figmaNodeId?: string }> }> = [];
      const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['boton'],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '',
              slug: 'boton',
              name: 'Botón',
              status: 'ready',
              contentFingerprint: null,
            },
          ],
          upsertFromRegistry: async (
            dsId: string,
            entries: Array<{ slug?: string; figmaNodeId?: string }>,
          ) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:23',
                name: 'Botón',
                type: 'component',
                page_name: 'Page 1',
                contentFingerprint: 'Botón||component||Page 1||0',
              },
              {
                node_id: '1:24',
                name: 'Boton',
                type: 'component',
                page_name: 'Page 1',
                contentFingerprint: 'Boton||component||Page 1||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0]?.entries.length, 1);
    });

    it('preserves legacy slugs verbatim during apply updates', async () => {
      const upsertCalls: Array<{ dsId: string; entries: Array<{ slug?: string; figmaNodeId?: string }> }> = [];
      const db = (async (strings: TemplateStringsArray) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        return [];
      }) as unknown as any;
      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
        }),
        componentRepo: {
          getAll: async () => [
            {
              id: 1,
              dsId: 'core',
              slug: 'boton ',
              name: 'Botón',
              status: 'ready',
              docType: 'component',
              editorialExists: false,
            },
          ],
          getExistingSlugs: async () => ['boton', 'boton '],
          getComponentsForDiff: async () => [
            {
              id: 1,
              nodeId: '1:23',
              slug: 'boton ',
              name: 'Botón',
              status: 'ready',
              contentFingerprint: null,
            },
          ],
          upsertFromRegistry: async (
            dsId: string,
            entries: Array<{ slug?: string; figmaNodeId?: string }>,
          ) => {
            upsertCalls.push({ dsId, entries });
            return entries.length;
          },
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: true,
          report: {
            source_candidates: [
              {
                node_id: '1:23',
                name: 'Botón',
                type: 'component',
                page_name: 'Page 1',
                contentFingerprint: 'Botón||component||Page 1||0',
              },
            ],
          },
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal((payload as any).ok, true);
      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0]?.entries.length, 1);
      assert.equal(upsertCalls[0]?.entries[0]?.slug, 'boton ');
    });

    it('returns a figma_fetch_failed response when the apply scan fails', async () => {
      const app = createTestApp({
        db: (async () => []) as unknown as any,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
        }),
        componentRepo: {
          getAll: async () => [],
          getComponentsForDiff: async () => [],
          upsertFromRegistry: async () => 0,
          markMissingComponents: async () => 0,
        },
        runCaptureFromFigmaUrlFn: async () => ({
          ok: false,
          error: 'Figma API 503',
        }),
      });

      const res = await app.request('/api/core/sync/apply', { method: 'POST' });
      assert.equal(res.status, 422);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).error, 'figma_fetch_failed');
      assert.match(String((payload as any).details || ''), /Figma API 503/);
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

    it('queues a follow-on enrichment job for apply+sync flows', async () => {
      const enqueuedJobs: any[] = [];
      const syncCalls: Array<Record<string, unknown>> = [];
      const dsRepoUpdateCalls: any[] = [];
      const coverageRows: Array<{
        id: number;
        dsId: string;
        slug: string;
        name: string;
        status: 'draft' | 'ready' | 'needs-review' | 'missing';
        docType: 'component';
        figmaComponentSetNodeId?: string;
        editorialExists: boolean;
      }> = [
        {
          id: 1,
          dsId: 'core',
          slug: 'button',
          name: 'Button',
          status: 'ready',
          docType: 'component',
          figmaComponentSetNodeId: 'node-a',
          editorialExists: false,
        },
        {
          id: 2,
          dsId: 'core',
          slug: 'badge',
          name: 'Badge',
          status: 'ready',
          docType: 'component',
          figmaComponentSetNodeId: 'node-b',
          editorialExists: false,
        },
        {
          id: 3,
          dsId: 'core',
          slug: 'card',
          name: 'Card',
          status: 'ready',
          docType: 'component',
          figmaComponentSetNodeId: 'node-c',
          editorialExists: false,
        },
        {
          id: 4,
          dsId: 'core',
          slug: 'ghost',
          name: 'Ghost',
          status: 'missing',
          docType: 'component',
          figmaComponentSetNodeId: 'node-d',
          editorialExists: false,
        },
        {
          id: 5,
          dsId: 'core',
          slug: 'chip',
          name: 'Chip',
          status: 'missing',
          docType: 'component',
          figmaComponentSetNodeId: 'node-e',
          editorialExists: false,
        },
      ];
      const db = (async (strings: TemplateStringsArray) => {
        const query = String(strings[0] || '');
        if (query.includes('SELECT figma_api_token')) {
          return [{ figma_api_token: 'token_from_db' }];
        }
        if (query.includes('FROM components') && query.includes('figma_node_id = ANY')) {
          return [
            {
              figma_node_id: 'node-a',
              name: 'Button',
              figma_page_name: 'Components',
            },
          ];
        }
        return [];
      }) as unknown as any;

      const app = createTestApp({
        db,
        readJsonBody: async () => ({
          figmaUrl: 'https://www.figma.com/design/abc123',
          figmaToken: 'token_123',
          skipComponentCapture: true,
          selectedComponentNodeIds: ['node-b', 'node-a'],
        }),
        componentRepo: {
          getAll: async () => [],
          getExistingSlugs: async () => [],
          upsertFromRegistry: async (_dsId: string, entries: Array<{ figmaNodeId?: string; name?: string }>) => entries.length,
          markMissingComponents: async () => 0,
          getComponentCoverageRows: async () => coverageRows,
        },
        designSystemRepository: {
          getById: async () => ({
            detectedComponentsCount: 0,
            importedComponentsCount: 0,
            pendingComponentsCount: 0,
            importedComponentNames: [],
            pendingComponentNames: [],
          }),
          update: async (...args: any[]) => {
            dsRepoUpdateCalls.push(args);
          },
        },
        syncDesignSystemFromPluginFn: async (opts: Record<string, unknown>) => {
          syncCalls.push(opts);
          return {
            tokens: 11,
            tokenModeValues: 4,
            aliases: 2,
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
            importMode: 'partial' as const,
            selectedCount: 2,
            notSelectedCount: 0,
          };
        },
        enqueueQueueJob: (args: any) => {
          enqueuedJobs.push(args);
          return { id: `sync_design_system_job_${enqueuedJobs.length}` };
        },
      });

      const res = await app.request('/api/sync-design-system', { method: 'POST' });
      assert.equal(res.status, 202);
      assert.equal(enqueuedJobs.length, 1);

      const runResult = await enqueuedJobs[0].execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(runResult.ok, true);
      assert.equal(enqueuedJobs.length, 2);
      assert.equal(runResult.payload?.enrichmentJobId, 'sync_design_system_job_2');
      assert.equal(enqueuedJobs[1]?.operationName, 'sync:design-system:enrichment');

      const enrichmentRunResult = await enqueuedJobs[1].execute({
        emitChunk: () => {},
        setProcess: () => {},
      });

      assert.equal(enrichmentRunResult.ok, true);
      assert.equal(syncCalls.length, 2);
      assert.equal(syncCalls[0]?.includeComponents, false);
      assert.deepEqual(syncCalls[0]?.selectedComponentNodeIds, undefined);
      assert.equal(syncCalls[1]?.includeComponents, true);
      assert.deepEqual(syncCalls[1]?.selectedComponentNodeIds, ['node-a', 'node-b']);
      assert.equal(dsRepoUpdateCalls.length, 1, 'coverage counters refreshed after enrichment');
      assert.equal(dsRepoUpdateCalls[0]?.[1]?.detectedComponentsCount, 5);
      assert.equal(dsRepoUpdateCalls[0]?.[1]?.importedComponentsCount, 3);
      assert.equal(dsRepoUpdateCalls[0]?.[1]?.pendingComponentsCount, 2);
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

    it('emits timing information for the token step', async () => {
      let queuedArgs: any = null;
      const chunks: Array<{ kind: string; message: string }> = [];
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-tokens-'));
      try {
        const fakeTx = Object.assign(
          async () => [],
          {
            unsafe: async () => [],
          },
        );
        const db = Object.assign(
          async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = String.raw({ raw: strings }, ...values);
            if (query.includes('FROM tokens t')) {
              return [
                {
                  id: 'color.primary',
                  css_var: '--color-primary',
                  collection: 'Primitives',
                  type: 'color',
                  raw_value: '#ff0000',
                },
              ];
            }
            if (query.includes('FROM token_mode_values tmv')) {
              return [
                {
                  token_path: 'color.primary',
                  mode: 'Default',
                  resolved_value: '#00ff00',
                },
              ];
            }
            if (query.includes('FROM figma_aliases')) {
              return [];
            }
            throw new Error(`Unexpected query: ${query}`);
          },
          {
            begin: async (fn: (tx: typeof fakeTx) => Promise<void>) => fn(fakeTx),
          },
        ) as any;

        const app = createTestApp({
          readJsonBody: async () => ({
            figmaUrl: 'https://www.figma.com/design/abc123',
          }),
          db,
          componentRepo: {
            getAll: () => [],
            upsertFromRegistry: () => 1,
          } as any,
          getSystemContext: () => ({
            repoRoot: tmpRoot,
            systemId: 'core',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
          }),
          enqueueQueueJob: (args: any) => {
            queuedArgs = args;
            return { id: 'sync_design_system_step_tokens_job' };
          },
        });

        const res = await app.request('/api/sync-design-system/step/tokens', { method: 'POST' });
        assert.equal(res.status, 202);
        assert.equal(typeof queuedArgs?.execute, 'function');

        const runResult = await queuedArgs.execute({
          emitChunk: (kind: string, message: string) => {
            chunks.push({ kind, message });
          },
          setProcess: () => {},
        });

        assert.equal(runResult.ok, true);
        assert.equal(runResult.payload?.status, 'completed');
        assert.equal(typeof runResult.payload?.durationMs, 'number');
        assert.equal(typeof runResult.payload?.timingsMs?.cssGeneration, 'number');
        assert.equal(typeof runResult.payload?.timingsMs?.aliasFetch, 'number');
        assert.ok(chunks.some((chunk) => chunk.kind === 'result' && chunk.message.includes('Generated CSS:')));
        assert.ok(
          chunks.some(
            (chunk) =>
              chunk.kind === 'result' &&
              chunk.message.includes('Tokens step completed in'),
          ),
        );
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
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
