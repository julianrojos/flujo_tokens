/**
 * Token Usage Index Routes
 *
 * Registers the token usage index API route.
 */

import type { Context } from 'hono';

import { handleTokenUsageIndexRoute } from '../services/token-usage-index-route-handler-service.ts';

// Using loose type for compatibility with SharedSystemContextDeps in register-all-routes-service
export interface TokenUsageIndexRoutesDeps {
    failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
    getSystemContext: (systemHeader: string) => unknown;
    tokenRepo?: import('../db/token-repository.js').TokenRepository;
}

/** Register token usage index routes on the Hono app. */
export function registerTokenUsageIndexRoutes(
    app: { get: (path: string, handler: (c: Context) => unknown) => void },
    deps: TokenUsageIndexRoutesDeps,
): void {
    app.get('/api/token-usage-index', (c: Context) => handleTokenUsageIndexRoute(c, deps));
}
