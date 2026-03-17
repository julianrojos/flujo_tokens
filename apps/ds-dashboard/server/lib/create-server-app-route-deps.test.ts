/**
 * Create Server App Route Dependencies Tests
 *
 * Tests for app route dependencies builder.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCreateServerAppRouteDeps } from './create-server-app-route-deps.js';

function createConfig() {
  const fn = () => {};
  return {
    readJsonBody: fn,
    designSystemRepository: {},
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
    MAX_RETAINED_EVENTS: 2000,
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

describe('create-server-app-route-deps', () => {
  describe('buildCreateServerAppRouteDeps()', () => {
    it('preserves route source contract', () => {
      const config = createConfig();
      const deps = buildCreateServerAppRouteDeps(config);

      assert.equal(deps.readJsonBody, config.readJsonBody);
      assert.equal(deps.repoRoot, '/repo');
      assert.equal(deps.OPS_HISTORY_MAX_LIMIT, 500);
      assert.equal(deps.getSystemContext, config.getSystemContext);
      assert.equal(deps.MAX_FILE_BYTES, 450_000);
      assert.equal(deps.queueJobs, config.queueJobs);
      assert.equal(deps.enqueueQueueJob, config.enqueueQueueJob);
      assert.equal(deps.validateGitRef, config.validateGitRef);
    });
  });
});
