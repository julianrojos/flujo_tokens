import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationHistoryReadArgs,
  buildOperationRegressionsArgs,
  buildReplayEnqueueArgs,
  resolveOperationsHistoryRequest,
  resolveOperationsRegressionsRequest,
  resolveOperationsReplayRequest,
} from "./operations-route-handler-service.mjs";

test("operations-route-handler-service: history resolver validates filters and system", () => {
  const parsed = resolveOperationsHistoryRequest({
    parseOperationsHistoryFiltersFn: () => ({ ok: true, filters: { systemId: "core", limit: 10 } }),
    ensureKnownSystemIdFn: () => ({ ok: true }),
    config: { systems: [{ id: "core" }] },
    filtersArgs: {},
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.filters.systemId, "core");

  const invalid = resolveOperationsHistoryRequest({
    parseOperationsHistoryFiltersFn: () => ({
      ok: false,
      error: { statusCode: 400, args: { code: "validation.invalid_date_format" } },
    }),
    ensureKnownSystemIdFn: () => ({ ok: true }),
    config: {},
    filtersArgs: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.args.code, "validation.invalid_date_format");
});

test("operations-route-handler-service: regressions resolver validates system", () => {
  const invalid = resolveOperationsRegressionsRequest({
    parseOperationsRegressionFiltersFn: () => ({ ok: true, filters: { systemId: "missing" } }),
    ensureKnownSystemIdFn: () => ({
      ok: false,
      error: { statusCode: 400, args: { code: "system.invalid_or_missing" } },
    }),
    config: {},
    filtersArgs: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.args.code, "system.invalid_or_missing");
});

test("operations-route-handler-service: read arg builders normalize empty strings", () => {
  const historyArgs = buildOperationHistoryReadArgs({
    systemId: "",
    operation: "",
    status: "",
    from: "",
    to: "",
    limit: 100,
  });
  assert.equal(historyArgs.systemId, undefined);
  assert.equal(historyArgs.operation, undefined);
  assert.equal(historyArgs.limit, 100);

  const regressionArgs = buildOperationRegressionsArgs({
    systemId: "",
    limit: 200,
    minSamples: 4,
  });
  assert.equal(regressionArgs.systemId, undefined);
  assert.equal(regressionArgs.minSamples, 4);
});

test("operations-route-handler-service: replay resolver attaches requestId on errors", () => {
  const invalid = resolveOperationsReplayRequest({
    parseOperationsReplayRequestFn: () => ({
      ok: false,
      error: { statusCode: 404, args: { code: "operations.event_not_found" } },
    }),
    replayArgs: {},
    requestId: "req_1",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.args.requestId, "req_1");

  const enqueueArgs = buildReplayEnqueueArgs({
    sourceEvent: { operation: "run:generate" },
    targetSystemId: "core",
    requestId: "req_1",
    eventId: "evt_1",
  });
  assert.deepEqual(enqueueArgs, {
    operation: "run:generate",
    systemId: "core",
    requestId: "req_1",
    sourceEventId: "evt_1",
  });
});
