import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApiErrorPayload,
  createApiRequestId,
  createFailJson,
  createHealthPayloadBuilder,
  createOperationEventId,
} from "./api-response-service.mjs";

test("api-response-service: id helpers preserve prefixes", () => {
  assert.match(createApiRequestId(), /^req_/);
  assert.match(createOperationEventId(), /^op_/);
});

test("api-response-service: buildApiErrorPayload sets defaults and context", () => {
  const payload = buildApiErrorPayload({
    userMessage: "Bad request",
    code: "request.bad",
    recoverable: true,
    context: { path: "/api/test" },
    requestId: "req_123",
  });

  assert.deepEqual(payload, {
    ok: false,
    message: "Bad request",
    requestId: "req_123",
    error: {
      code: "request.bad",
      userMessage: "Bad request",
      recoverable: true,
      context: { path: "/api/test" },
    },
  });
});

test("api-response-service: failJson emits payload and logs unless suppressed", () => {
  const logEvents = [];
  const failJson = createFailJson({
    createRequestId: () => "req_fixed",
    writeStructuredLogFn: (level, payload) => {
      logEvents.push({ level, payload });
    },
  });

  const ctx = {
    req: { path: "/api/demo", method: "POST" },
    json(payload, status) {
      return { payload, status };
    },
  };

  const result = failJson(ctx, 400, {
    code: "request.invalid",
    userMessage: "Invalid payload",
    recoverable: true,
  });

  assert.equal(result.status, 400);
  assert.equal(result.payload.requestId, "req_fixed");
  assert.equal(logEvents.length, 1);
  assert.equal(logEvents[0].level, "warn");
  assert.equal(logEvents[0].payload.path, "/api/demo");
  assert.equal(logEvents[0].payload.method, "POST");
});

test("api-response-service: health payload builder uses injected dependencies", () => {
  const buildHealthPayload = createHealthPayloadBuilder({
    queueMetrics: () => ({ active: 1, pending: 2 }),
    nowIsoFn: () => "2026-01-01T00:00:00.000Z",
    processUptime: () => 42,
  });

  assert.deepEqual(buildHealthPayload(), {
    status: "ok",
    service: "ds-dashboard-api",
    now: "2026-01-01T00:00:00.000Z",
    uptime: 42,
    queue: { active: 1, pending: 2 },
  });
});
