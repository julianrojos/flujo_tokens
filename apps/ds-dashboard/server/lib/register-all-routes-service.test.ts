/**
 * Tests for Register All Routes Service
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAllRouteDeps, buildSharedSystemContextDeps, type ServerDeps } from './register-all-routes-service.ts';

function createDeps(): ServerDeps {
  return {
    failJson: () => ({}),
    getSystemContext: () => ({ systemId: 'core' }),
    buildHealthPayload: () => ({ ok: true }),
    readJsonBody: async () => ({}),
    designSystemRepository: {},
    normalizeSystemId: (value) => String(value || ''),
    ensureRelativeDir: (value) => value,
    normalizeFigmaApiTokenRef: (value) => value,
    normalizeCollectionList: (value) => value,
    summarizeDesignSystemsConfig: (value) => value,
    resolveSafeSystemPathsForDeletion: () => [],
    repoRoot: '/repo',
    fsSync: {},
    isDevRuntime: () => true,
    resolveRepoFilePath: () => '/repo/file',
    sha256Text: () => 'hash',
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
    enqueueQueueJob: () => ({}),
    runQueuedSpawnCommand: async () => ({}),
    queueNpmScript: () => ({}),
    queueNodeJsonCommand: () => ({}),
    toBooleanString: () => 'false',
    toNumberString: () => '0',
    validateGitRef: () => 'HEAD~1',
  };
}

test('register-all-routes-service: shared deps keep failJson/getSystemContext', () => {
  const deps = createDeps();
  const shared = buildSharedSystemContextDeps(deps);
  assert.equal(shared.failJson, deps.failJson);
  assert.equal(shared.getSystemContext, deps.getSystemContext);
});

test('register-all-routes-service: buildAllRouteDeps returns grouped route contracts', () => {
  const deps = createDeps();
  const grouped = buildAllRouteDeps(deps);

  assert.equal(grouped.registryDeps.failJson, deps.failJson);
  assert.equal(grouped.fileDeps.MAX_FILE_BYTES, deps.MAX_FILE_BYTES);
  assert.equal(grouped.jobDeps.MAX_RETAINED_EVENTS, deps.MAX_RETAINED_EVENTS);
  assert.equal(grouped.commandDeps.validateGitRef, deps.validateGitRef);
  assert.equal(grouped.figmaMcpPingDeps.failJson, deps.failJson);
  assert.equal(grouped.figmaMcpPingDeps.readJsonBody, deps.readJsonBody);
});
