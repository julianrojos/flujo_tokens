/**
 * Create Server Route Dependencies Tests
 *
 * Tests for route dependencies builder.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCreateServerRouteDeps } from './create-server-route-deps.js';

function createDeps() {
  const fn = () => { };
  return {
    buildHealthPayload: fn,
    failJson: fn,
    readJsonBody: fn,
    designSystemRepository: { getConfig: fn },
    normalizeSystemId: fn,
    ensureRelativeDir: fn,
    normalizeFigmaApiTokenRef: fn,
    normalizeCollectionList: fn,
    summarizeDesignSystemsConfig: fn,
    resolveSafeSystemPathsForDeletion: fn,
    repoRoot: '/repo',
    fsSync: {},
    getSystemContext: fn,
    isDevRuntime: fn,
    resolveRepoFilePath: fn,
    sha256Text: fn,
    readTextFileLimited: fn,
    findLineForQuery: fn,
    buildSnippet: fn,
    guessContentType: fn,
    MAX_FILE_BYTES: 450_000,
    queueJobs: new Map(),
    listQueueJobEvents: fn,
    queueJobSnapshot: fn,
    isQueueJobFinalStatus: fn,
    cancelQueueJob: fn,
    toQueueTerminalEvent: fn,
    buildApiErrorPayload: fn,
    MAX_RETAINED_EVENTS: 2_000,
    enqueueQueueJob: fn,
    runQueuedSpawnCommand: fn,
    queueNpmScript: fn,
    queueNodeJsonCommand: fn,
    toBooleanString: fn,
    toNumberString: fn,
    validateGitRef: fn,
    db: {} as any,
  };
}

describe('create-server-route-deps', () => {
  describe('buildCreateServerRouteDeps()', () => {
    it('preserves route wiring contract values', () => {
      const deps = createDeps();
      const wired = buildCreateServerRouteDeps(deps as any);

      assert.equal(wired.buildHealthPayload, deps.buildHealthPayload);
      assert.equal(wired.designSystemRepository, deps.designSystemRepository);
      assert.equal(wired.getSystemContext, deps.getSystemContext);
      assert.equal(wired.queueJobs, deps.queueJobs);
      assert.equal(wired.queueNpmScript, deps.queueNpmScript);
      assert.equal(wired.validateGitRef, deps.validateGitRef);
      assert.equal(wired.db, deps.db);
      assert.equal(wired.MAX_FILE_BYTES, deps.MAX_FILE_BYTES);
      assert.equal(wired.MAX_RETAINED_EVENTS, deps.MAX_RETAINED_EVENTS);
    });
  });
});
