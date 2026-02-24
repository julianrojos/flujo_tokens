export function nowIso() {
  return new Date().toISOString();
}

function createPrefixedId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createOperationEventId() {
  return createPrefixedId("op");
}

export function createApiRequestId() {
  return createPrefixedId("req");
}

export function writeStructuredLog(level, payload) {
  const base = {
    level,
    ts: Date.now(),
    service: "ds-dashboard-api",
  };
  const line = JSON.stringify({ ...base, ...(payload && typeof payload === "object" ? payload : {}) });
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

export function buildApiErrorPayload(
  { code, userMessage, recoverable = false, context, requestId },
  createRequestId = createApiRequestId,
) {
  const safeMessage = String(userMessage || "Request failed.");
  const safeCode = String(code || "internal.unknown_error");
  const safeRequestId = String(requestId || createRequestId());
  const payload = {
    ok: false,
    message: safeMessage,
    requestId: safeRequestId,
    error: {
      code: safeCode,
      userMessage: safeMessage,
      recoverable: recoverable === true,
    },
  };
  if (context && typeof context === "object" && !Array.isArray(context)) {
    payload.error.context = context;
  }
  return payload;
}

export function createFailJson({
  createRequestId = createApiRequestId,
  buildApiErrorPayloadFn = (args) => buildApiErrorPayload(args, createRequestId),
  writeStructuredLogFn = writeStructuredLog,
} = {}) {
  return function failJson(c, statusCode, args) {
    const requestId = String(args?.requestId || createRequestId());
    const payload = buildApiErrorPayloadFn({
      ...args,
      requestId,
    });
    if (args?.suppressLog !== true) {
      writeStructuredLogFn(statusCode >= 500 ? "error" : "warn", {
        event: "api.error",
        requestId,
        code: payload?.error?.code || "internal.unknown_error",
        statusCode,
        recoverable: payload?.error?.recoverable === true,
        path: c?.req?.path,
        method: c?.req?.method,
        context: payload?.error?.context || null,
      });
    }
    return c.json(payload, statusCode);
  };
}

export function createHealthPayloadBuilder({
  queueMetrics,
  nowIsoFn = nowIso,
  processUptime = () => process.uptime(),
  serviceName = "ds-dashboard-api",
}) {
  return function buildHealthPayload() {
    return {
      status: "ok",
      service: serviceName,
      now: nowIsoFn(),
      uptime: processUptime(),
      queue: queueMetrics(),
    };
  };
}
