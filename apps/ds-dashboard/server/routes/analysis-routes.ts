/**
 * Analysis Routes
 *
 * Registers analysis-related API routes.
 * Migrated from apps/ds-dashboard/server/routes/analysis-routes.mjs
 */

import type { Context } from 'hono';

import {
  handleImpactRoute,
  handleNamingDebtRoute,
} from '../services/analysis-route-handler-service.ts';

export interface AnalysisRoutesDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => any;
  getSystemContext: (systemHeader: string) => any;
}

/**
 * Register analysis routes on the Hono app.
 */
export function registerAnalysisRoutes(
  app: { get: (path: string, handler: (c: Context) => any) => void },
  deps: AnalysisRoutesDeps
): void {
  app.get('/api/naming-debt', (c: Context) => handleNamingDebtRoute(c, deps));
  app.get('/api/impact', (c: Context) => handleImpactRoute(c, deps));
}
