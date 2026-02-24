import { registerSystemRoutes } from "./system-routes.mjs";
import { registerOperationsRoutes } from "./operations-routes.mjs";
import { registerRegistryRoutes } from "./registry-routes.mjs";
import { registerTokenGraphRoutes } from "./token-graph-routes.mjs";
import { registerHealthRoutes } from "./health-routes.mjs";
import { registerAnalysisRoutes } from "./analysis-routes.mjs";
import { registerComponentSpecRoutes } from "./component-spec-routes.mjs";
import { registerFileRoutes } from "./file-routes.mjs";
import { registerJobRoutes } from "./job-routes.mjs";
import { registerCommandRoutes } from "./command-routes.mjs";

export function registerAllRoutes(app, deps) {
  registerSystemRoutes(app, {
    buildHealthPayload: deps.buildHealthPayload,
    failJson: deps.failJson,
    readJsonBody: deps.readJsonBody,
    designSystemRepository: deps.designSystemRepository,
    normalizeSystemId: deps.normalizeSystemId,
    ensureRelativeDir: deps.ensureRelativeDir,
    normalizeFigmaApiTokenRef: deps.normalizeFigmaApiTokenRef,
    normalizeCollectionList: deps.normalizeCollectionList,
    summarizeDesignSystemsConfig: deps.summarizeDesignSystemsConfig,
    resolveSafeSystemPathsForDeletion: deps.resolveSafeSystemPathsForDeletion,
    repoRoot: deps.repoRoot,
    fsSync: deps.fsSync,
  });

  registerOperationsRoutes(app, {
    failJson: deps.failJson,
    toFiniteTimestamp: deps.toFiniteTimestamp,
    OPS_HISTORY_MAX_LIMIT: deps.OPS_HISTORY_MAX_LIMIT,
    OPS_HISTORY_DEFAULT_LIMIT: deps.OPS_HISTORY_DEFAULT_LIMIT,
    OPS_REGRESSION_MAX_LIMIT: deps.OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT: deps.OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: deps.OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    designSystemRepository: deps.designSystemRepository,
    readOperationHistory: deps.readOperationHistory,
    buildOperationRegressionsReport: deps.buildOperationRegressionsReport,
    createApiRequestId: deps.createApiRequestId,
    readJsonBody: deps.readJsonBody,
    normalizeSystemId: deps.normalizeSystemId,
    findOperationEventById: deps.findOperationEventById,
    enqueueReplayJobFromOperation: deps.enqueueReplayJobFromOperation,
    queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
  });

  registerRegistryRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
  });

  registerTokenGraphRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
  });

  registerHealthRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
  });

  registerAnalysisRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
  });

  registerComponentSpecRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
    isDevRuntime: deps.isDevRuntime,
    readJsonBody: deps.readJsonBody,
    resolveRepoFilePath: deps.resolveRepoFilePath,
    sha256Text: deps.sha256Text,
  });

  registerFileRoutes(app, {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
    resolveRepoFilePath: deps.resolveRepoFilePath,
    readTextFileLimited: deps.readTextFileLimited,
    findLineForQuery: deps.findLineForQuery,
    buildSnippet: deps.buildSnippet,
    guessContentType: deps.guessContentType,
    MAX_FILE_BYTES: deps.MAX_FILE_BYTES,
  });

  registerJobRoutes(app, {
    failJson: deps.failJson,
    queueJobs: deps.queueJobs,
    listQueueJobEvents: deps.listQueueJobEvents,
    queueJobSnapshot: deps.queueJobSnapshot,
    isQueueJobFinalStatus: deps.isQueueJobFinalStatus,
    cancelQueueJob: deps.cancelQueueJob,
    toQueueTerminalEvent: deps.toQueueTerminalEvent,
    buildApiErrorPayload: deps.buildApiErrorPayload,
    MAX_RETAINED_EVENTS: deps.MAX_RETAINED_EVENTS,
  });

  registerCommandRoutes(app, {
    failJson: deps.failJson,
    createApiRequestId: deps.createApiRequestId,
    readJsonBody: deps.readJsonBody,
    getSystemContext: deps.getSystemContext,
    queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
    enqueueQueueJob: deps.enqueueQueueJob,
    sha256Text: deps.sha256Text,
    runQueuedSpawnCommand: deps.runQueuedSpawnCommand,
    queueNpmScript: deps.queueNpmScript,
    enqueueRefreshNamingDebtJob: deps.enqueueRefreshNamingDebtJob,
    queueNodeJsonCommand: deps.queueNodeJsonCommand,
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    validateGitRef: deps.validateGitRef,
  });
}
