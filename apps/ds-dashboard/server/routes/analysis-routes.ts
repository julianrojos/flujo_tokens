/**
 * Analysis Routes
 *
 * Registers analysis-related API routes.
 * Migrated from apps/ds-dashboard/server/routes/analysis-routes.mjs
 */

import type { Context } from 'hono';

import {
  handleImpactRoute,
  type AnalysisRouteHandlerDeps,
} from '../services/analysis-route-handler-service.ts';

// Compatibility alias: keep the routes-level type name while sharing handler deps.
export type AnalysisRoutesDeps = AnalysisRouteHandlerDeps;

/**
 * Register analysis routes on the Hono app.
 */
export function registerAnalysisRoutes(
  app: { get: (path: string, handler: (c: Context) => any) => void },
  deps: AnalysisRouteHandlerDeps
): void {
  app.get('/api/impact', (c: Context) => handleImpactRoute(c, deps));
}
