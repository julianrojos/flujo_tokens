export function resolveOperationsHistoryRequest({
  parseOperationsHistoryFiltersFn,
  ensureKnownSystemIdFn,
  config,
  filtersArgs,
}) {
  const parsedFilters = parseOperationsHistoryFiltersFn(filtersArgs);
  if (!parsedFilters.ok) return parsedFilters;

  const systemValidation = ensureKnownSystemIdFn({
    config,
    systemId: parsedFilters.filters.systemId,
  });
  if (!systemValidation.ok) return systemValidation;

  return parsedFilters;
}

export function buildOperationHistoryReadArgs(filters) {
  return {
    systemId: filters.systemId || undefined,
    operation: filters.operation || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    limit: filters.limit,
  };
}

export function resolveOperationsRegressionsRequest({
  parseOperationsRegressionFiltersFn,
  ensureKnownSystemIdFn,
  config,
  filtersArgs,
}) {
  const parsedFilters = parseOperationsRegressionFiltersFn(filtersArgs);
  if (!parsedFilters.ok) return parsedFilters;

  const systemValidation = ensureKnownSystemIdFn({
    config,
    systemId: parsedFilters.filters.systemId,
  });
  if (!systemValidation.ok) return systemValidation;

  return parsedFilters;
}

export function buildOperationRegressionsArgs(filters) {
  return {
    systemId: filters.systemId || undefined,
    limit: filters.limit,
    minSamples: filters.minSamples,
  };
}

export function resolveOperationsReplayRequest({
  parseOperationsReplayRequestFn,
  replayArgs,
  requestId,
}) {
  const parsedReplay = parseOperationsReplayRequestFn(replayArgs);
  if (parsedReplay.ok) return parsedReplay;

  return {
    ...parsedReplay,
    error: {
      ...parsedReplay.error,
      args: {
        ...parsedReplay.error.args,
        requestId,
      },
    },
  };
}

export function buildReplayEnqueueArgs({ sourceEvent, targetSystemId, requestId, eventId }) {
  return {
    operation: sourceEvent.operation,
    systemId: targetSystemId,
    requestId,
    sourceEventId: eventId,
  };
}
