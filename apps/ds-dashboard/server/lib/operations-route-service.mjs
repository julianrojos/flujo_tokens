function toTrimmed(value) {
  return String(value || "").trim();
}

function toLowerTrimmed(value) {
  return toTrimmed(value).toLowerCase();
}

function parseLimitedInt(rawValue, { fallback, min, max }) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

export function ensureKnownSystemId({ config, systemId }) {
  if (!systemId) return { ok: true };
  const exists = (config?.systems || []).some((row) => toTrimmed(row?.id) === systemId);
  if (exists) return { ok: true };
  return {
    ok: false,
    error: {
      statusCode: 400,
      args: {
        code: "system.invalid_or_missing",
        userMessage: `Unknown system '${systemId}'.`,
        recoverable: true,
        context: { systemId },
      },
    },
  };
}

export function parseOperationsHistoryFilters(args) {
  const {
    systemFromQuery,
    systemFromHeader,
    includeAll,
    operation,
    status,
    from,
    to,
    limitRaw,
    toFiniteTimestampFn,
    historyMaxLimit,
    historyDefaultLimit,
  } = args;

  const scopedSystemId = includeAll ? "" : toTrimmed(systemFromQuery) || toTrimmed(systemFromHeader);
  const fromValue = toTrimmed(from);
  const toValue = toTrimmed(to);
  const fromTs = fromValue ? toFiniteTimestampFn(fromValue) : NaN;
  const toTs = toValue ? toFiniteTimestampFn(toValue) : NaN;
  const limit = parseLimitedInt(limitRaw, {
    fallback: historyDefaultLimit,
    min: 1,
    max: historyMaxLimit,
  });

  if (fromValue && !Number.isFinite(fromTs)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "validation.invalid_date_format",
          userMessage: "Invalid 'from' date. Use an ISO-8601 value (for example 2026-02-24).",
          recoverable: true,
          context: { field: "from", value: fromValue },
        },
      },
    };
  }

  if (toValue && !Number.isFinite(toTs)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "validation.invalid_date_format",
          userMessage: "Invalid 'to' date. Use an ISO-8601 value (for example 2026-02-24).",
          recoverable: true,
          context: { field: "to", value: toValue },
        },
      },
    };
  }

  if (Number.isFinite(fromTs) && Number.isFinite(toTs) && fromTs > toTs) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "validation.invalid_date_range",
          userMessage: "'from' date must be earlier than or equal to 'to' date.",
          recoverable: true,
          context: { from: fromValue, to: toValue },
        },
      },
    };
  }

  return {
    ok: true,
    filters: {
      systemId: scopedSystemId,
      operation: toTrimmed(operation),
      status: toLowerTrimmed(status),
      from: fromValue,
      to: toValue,
      limit,
    },
  };
}

export function parseOperationsRegressionFilters(args) {
  const {
    systemFromQuery,
    systemFromHeader,
    includeAll,
    limitRaw,
    minSamplesRaw,
    regressionMaxLimit,
    regressionDefaultLimit,
    regressionDefaultMinSamples,
  } = args;

  const scopedSystemId = includeAll ? "" : toTrimmed(systemFromQuery) || toTrimmed(systemFromHeader);
  const limit = parseLimitedInt(limitRaw, {
    fallback: regressionDefaultLimit,
    min: 20,
    max: regressionMaxLimit,
  });
  const minSamples = parseLimitedInt(minSamplesRaw, {
    fallback: regressionDefaultMinSamples,
    min: 2,
    max: 20,
  });

  return {
    ok: true,
    filters: {
      systemId: scopedSystemId,
      limit,
      minSamples,
    },
  };
}

export function parseOperationsReplayRequest(args) {
  const {
    eventIdRaw,
    bodySystemIdRaw,
    headerSystemId,
    normalizeSystemIdFn,
    findOperationEventByIdFn,
    config,
  } = args;

  const eventId = toTrimmed(eventIdRaw);
  if (!eventId) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "validation.missing_required_fields",
          userMessage: "eventId is required.",
          recoverable: true,
          context: { field: "eventId" },
        },
      },
    };
  }

  const overrideSystemId = normalizeSystemIdFn(bodySystemIdRaw);
  const sourceEventLookup = findOperationEventByIdFn({
    eventId,
    systemId: overrideSystemId || undefined,
  });
  if (!sourceEventLookup.event) {
    return {
      ok: false,
      error: {
        statusCode: 404,
        args: {
          code: "operations.event_not_found",
          userMessage: `Operation event '${eventId}' not found.`,
          recoverable: true,
          context: { eventId, scannedRows: sourceEventLookup.scannedRows },
        },
      },
    };
  }

  const sourceEvent = sourceEventLookup.event;
  const targetSystemId =
    overrideSystemId || toTrimmed(sourceEvent.system) || toTrimmed(headerSystemId);
  if (!targetSystemId) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "system.invalid_or_missing",
          userMessage: "Replay requires a valid target system.",
          recoverable: true,
          context: { eventId, operation: sourceEvent.operation },
        },
      },
    };
  }

  const hasTargetSystem = (config?.systems || []).some((row) => toTrimmed(row?.id) === targetSystemId);
  if (!hasTargetSystem) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "system.invalid_or_missing",
          userMessage: `Unknown system '${targetSystemId}'.`,
          recoverable: true,
          context: { targetSystemId, eventId },
        },
      },
    };
  }

  return {
    ok: true,
    payload: {
      eventId,
      sourceEvent,
      targetSystemId,
    },
  };
}
