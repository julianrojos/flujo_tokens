import {
  ensureKnownSystemId,
  parseOperationsHistoryFilters,
  parseOperationsRegressionFilters,
  parseOperationsReplayRequest,
} from "../lib/operations-route-service.mjs";

export function registerOperationsRoutes(app, deps) {
  const {
    failJson,
    toFiniteTimestamp,
    OPS_HISTORY_MAX_LIMIT,
    OPS_HISTORY_DEFAULT_LIMIT,
    OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    designSystemRepository,
    readOperationHistory,
    buildOperationRegressionsReport,
    createApiRequestId,
    readJsonBody,
    normalizeSystemId,
    findOperationEventById,
    enqueueReplayJobFromOperation,
    queueJobAcceptedPayload,
  } = deps;

  app.get("/api/operations/history", async (c) => {
    const parsedFilters = parseOperationsHistoryFilters({
      systemFromQuery: c.req.query("system"),
      systemFromHeader: c.req.header("x-ds-system"),
      includeAll: String(c.req.query("all") || "").trim().toLowerCase() === "true",
      operation: c.req.query("operation"),
      status: c.req.query("status"),
      from: c.req.query("from"),
      to: c.req.query("to"),
      limitRaw: c.req.query("limit"),
      toFiniteTimestampFn: toFiniteTimestamp,
      historyMaxLimit: OPS_HISTORY_MAX_LIMIT,
      historyDefaultLimit: OPS_HISTORY_DEFAULT_LIMIT,
    });
    if (!parsedFilters.ok) {
      return failJson(c, parsedFilters.error.statusCode, parsedFilters.error.args);
    }

    const systemValidation = ensureKnownSystemId({
      config: designSystemRepository.getConfig(),
      systemId: parsedFilters.filters.systemId,
    });
    if (!systemValidation.ok) {
      return failJson(c, systemValidation.error.statusCode, systemValidation.error.args);
    }

    const { systemId, operation, status, from, to, limit } = parsedFilters.filters;

    const history = readOperationHistory({
      systemId: systemId || undefined,
      operation: operation || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      limit,
    });

    return c.json({
      ok: true,
      events: history.events,
      filters: {
        systemId: systemId || null,
        operation: operation || null,
        status: status || null,
        from: from || null,
        to: to || null,
        limit,
      },
      summary: {
        returned: history.events.length,
        scannedRows: history.scannedRows,
        scannedFiles: history.scannedFiles,
      },
    });
  });

  app.get("/api/operations/regressions", async (c) => {
    const parsedFilters = parseOperationsRegressionFilters({
      systemFromQuery: c.req.query("system"),
      systemFromHeader: c.req.header("x-ds-system"),
      includeAll: String(c.req.query("all") || "").trim().toLowerCase() === "true",
      limitRaw: c.req.query("limit"),
      minSamplesRaw: c.req.query("minSamples"),
      regressionMaxLimit: OPS_REGRESSION_MAX_LIMIT,
      regressionDefaultLimit: OPS_REGRESSION_DEFAULT_LIMIT,
      regressionDefaultMinSamples: OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    });
    if (!parsedFilters.ok) {
      return failJson(c, parsedFilters.error.statusCode, parsedFilters.error.args);
    }

    const systemValidation = ensureKnownSystemId({
      config: designSystemRepository.getConfig(),
      systemId: parsedFilters.filters.systemId,
    });
    if (!systemValidation.ok) {
      return failJson(c, systemValidation.error.statusCode, systemValidation.error.args);
    }

    const { systemId, limit, minSamples } = parsedFilters.filters;

    const report = buildOperationRegressionsReport({
      systemId: systemId || undefined,
      limit,
      minSamples,
    });

    return c.json({
      ok: true,
      generatedAt: report.generatedAt,
      regressions: report.regressions,
      filters: {
        systemId: systemId || null,
        limit,
        minSamples,
      },
      summary: report.summary,
    });
  });

  app.post("/api/operations/replay/:eventId", async (c) => {
    const requestId = createApiRequestId();
    const body = await readJsonBody(c);
    const parsedReplay = parseOperationsReplayRequest({
      eventIdRaw: decodeURIComponent(String(c.req.param("eventId") || "")),
      bodySystemIdRaw: body.systemId,
      headerSystemId: c.req.header("x-ds-system"),
      normalizeSystemIdFn: normalizeSystemId,
      findOperationEventByIdFn: findOperationEventById,
      config: designSystemRepository.getConfig(),
    });
    if (!parsedReplay.ok) {
      return failJson(c, parsedReplay.error.statusCode, {
        ...parsedReplay.error.args,
        requestId,
      });
    }

    const { eventId, sourceEvent, targetSystemId } = parsedReplay.payload;

    let job;
    try {
      job = enqueueReplayJobFromOperation({
        operation: sourceEvent.operation,
        systemId: targetSystemId,
        requestId,
        sourceEventId: eventId,
      });
    } catch (error) {
      return failJson(c, 409, {
        code: "operations.replay_not_supported",
        userMessage: error instanceof Error ? error.message : String(error),
        recoverable: true,
        context: {
          eventId,
          operation: sourceEvent.operation,
          sourceSystem: sourceEvent.system || null,
          targetSystem: targetSystemId,
        },
        requestId,
      });
    }

    return c.json(
      {
        ...queueJobAcceptedPayload(job),
        replay: {
          sourceEventId: eventId,
          sourceOperation: sourceEvent.operation,
          sourceSystem: sourceEvent.system || null,
          targetSystem: targetSystemId,
        },
      },
      202,
    );
  });
}
