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
    const systemFromQuery = String(c.req.query("system") || "").trim();
    const systemFromHeader = String(c.req.header("x-ds-system") || "").trim();
    const includeAll = String(c.req.query("all") || "").trim().toLowerCase() === "true";
    const systemId = includeAll ? "" : systemFromQuery || systemFromHeader;
    const operation = String(c.req.query("operation") || "").trim();
    const status = String(c.req.query("status") || "").trim().toLowerCase();
    const from = String(c.req.query("from") || "").trim();
    const to = String(c.req.query("to") || "").trim();
    const fromTs = from ? toFiniteTimestamp(from) : NaN;
    const toTs = to ? toFiniteTimestamp(to) : NaN;
    const limitRaw = Number.parseInt(String(c.req.query("limit") || ""), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, OPS_HISTORY_MAX_LIMIT))
      : OPS_HISTORY_DEFAULT_LIMIT;

    if (from && !Number.isFinite(fromTs)) {
      return failJson(c, 400, {
        code: "validation.invalid_date_format",
        userMessage: "Invalid 'from' date. Use an ISO-8601 value (for example 2026-02-24).",
        recoverable: true,
        context: { field: "from", value: from },
      });
    }

    if (to && !Number.isFinite(toTs)) {
      return failJson(c, 400, {
        code: "validation.invalid_date_format",
        userMessage: "Invalid 'to' date. Use an ISO-8601 value (for example 2026-02-24).",
        recoverable: true,
        context: { field: "to", value: to },
      });
    }

    if (Number.isFinite(fromTs) && Number.isFinite(toTs) && fromTs > toTs) {
      return failJson(c, 400, {
        code: "validation.invalid_date_range",
        userMessage: "'from' date must be earlier than or equal to 'to' date.",
        recoverable: true,
        context: { from, to },
      });
    }

    if (systemId) {
      const config = designSystemRepository.getConfig();
      const exists = (config.systems || []).some((row) => String(row?.id || "").trim() === systemId);
      if (!exists) {
        return failJson(c, 400, {
          code: "system.invalid_or_missing",
          userMessage: `Unknown system '${systemId}'.`,
          recoverable: true,
          context: { systemId },
        });
      }
    }

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
    const systemFromQuery = String(c.req.query("system") || "").trim();
    const systemFromHeader = String(c.req.header("x-ds-system") || "").trim();
    const includeAll = String(c.req.query("all") || "").trim().toLowerCase() === "true";
    const systemId = includeAll ? "" : systemFromQuery || systemFromHeader;
    const limitRaw = Number.parseInt(String(c.req.query("limit") || ""), 10);
    const minSamplesRaw = Number.parseInt(String(c.req.query("minSamples") || ""), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(20, Math.min(limitRaw, OPS_REGRESSION_MAX_LIMIT))
      : OPS_REGRESSION_DEFAULT_LIMIT;
    const minSamples = Number.isFinite(minSamplesRaw)
      ? Math.max(2, Math.min(minSamplesRaw, 20))
      : OPS_REGRESSION_DEFAULT_MIN_SAMPLES;

    if (systemId) {
      const config = designSystemRepository.getConfig();
      const exists = (config.systems || []).some((row) => String(row?.id || "").trim() === systemId);
      if (!exists) {
        return failJson(c, 400, {
          code: "system.invalid_or_missing",
          userMessage: `Unknown system '${systemId}'.`,
          recoverable: true,
          context: { systemId },
        });
      }
    }

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
    const eventId = decodeURIComponent(String(c.req.param("eventId") || "")).trim();
    if (!eventId) {
      return failJson(c, 400, {
        code: "validation.missing_required_fields",
        userMessage: "eventId is required.",
        recoverable: true,
        context: { field: "eventId" },
        requestId,
      });
    }

    const body = await readJsonBody(c);
    const overrideSystemId = normalizeSystemId(body.systemId);
    const sourceEventLookup = findOperationEventById({
      eventId,
      systemId: overrideSystemId || undefined,
    });
    if (!sourceEventLookup.event) {
      return failJson(c, 404, {
        code: "operations.event_not_found",
        userMessage: `Operation event '${eventId}' not found.`,
        recoverable: true,
        context: { eventId, scannedRows: sourceEventLookup.scannedRows },
        requestId,
      });
    }

    const sourceEvent = sourceEventLookup.event;
    const targetSystemId =
      overrideSystemId || String(sourceEvent.system || c.req.header("x-ds-system") || "").trim();
    if (!targetSystemId) {
      return failJson(c, 400, {
        code: "system.invalid_or_missing",
        userMessage: "Replay requires a valid target system.",
        recoverable: true,
        context: { eventId, operation: sourceEvent.operation },
        requestId,
      });
    }
    const config = designSystemRepository.getConfig();
    const hasTargetSystem = (config.systems || []).some(
      (row) => String(row?.id || "").trim() === targetSystemId,
    );
    if (!hasTargetSystem) {
      return failJson(c, 400, {
        code: "system.invalid_or_missing",
        userMessage: `Unknown system '${targetSystemId}'.`,
        recoverable: true,
        context: { targetSystemId, eventId },
        requestId,
      });
    }

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
