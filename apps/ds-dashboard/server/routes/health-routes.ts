/**
 * Health Routes
 *
 * Registers health-related API routes.
 */

import type { Context } from 'hono';

import {
  handleHealthHistoryRoute,
  handleTokenHealthRoute,
} from '../services/health-route-handler-service.ts';

export interface HealthRoutesDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: Record<string, unknown>,
  ) => unknown;
  getSystemContext: (systemHeader: string) => unknown;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
}

/**
 * Register health routes on the Hono app.
 */
export function registerHealthRoutes(
  app: { get: (path: string, handler: (c: Context) => unknown) => void },
  deps: HealthRoutesDeps,
): void {
  app.get('/api/token-health', (c: Context) => handleTokenHealthRoute(c, deps));
  app.get('/api/health-history', (c: Context) =>
    handleHealthHistoryRoute(c, deps),
  );
}
