/**
 * Error Middleware
 *
 * Registers unhandled error middleware for Hono apps.
 * Migrated from apps/ds-dashboard/server/lib/error-middleware.mjs
 */

import type { Context, ErrorHandler } from 'hono';

export interface ErrorMiddlewareDeps {
  createApiRequestId: () => string;
  writeStructuredLog: (level: string, payload: Record<string, unknown>) => void;
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown;
}

/**
 * Register unhandled error middleware.
 */
export function registerUnhandledErrorMiddleware(
  app: { onError: (handler: ErrorHandler) => void },
  deps: ErrorMiddlewareDeps
): void {
  const { createApiRequestId, writeStructuredLog, failJson } = deps;

  app.onError((error, c) => {
    const requestId = createApiRequestId();
    const message = error instanceof Error ? error.message : String(error);
    writeStructuredLog('error', {
      event: 'api.unhandled_error',
      requestId,
      code: 'internal.unexpected_error',
      path: c.req.path,
      method: c.req.method,
      error: {
        name: error instanceof Error ? error.name : 'UnknownError',
        message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    return failJson(c, 500, {
      code: 'internal.unexpected_error',
      userMessage: message || 'Unexpected server error.',
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
