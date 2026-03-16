/**
 * Token Graph Routes
 *
 * Registers token graph and token usage index API routes.
 * Migrated from apps/ds-dashboard/server/routes/token-graph-routes.mjs
 */

import type { Context } from 'hono';

import {
    handleTokenGraphQueryRoute,
    handleTokenGraphRoute,
    handleTokenUsageIndexRoute,
} from '../services/token-graph-route-handler-service.ts';

// Using loose type for compatibility with SharedSystemContextDeps in register-all-routes-service
export interface TokenGraphRoutesDeps {
    failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
    getSystemContext: (systemHeader: string) => unknown;
}

/**
 * Register token graph routes on the Hono app.
 */
export function registerTokenGraphRoutes(
    app: { get: (path: string, handler: (c: Context) => unknown) => void },
    deps: TokenGraphRoutesDeps,
): void {
    app.get('/api/token-usage-index', (c: Context) => handleTokenUsageIndexRoute(c, deps));
    app.get('/api/token-graph', (c: Context) => handleTokenGraphRoute(c, deps));
    app.get('/api/token-graph-query', (c: Context) => handleTokenGraphQueryRoute(c, deps));
}
