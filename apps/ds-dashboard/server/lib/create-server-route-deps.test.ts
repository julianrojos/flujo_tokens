/**
 * Create Server Route Dependencies Tests
 *
 * Tests for route dependencies builder.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCreateServerRouteDeps } from './create-server-route-deps.js';

function createDeps() {
  const fn = () => {};
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
    toFiniteTimestamp: fn,
    OPS_HISTORY_MAX_LIMIT: 500,
    OPS_HISTORY_DEFAULT_LIMIT: 100,
    OPS_REGRESSION_MAX_LIMIT: 500,
    OPS_REGRESSION_DEFAULT_LIMIT: 300,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: 4,
    readOperationHistory: fn,
    buildOperationRegressionsReport: fn,
    createApiRequestId: fn,
    findOperationEventById: fn,
    enqueueReplayJobFromOperation: fn,
    queueJobAcceptedPayload: fn,
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
    enqueueRefreshNamingDebtJob: fn,
    queueNodeJsonCommand: fn,
    toBooleanString: fn,
    toNumberString: fn,
    validateGitRef: fn,
  };
}

describe('create-server-route-deps', () => {
  describe('buildCreateServerRouteDeps()', () => {
    it('preserves route wiring contract values', () => {
      const deps = createDeps();
      const wired = buildCreateServerRouteDeps(deps);

      assert.equal(wired.buildHealthPayload, deps.buildHealthPayload);
      assert.equal(wired.designSystemRepository, deps.designSystemRepository);
      assert.equal(wired.OPS_HISTORY_MAX_LIMIT, deps.OPS_HISTORY_MAX_LIMIT);
      assert.equal(wired.getSystemContext, deps.getSystemContext);
      assert.equal(wired.queueJobs, deps.queueJobs);
      assert.equal(wired.queueNpmScript, deps.queueNpmScript);
      assert.equal(wired.validateGitRef, deps.validateGitRef);
      assert.equal(wired.MAX_FILE_BYTES, deps.MAX_FILE_BYTES);
      assert.equal(wired.MAX_RETAINED_EVENTS, deps.MAX_RETAINED_EVENTS);
    });
  });
});
