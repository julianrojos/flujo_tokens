/**
 * Tests for Register All Routes
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { AiJobsStore, initializeAiJobsStore } from '../services/ai-jobs-store.js';
import { registerAllRoutes } from './register-all-routes.ts';

function createServerDeps() {
  let executedResult: unknown = null;
  return {
    createApiRequestId: () => 'req_test',
    queueJobAcceptedPayload: (job: { id: string }) => ({ ok: true, jobId: job.id }),
    failJson: () => ({}),
    getSystemContext: () => ({
      repoRoot: '/repo',
      systemId: 'demo',
      figmaFileId: 'rYOptx0KbO77Z6EJYadlvN',
      captureFromFigmaUrlScriptPath: '/repo/tooling/src/runners/capture-from-figma-url-runner.ts',
    }),
    buildHealthPayload: () => ({ ok: true }),
    readJsonBody: async () => ({}),
    designSystemRepository: {},
    normalizeSystemId: (value: string) => String(value || ''),
    ensureRelativeDir: (value: string) => value,
    normalizeFigmaApiTokenRef: (value: string) => value,
    normalizeCollectionList: (value: unknown) => value,
    summarizeDesignSystemsConfig: (value: unknown) => value,
    resolveSafeSystemPathsForDeletion: () => [],
    repoRoot: '/repo',
    fsSync: {},
    isDevRuntime: () => true,
    resolveRepoFilePath: () => '/repo/file',
    sha256Text: (value: string) => value,
    readTextFileLimited: async () => ({ content: '', truncated: false }),
    findLineForQuery: () => 1,
    buildSnippet: () => ({ targetLine: 1, startLine: 1, endLine: 1, snippet: '' }),
    guessContentType: () => 'text/plain',
    MAX_FILE_BYTES: 1_000_000,
    queueJobs: new Map(),
    listQueueJobEvents: () => [],
    queueJobSnapshot: () => ({}),
    isQueueJobFinalStatus: () => false,
    cancelQueueJob: () => ({ ok: true }),
    toQueueTerminalEvent: () => ({}),
    buildApiErrorPayload: () => ({}),
    MAX_RETAINED_EVENTS: 1000,
    enqueueQueueJob: (job: any) => {
      executedResult = job.execute({
        emitChunk: () => {},
        setProcess: () => {},
      });
      return { id: 'job_test' };
    },
    runQueuedSpawnCommand: async () => ({
      ok: false,
      code: 1,
      summary: 'boom',
      payload: {
        ok: false,
        error: 'boom',
        message: 'boom',
      },
    }),
    queueNpmScript: () => ({ id: 'job_npm' }),
    queueNodeJsonCommand: () => ({ id: 'job_node' }),
    toBooleanString: (value: unknown, fallback: boolean) => String(value ?? fallback),
    toNumberString: (value: unknown, fallback: number) => String(value ?? fallback),
    validateGitRef: () => null,
    componentRepo: {} as Record<string, never>,
    getExecutedResult: () => executedResult,
  };
}

test('register-all-routes preserves payload from queued spawn commands', async () => {
  initializeAiJobsStore(new AiJobsStore());

  const app = new Hono();
  const deps = createServerDeps();
  registerAllRoutes(app, deps as never);

  const response = await app.request('/api/sync-design-system/step/components', {
    method: 'POST',
    headers: {
      'x-ds-system': 'demo',
    },
  });

  assert.equal(response.status, 202);

  const body = await response.json();
  assert.equal((body as Record<string, unknown>).ok, true);
  assert.equal((body as Record<string, unknown>).jobId, 'job_test');

  const executed = await (deps as { getExecutedResult: () => Promise<unknown> | unknown }).getExecutedResult();
  const executedPayload = executed as {
    payload?: {
      raw?: Record<string, unknown>;
    };
  };
  assert.equal(executedPayload?.payload?.raw?.error, 'boom');
});
