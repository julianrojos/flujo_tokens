/**
 * Health Routes
 *
 * Registers health-related API routes.
 * Migrated from apps/ds-dashboard/server/routes/health-routes.mjs
 */

import type { Context } from 'hono';

import {
  handleComponentsHealthRoute,
  handleHealthHistoryRoute,
  handleTokenHealthRoute,
} from '../services/health-route-handler-service.ts';

export interface HealthRoutesDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => any;
  getSystemContext: (systemHeader: string) => any;
}

/**
 * Register health routes on the Hono app.
 */
export function registerHealthRoutes(
  app: { get: (path: string, handler: (c: Context) => any) => void },
  deps: HealthRoutesDeps
): void {
  app.get('/api/token-health', (c: Context) => handleTokenHealthRoute(c, deps));
  app.get('/api/components-health', (c: Context) => handleComponentsHealthRoute(c, deps));
  app.get('/api/health-history', (c: Context) => handleHealthHistoryRoute(c, deps));
}
