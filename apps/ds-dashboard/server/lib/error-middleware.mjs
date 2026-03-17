export function registerUnhandledErrorMiddleware(app, deps) {
  const { createApiRequestId, writeStructuredLog, failJson } = deps;

  app.onError((error, c) => {
    const requestId = createApiRequestId();
    const message = error instanceof Error ? error.message : String(error);
    writeStructuredLog("error", {
      event: "api.unhandled_error",
      requestId,
      code: "internal.unexpected_error",
      path: c.req.path,
      method: c.req.method,
      error: {
        name: error instanceof Error ? error.name : "UnknownError",
        message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    return failJson(c, 500, {
      code: "internal.unexpected_error",
      userMessage: message || "Unexpected server error.",
      recoverable: true,
      requestId,
      context: {
        path: c.req.path,
        method: c.req.method,
      },
      suppressLog: true,
    });
  });
}
