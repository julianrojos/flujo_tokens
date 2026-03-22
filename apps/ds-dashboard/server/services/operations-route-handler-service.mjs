import {
  buildOperationsHistoryPayload,
  buildOperationsRegressionsPayload,
  buildReplayAcceptedPayload,
  buildReplayNotSupportedErrorArgs,
  ensureKnownSystemId,
  parseIncludeAllQuery,
  parseOperationsHistoryFilters,
  parseOperationsRegressionFilters,
  parseOperationsReplayRequest,
} from "./operations-route-service.mjs";
import {
  buildOperationHistoryReadArgs,
  buildOperationRegressionsArgs,
  buildReplayEnqueueArgs,
  resolveOperationsHistoryRequest,
  resolveOperationsRegressionsRequest,
  resolveOperationsReplayRequest,
} from "../lib/operations-route-handler-service.mjs";

export function handleOperationsHistoryRoute(c, deps) {
  const {
    failJson,
    toFiniteTimestamp,
    OPS_HISTORY_MAX_LIMIT,
    OPS_HISTORY_DEFAULT_LIMIT,
    designSystemRepository,
    readOperationHistory,
  } = deps;

  const parsedFilters = resolveOperationsHistoryRequest({
    parseOperationsHistoryFiltersFn: parseOperationsHistoryFilters,
    ensureKnownSystemIdFn: ensureKnownSystemId,
    config: designSystemRepository.getConfig(),
    filtersArgs: {
      systemFromQuery: c.req.query("system"),
      systemFromHeader: c.req.header("x-ds-system"),
      includeAll: parseIncludeAllQuery(c.req.query("all")),
      operation: c.req.query("operation"),
      status: c.req.query("status"),
      from: c.req.query("from"),
      to: c.req.query("to"),
      limitRaw: c.req.query("limit"),
      toFiniteTimestampFn: toFiniteTimestamp,
      historyMaxLimit: OPS_HISTORY_MAX_LIMIT,
      historyDefaultLimit: OPS_HISTORY_DEFAULT_LIMIT,
    },
  });
  if (!parsedFilters.ok) return failJson(c, parsedFilters.error.statusCode, parsedFilters.error.args);
  const history = readOperationHistory(buildOperationHistoryReadArgs(parsedFilters.filters));
  return c.json(buildOperationsHistoryPayload({ history, filters: parsedFilters.filters }));
}

export function handleOperationsRegressionsRoute(c, deps) {
  const {
    failJson,
    OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    designSystemRepository,
    buildOperationRegressionsReport,
  } = deps;

  const parsedFilters = resolveOperationsRegressionsRequest({
    parseOperationsRegressionFiltersFn: parseOperationsRegressionFilters,
    ensureKnownSystemIdFn: ensureKnownSystemId,
    config: designSystemRepository.getConfig(),
    filtersArgs: {
      systemFromQuery: c.req.query("system"),
      systemFromHeader: c.req.header("x-ds-system"),
      includeAll: parseIncludeAllQuery(c.req.query("all")),
      limitRaw: c.req.query("limit"),
      minSamplesRaw: c.req.query("minSamples"),
      regressionMaxLimit: OPS_REGRESSION_MAX_LIMIT,
      regressionDefaultLimit: OPS_REGRESSION_DEFAULT_LIMIT,
      regressionDefaultMinSamples: OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    },
  });
  if (!parsedFilters.ok) return failJson(c, parsedFilters.error.statusCode, parsedFilters.error.args);
  const report = buildOperationRegressionsReport(buildOperationRegressionsArgs(parsedFilters.filters));
  return c.json(buildOperationsRegressionsPayload({ report, filters: parsedFilters.filters }));
}

export async function handleOperationsReplayRoute(c, deps) {
  const {
    failJson,
    createApiRequestId,
    readJsonBody,
    normalizeSystemId,
    findOperationEventById,
    designSystemRepository,
    enqueueReplayJobFromOperation,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const body = await readJsonBody(c);
  const parsedReplay = resolveOperationsReplayRequest({
    parseOperationsReplayRequestFn: parseOperationsReplayRequest,
    requestId,
    replayArgs: {
      eventIdRaw: decodeURIComponent(String(c.req.param("eventId") || "")),
      bodySystemIdRaw: body.systemId,
      headerSystemId: c.req.header("x-ds-system"),
      normalizeSystemIdFn: normalizeSystemId,
      findOperationEventByIdFn: findOperationEventById,
      config: designSystemRepository.getConfig(),
    },
  });
  if (!parsedReplay.ok) {
    return failJson(c, parsedReplay.error.statusCode, parsedReplay.error.args);
  }

  const { eventId, sourceEvent, targetSystemId } = parsedReplay.payload;

  let job;
  try {
    job = enqueueReplayJobFromOperation(
      buildReplayEnqueueArgs({
        sourceEvent,
        targetSystemId,
        requestId,
        eventId,
      }),
    );
  } catch (error) {
    return failJson(
      c,
      409,
      buildReplayNotSupportedErrorArgs({
        eventId,
        sourceEvent,
        targetSystemId,
        error,
        requestId,
      }),
    );
  }

  return c.json(
    buildReplayAcceptedPayload({
      acceptedPayload: queueJobAcceptedPayload(job),
      eventId,
      sourceEvent,
      targetSystemId,
    }),
    202,
  );
}
